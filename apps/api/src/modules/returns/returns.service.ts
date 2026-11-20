import { fromPiasters, toPiasters } from '@cosmo/shared';
import type { Trx } from '../../core/db';
import { AppError, errors } from '../../core/errors';
import { logActivity } from '../../core/activity';
import { notify, usersWithRoles } from '../../core/notifications';
import { nextNumber } from '../../core/numbers';
import type { AuthContext } from '../../core/context';
import { receiveCustomerReturn } from '../stock/stock.service';
import { invoiceOf, recalcInvoice } from '../billing/billing.service';
import { unitCredit } from '../delivery/delivery.service';

// Customer returns and refunds (docs/workflows/06-returns.md)

const changed = (en: string, ar: string) => new AppError(409, 'STATUS_CHANGED', { en, ar });

// SAL-05: an employee starts a return from a delivered order (C-19, C-62). No time limit (C-82).
export async function createReturn(
  trx: Trx,
  ctx: AuthContext,
  input: { orderId: string; reason: string; note?: string | null; lines: Array<{ orderLineId: string; quantity: number }> },
) {
  const o = await trx.selectFrom('orders').select(['id', 'status', 'customer_id', 'order_number']).where('id', '=', input.orderId).forUpdate().executeTakeFirst();
  if (!o) throw errors.notFound();
  if (o.status !== 'delivered') throw errors.rule({ en: 'Only delivered orders can have a return', ar: 'يمكن إرجاع الطلبات المسلمة فقط' });
  const inv = await invoiceOf(trx, o.id);
  if (!inv) throw errors.rule({ en: 'This order has no invoice yet', ar: 'هذا الطلب ليس له فاتورة بعد' });
  const lines = await trx.selectFrom('order_lines').selectAll().where('order_id', '=', o.id).execute();
  const picks = await trx.selectFrom('picks').selectAll().where('order_line_id', 'in', lines.map((l) => l.id)).execute();
  const earlier = await trx
    .selectFrom('customer_return_lines as rl')
    .innerJoin('customer_returns as r', 'r.id', 'rl.customer_return_id')
    .select(['rl.order_line_id', 'rl.batch_id', 'rl.quantity'])
    .where('r.order_id', '=', o.id)
    .where('r.status', '<>', 'cancelled')
    .execute();

  const out: Array<{ order_line_id: string; product_id: string; batch_id: string; quantity: number; unit: number }> = [];
  for (const r of input.lines) {
    const l = lines.find((x) => x.id === r.orderLineId);
    if (!l) throw errors.notFound();
    const units = l.current_qty + l.bonus_qty;
    const already = earlier.filter((e) => e.order_line_id === l.id).reduce((s, e) => s + e.quantity, 0);
    // Never more than was delivered, minus earlier returns
    if (r.quantity > units - already) {
      throw errors.rule({ en: `Only ${units - already} can still be returned`, ar: `يمكن إرجاع ${units - already} فقط` }, { orderLineId: l.id, max: units - already });
    }
    // The units go back to the batches they were picked from
    let left = r.quantity;
    for (const p of picks.filter((x) => x.order_line_id === l.id)) {
      const usedFromBatch = earlier.filter((e) => e.batch_id === p.batch_id && e.order_line_id === l.id).reduce((s, e) => s + e.quantity, 0);
      const free = p.quantity - usedFromBatch;
      if (left <= 0 || free <= 0) continue;
      const q = Math.min(left, free);
      out.push({ order_line_id: l.id, product_id: l.product_id, batch_id: p.batch_id, quantity: q, unit: unitCredit(l.line_total, units) });
      left -= q;
    }
  }
  const credit = out.reduce((s, l) => s + l.unit * l.quantity, 0);
  const ret = await trx
    .insertInto('customer_returns')
    .values({
      wholesaler_id: ctx.wholesalerId,
      return_number: await nextNumber(trx, ctx.wholesalerId, 'customer_return', 'RET'),
      order_id: o.id,
      invoice_id: inv.id,
      customer_id: o.customer_id,
      source: 'normal',
      reason: input.reason,
      note: input.note ?? null,
      credit_amount: fromPiasters(credit),
      created_by: ctx.userId,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  await trx
    .insertInto('customer_return_lines')
    .values(out.map((l) => ({ wholesaler_id: ctx.wholesalerId, customer_return_id: ret.id, order_line_id: l.order_line_id, product_id: l.product_id, batch_id: l.batch_id, quantity: l.quantity, unit_credit: fromPiasters(l.unit), line_credit: fromPiasters(l.unit * l.quantity) })))
    .execute();
  await logActivity(trx, ctx, { action: 'return_created', entityType: 'customer_return', entityId: ret.id, reason: input.note ?? input.reason, details: { order: o.order_number, credit: fromPiasters(credit) } });
  await notify(trx, ctx.wholesalerId, (await usersWithRoles(trx, ['stock_manager'])).filter((u) => u !== ctx.userId), {
    type: 'return_expected',
    title: { en: `A return for ${o.order_number} is expected`, ar: `مرتجع متوقع للطلب ${o.order_number}` },
    entityType: 'customer_return',
    entityId: ret.id,
  });
  return ret.id;
}

// STK-13: the stock manager checks each line. Then the credit is applied (C-60, C-69).
export async function checkReturn(trx: Trx, ctx: AuthContext, id: string, conditions: Array<{ lineId: string; condition: 'sellable' | 'damaged' }>) {
  const r = await trx.selectFrom('customer_returns').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
  if (!r) throw errors.notFound();
  if (r.status !== 'requested') throw changed('This return was already checked', 'تم فحص هذا المرتجع بالفعل');
  const lines = await trx.selectFrom('customer_return_lines').selectAll().where('customer_return_id', '=', id).execute();
  for (const l of lines) {
    const c = conditions.find((x) => x.lineId === l.id);
    if (!c) throw errors.validation({ fields: { [`lines.${l.id}`]: 'condition_required' } });
    await receiveCustomerReturn(trx, ctx, { productId: l.product_id, batchId: l.batch_id, quantity: l.quantity, condition: c.condition, documentId: id });
    await trx.updateTable('customer_return_lines').set({ condition: c.condition }).where('id', '=', l.id).execute();
  }

  let applied = toPiasters(r.applied_to_invoice);
  let leftOver = 0;
  if (r.source === 'normal' && r.invoice_id) {
    // The return first reduces what is still unpaid on its invoice (C-69)
    const inv = await trx.selectFrom('invoices').selectAll().where('id', '=', r.invoice_id).forUpdate().executeTakeFirstOrThrow();
    const unpaid = Math.max(0, toPiasters(inv.total) - toPiasters(inv.confirmed_paid) - toPiasters(inv.return_credit));
    applied = Math.min(unpaid, toPiasters(r.credit_amount));
    leftOver = toPiasters(r.credit_amount) - applied;
  }
  await trx
    .updateTable('customer_returns')
    .set({ status: 'completed', checked_by: ctx.userId, completed_at: new Date(), applied_to_invoice: fromPiasters(applied), left_over: fromPiasters(leftOver) })
    .where('id', '=', id)
    .execute();
  if (r.invoice_id) await recalcInvoice(trx, r.invoice_id);

  await logActivity(trx, ctx, { action: 'return_completed', entityType: 'customer_return', entityId: id, details: { number: r.return_number, credit: r.credit_amount, leftOver: fromPiasters(leftOver) }, important: true });
  // C-83: the owner gets an alert for every completed return
  await notify(trx, ctx.wholesalerId, (await usersWithRoles(trx, ['owner', ...(leftOver > 0 ? (['accountant'] as const) : [])])).filter((u) => u !== ctx.userId), {
    type: 'return_completed',
    title: { en: `Return ${r.return_number} completed: ${r.credit_amount} EGP`, ar: `اكتمل المرتجع ${r.return_number}: ${r.credit_amount} جنيه` },
    body: leftOver > 0 ? { en: `${fromPiasters(leftOver)} EGP left over: refund or keep as credit`, ar: `متبقي ${fromPiasters(leftOver)} جنيه: يُرد أو يبقى رصيداً` } : undefined,
    entityType: 'customer_return',
    entityId: id,
  });
  const customer = await trx.selectFrom('customers').select('user_id').where('id', '=', r.customer_id).executeTakeFirstOrThrow();
  await notify(trx, ctx.wholesalerId, [customer.user_id], {
    type: 'return_completed',
    title: { en: `Your return ${r.return_number} was completed`, ar: `اكتمل مرتجعك ${r.return_number}` },
    body: { en: `Credit: ${r.credit_amount} EGP`, ar: `الرصيد: ${r.credit_amount} جنيه` },
    entityType: 'customer_return',
    entityId: id,
  });
}

export async function cancelReturn(trx: Trx, ctx: AuthContext, id: string) {
  const r = await trx.selectFrom('customer_returns').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
  if (!r) throw errors.notFound();
  if (r.status !== 'requested' || r.source !== 'normal') throw changed('This return can no longer be cancelled', 'لا يمكن إلغاء هذا المرتجع الآن');
  await trx.updateTable('customer_returns').set({ status: 'cancelled' }).where('id', '=', id).execute();
  await logActivity(trx, ctx, { action: 'return_cancelled', entityType: 'customer_return', entityId: id });
}

async function refunded(trx: Trx, returnId: string) {
  const r = await trx.selectFrom('refunds').select((eb) => eb.fn.sum<string>('amount').as('n')).where('customer_return_id', '=', returnId).executeTakeFirst();
  return toPiasters(String(r?.n ?? '0'));
}

// ACC-13: what is left over after the unpaid part: money back, or a credit for the next order (C-69)
export async function chooseLeftOver(trx: Trx, ctx: AuthContext, id: string, choice: 'refund' | 'keep_as_credit') {
  const r = await trx.selectFrom('customer_returns').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
  if (!r) throw errors.notFound();
  if (r.status !== 'completed' || toPiasters(r.left_over) === 0) throw errors.rule({ en: 'Nothing is left over on this return', ar: 'لا يوجد متبقٍ في هذا المرتجع' });
  if ((await refunded(trx, id)) > 0) throw changed('Money was already paid back', 'تم رد مبلغ بالفعل');
  await trx.updateTable('customer_returns').set({ left_over_choice: choice }).where('id', '=', id).execute();
  await logActivity(trx, ctx, { action: 'return_left_over_chosen', entityType: 'customer_return', entityId: id, details: { choice } });
}

export async function recordRefund(
  trx: Trx,
  ctx: AuthContext,
  id: string,
  input: { amount: string; method: 'cash' | 'instapay' | 'vodafone_cash'; reference?: string | null; refundedOn: string },
) {
  const r = await trx.selectFrom('customer_returns').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
  if (!r) throw errors.notFound();
  if (r.left_over_choice !== 'refund') throw errors.rule({ en: 'Choose "money back" first', ar: 'اختر "رد المبلغ" أولاً' });
  const left = toPiasters(r.left_over) - (await refunded(trx, id));
  if (toPiasters(input.amount) > left) throw errors.rule({ en: `At most ${fromPiasters(left)} can be paid back`, ar: `يمكن رد ${fromPiasters(left)} كحد أقصى` }, { left: fromPiasters(left) });
  await trx
    .insertInto('refunds')
    .values({ wholesaler_id: ctx.wholesalerId, customer_return_id: id, customer_id: r.customer_id, amount: input.amount, method: input.method, reference: input.reference ?? null, refunded_on: input.refundedOn, recorded_by: ctx.userId })
    .execute();
  await logActivity(trx, ctx, { action: 'refund_paid', entityType: 'customer_return', entityId: id, details: { amount: input.amount, method: input.method }, important: true });
  await notify(trx, ctx.wholesalerId, (await usersWithRoles(trx, ['owner'])).filter((u) => u !== ctx.userId), {
    type: 'refund_paid',
    title: { en: `${input.amount} EGP paid back for return ${r.return_number}`, ar: `تم رد ${input.amount} جنيه للمرتجع ${r.return_number}` },
    entityType: 'customer_return',
    entityId: id,
  });
}

export async function loadReturn(trx: Trx, ctx: AuthContext, id: string) {
  const r = await trx
    .selectFrom('customer_returns as r')
    .innerJoin('customers as c', 'c.id', 'r.customer_id')
    .innerJoin('orders as o', 'o.id', 'r.order_id')
    .leftJoin('invoices as i', 'i.id', 'r.invoice_id')
    .selectAll('r')
    .select(['c.business_name', 'o.order_number', 'i.invoice_number'])
    .where('r.id', '=', id)
    .executeTakeFirst();
  if (!r) throw errors.notFound();
  if (ctx.userType === 'customer' && r.customer_id !== ctx.customerId) throw errors.notFound();
  const lines = await trx
    .selectFrom('customer_return_lines as l')
    .innerJoin('products as p', 'p.id', 'l.product_id')
    .innerJoin('batches as b', 'b.id', 'l.batch_id')
    .select(['l.id', 'l.quantity', 'l.condition', 'l.unit_credit', 'l.line_credit', 'p.name_ar', 'p.name_en', 'b.batch_number'])
    .where('l.customer_return_id', '=', id)
    .execute();
  const refunds = await trx.selectFrom('refunds').select(['id', 'amount', 'method', 'reference', 'refunded_on']).where('customer_return_id', '=', id).execute();
  const refundedTotal = refunds.reduce((s, x) => s + toPiasters(x.amount), 0);
  return {
    id: r.id,
    returnNumber: r.return_number,
    source: r.source,
    status: r.status,
    reason: r.reason,
    note: r.note,
    customer: { id: r.customer_id, businessName: r.business_name },
    orderId: r.order_id,
    orderNumber: r.order_number,
    invoiceId: r.invoice_id,
    invoiceNumber: r.invoice_number,
    creditAmount: r.credit_amount,
    appliedToInvoice: r.applied_to_invoice,
    leftOver: r.left_over,
    leftOverChoice: r.left_over_choice,
    refunded: fromPiasters(refundedTotal),
    createdAt: r.created_at,
    completedAt: r.completed_at,
    lines: lines.map((l) => ({ id: l.id, product: { nameAr: l.name_ar, nameEn: l.name_en }, batchNumber: l.batch_number, quantity: l.quantity, condition: l.condition, unitCredit: l.unit_credit, lineCredit: l.line_credit })),
    refunds: refunds.map((x) => ({ id: x.id, amount: x.amount, method: x.method, reference: x.reference, refundedOn: x.refunded_on })),
  };
}
