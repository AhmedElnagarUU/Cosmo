import { fromPiasters, toPiasters } from '@cosmo/shared';
import type { Trx } from '../../core/db';
import { AppError, errors } from '../../core/errors';
import { logActivity, type Actor } from '../../core/activity';
import { notify, usersWithRoles } from '../../core/notifications';
import { nextNumber } from '../../core/numbers';
import { todayIn } from '../stock/stock.service';

// Invoices and payments (docs/workflows/05-invoices-and-payments.md):
// C-17, C-26, C-27, C-33, C-36, C-41, C-47, C-58, C-59, C-78, C-79, C-80

function addDays(date: string, days: number) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function invoiceLinesFromOrder(trx: Trx, orderId: string) {
  const lines = await trx
    .selectFrom('order_lines as l')
    .innerJoin('products as p', 'p.id', 'l.product_id')
    .select(['l.id', 'l.product_id', 'l.current_qty', 'l.bonus_qty', 'l.unit_price', 'l.discount_percent', 'l.line_total', 'p.name_ar', 'p.name_en'])
    .where('l.order_id', '=', orderId)
    .where('l.current_qty', '>', 0)
    .orderBy('l.line_order')
    .execute();
  const rows: Array<{ order_line_id: string; product_id: string; product_name_ar: string; product_name_en: string; quantity: number; is_bonus: boolean; unit_price: string; discount_percent: string | null; line_total: string }> = [];
  for (const l of lines) {
    rows.push({ order_line_id: l.id, product_id: l.product_id, product_name_ar: l.name_ar, product_name_en: l.name_en, quantity: l.current_qty, is_bonus: false, unit_price: l.unit_price, discount_percent: l.discount_percent, line_total: l.line_total });
    // C-41: free units are their own line at price zero
    if (l.bonus_qty > 0) {
      rows.push({ order_line_id: l.id, product_id: l.product_id, product_name_ar: l.name_ar, product_name_en: l.name_en, quantity: l.bonus_qty, is_bonus: true, unit_price: '0.00', discount_percent: null, line_total: '0.00' });
    }
  }
  return rows;
}

// The status follows from the confirmed payments and return credits. Nobody sets it by hand (C-17).
export async function recalcInvoice(trx: Trx, invoiceId: string) {
  const inv = await trx.selectFrom('invoices').selectAll().where('id', '=', invoiceId).forUpdate().executeTakeFirstOrThrow();
  if (inv.status === 'cancelled') return;
  const paid = await trx.selectFrom('payments').select((eb) => eb.fn.sum<string>('amount').as('n')).where('invoice_id', '=', invoiceId).where('status', '=', 'confirmed').executeTakeFirst();
  const credit = await trx
    .selectFrom('customer_returns')
    .select((eb) => eb.fn.sum<string>('applied_to_invoice').as('n'))
    .where('invoice_id', '=', invoiceId)
    .where((eb) => eb.or([eb('source', '=', 'at_the_door'), eb('status', '=', 'completed')]))
    .executeTakeFirst();
  const p = toPiasters(String(paid?.n ?? '0'));
  const c = toPiasters(String(credit?.n ?? '0'));
  const total = toPiasters(inv.total);
  const status = p + c === 0 ? 'unpaid' : p + c >= total ? 'paid' : 'partially_paid';
  await trx
    .updateTable('invoices')
    .set({ confirmed_paid: fromPiasters(p), return_credit: fromPiasters(c), status: total === 0 ? 'paid' : status })
    .where('id', '=', invoiceId)
    .execute();
}

export async function invoiceOf(trx: Trx, orderId: string) {
  return trx.selectFrom('invoices').selectAll().where('order_id', '=', orderId).where('status', '<>', 'cancelled').executeTakeFirst();
}

// Payments and door returns recorded without an invoice now belong to it
async function attachLoose(trx: Trx, orderId: string, invoiceId: string) {
  await trx.updateTable('payments').set({ invoice_id: invoiceId }).where('order_id', '=', orderId).where('invoice_id', 'is', null).execute();
  const doorReturns = await trx.selectFrom('customer_returns').select(['id', 'credit_amount']).where('order_id', '=', orderId).where('source', '=', 'at_the_door').where('invoice_id', 'is', null).execute();
  for (const r of doorReturns) {
    // C-47: the credit for refused items is taken off at once
    await trx.updateTable('customer_returns').set({ invoice_id: invoiceId, applied_to_invoice: r.credit_amount }).where('id', '=', r.id).execute();
  }
  await recalcInvoice(trx, invoiceId);
}

export async function createInvoice(trx: Trx, actor: Actor, orderId: string) {
  const existing = await invoiceOf(trx, orderId);
  if (existing) {
    await attachLoose(trx, orderId, existing.id);
    return existing.id;
  }
  const o = await trx.selectFrom('orders').selectAll().where('id', '=', orderId).executeTakeFirstOrThrow();
  const c = await trx.selectFrom('customers').select(['credit_days']).where('id', '=', o.customer_id).executeTakeFirstOrThrow();
  const w = await trx.selectFrom('wholesalers').select('time_zone').where('id', '=', actor.wholesalerId).executeTakeFirstOrThrow();
  const date = todayIn(w.time_zone);
  const inv = await trx
    .insertInto('invoices')
    .values({
      wholesaler_id: actor.wholesalerId,
      invoice_number: await nextNumber(trx, actor.wholesalerId, 'invoice', 'INV'),
      order_id: o.id,
      customer_id: o.customer_id,
      invoice_date: date,
      // C-36: the credit period starts on the invoice date
      due_date: o.payment_choice === 'credit' ? addDays(date, c.credit_days) : date,
      payment_choice: o.payment_choice,
      subtotal: o.subtotal,
      discount_total: o.discount_total,
      total: o.total,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  const lines = await invoiceLinesFromOrder(trx, o.id);
  await trx
    .insertInto('invoice_lines')
    .values(lines.map((l, i) => ({ ...l, wholesaler_id: actor.wholesalerId, invoice_id: inv.id, line_order: i })))
    .execute();
  await attachLoose(trx, o.id, inv.id);
  await logActivity(trx, actor, { action: 'invoice_created', entityType: 'invoice', entityId: inv.id, details: { orderId } });
  return inv.id;
}

// C-58: the invoice is created at the moment the owner chose
export async function createInvoiceIfMoment(trx: Trx, actor: Actor, orderId: string, moment: 'on_accepted' | 'on_prepared' | 'on_delivered') {
  const s = await trx.selectFrom('settings').select('invoice_timing').executeTakeFirstOrThrow();
  // A later moment always has an invoice too, so nothing is left without one
  const order = ['on_accepted', 'on_prepared', 'on_delivered'];
  if (order.indexOf(s.invoice_timing) <= order.indexOf(moment)) await createInvoice(trx, actor, orderId);
}

// A quantity changed after the invoice was created: the invoice follows the order
export async function syncInvoice(trx: Trx, orderId: string) {
  const inv = await invoiceOf(trx, orderId);
  if (!inv) return;
  const o = await trx.selectFrom('orders').select(['subtotal', 'discount_total', 'total']).where('id', '=', orderId).executeTakeFirstOrThrow();
  await trx.deleteFrom('invoice_lines').where('invoice_id', '=', inv.id).execute();
  const lines = await invoiceLinesFromOrder(trx, orderId);
  if (lines.length) await trx.insertInto('invoice_lines').values(lines.map((l, i) => ({ ...l, wholesaler_id: inv.wholesaler_id, invoice_id: inv.id, line_order: i }))).execute();
  await trx.updateTable('invoices').set({ subtotal: o.subtotal, discount_total: o.discount_total, total: o.total }).where('id', '=', inv.id).execute();
  await recalcInvoice(trx, inv.id);
}

// The order was cancelled before delivery: its invoice is cancelled too
export async function cancelInvoiceOf(trx: Trx, actor: Actor, orderId: string) {
  const inv = await invoiceOf(trx, orderId);
  if (!inv) return;
  if (toPiasters(inv.confirmed_paid) > 0) {
    throw errors.rule({ en: 'This order has confirmed payments. Cancel them first', ar: 'هذا الطلب عليه مدفوعات مؤكدة. ألغها أولاً' });
  }
  await trx.updateTable('invoices').set({ status: 'cancelled', cancelled_at: new Date() }).where('id', '=', inv.id).execute();
  await logActivity(trx, actor, { action: 'invoice_cancelled', entityType: 'invoice', entityId: inv.id, details: { orderId } });
}

const changed = (en: string, ar: string) => new AppError(409, 'STATUS_CHANGED', { en, ar });

async function remainingOn(trx: Trx, invoiceId: string) {
  const inv = await trx.selectFrom('invoices').selectAll().where('id', '=', invoiceId).executeTakeFirstOrThrow();
  const waiting = await trx.selectFrom('payments').select((eb) => eb.fn.sum<string>('amount').as('n')).where('invoice_id', '=', invoiceId).where('status', '=', 'waiting').executeTakeFirst();
  return toPiasters(inv.total) - toPiasters(inv.confirmed_paid) - toPiasters(inv.return_credit) - toPiasters(String(waiting?.n ?? '0'));
}

// ACC-04, ACC-05: a payment made to the office is confirmed at once
export async function recordOfficePayment(
  trx: Trx,
  actor: Actor,
  input: { invoiceId: string; amount: string; method: 'cash' | 'instapay' | 'vodafone_cash' | 'bank_transfer' | 'other'; paidOn: string; reference?: string | null },
) {
  const inv = await trx.selectFrom('invoices').selectAll().where('id', '=', input.invoiceId).forUpdate().executeTakeFirst();
  if (!inv) throw errors.notFound();
  if (inv.status === 'cancelled' || inv.status === 'paid') throw changed('This invoice has nothing left to pay', 'لا يوجد مبلغ متبقٍ على هذه الفاتورة');
  const left = await remainingOn(trx, inv.id);
  if (toPiasters(input.amount) > left) {
    throw errors.rule({ en: `The amount is more than the ${fromPiasters(left)} left`, ar: `المبلغ أكبر من المتبقي ${fromPiasters(left)}` }, { left: fromPiasters(left) });
  }
  const p = await trx
    .insertInto('payments')
    .values({
      wholesaler_id: actor.wholesalerId,
      order_id: inv.order_id,
      invoice_id: inv.id,
      customer_id: inv.customer_id,
      amount: input.amount,
      method: input.method,
      reference: input.reference ?? null,
      paid_on: input.paidOn,
      status: 'confirmed',
      recorded_by: actor.userId,
      decided_by: actor.userId,
      decided_at: new Date(),
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  await recalcInvoice(trx, inv.id);
  await logActivity(trx, actor, { action: 'payment_recorded', entityType: 'invoice', entityId: inv.id, details: { amount: input.amount, method: input.method } });
  return p.id;
}

// A trip closes when every payment is checked, every signed paper is in, and the cash was handed over (C-27, C-44)
export async function tryCloseTrip(trx: Trx, actor: Actor, tripId: string) {
  const t = await trx.selectFrom('trips').selectAll().where('id', '=', tripId).executeTakeFirstOrThrow();
  if (t.status !== 'finished' || t.cash_received === null) return false;
  const waiting = await trx
    .selectFrom('payments as p')
    .innerJoin('trip_stops as s', 's.id', 'p.trip_stop_id')
    .select('p.id')
    .where('s.trip_id', '=', tripId)
    .where('p.status', '=', 'waiting')
    .executeTakeFirst();
  const paper = await trx.selectFrom('trip_stops').select('id').where('trip_id', '=', tripId).where('result', '=', 'delivered').where('signed_paper_received', '=', false).executeTakeFirst();
  if (waiting || paper) return false;
  await trx.updateTable('trips').set({ status: 'closed', closed_at: new Date() }).where('id', '=', tripId).execute();
  await logActivity(trx, actor, { action: 'trip_closed', entityType: 'trip', entityId: tripId, details: { number: t.trip_number } });
  return true;
}

// ACC-02: the accountant confirms the money arrived, or rejects with a reason (C-27)
export async function decidePayment(trx: Trx, actor: Actor, id: string, decision: { confirm: true } | { confirm: false; reason: string }) {
  const p = await trx.selectFrom('payments').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
  if (!p) throw errors.notFound();
  if (p.status !== 'waiting') throw changed('This payment was already checked', 'تمت مراجعة هذه الدفعة بالفعل');
  let invoiceId = p.invoice_id;
  if (!invoiceId && p.order_id) invoiceId = (await invoiceOf(trx, p.order_id))?.id ?? null;
  if (decision.confirm && !invoiceId) {
    throw errors.rule({ en: 'This order has no invoice yet', ar: 'هذا الطلب ليس له فاتورة بعد' });
  }
  await trx
    .updateTable('payments')
    .set({
      status: decision.confirm ? 'confirmed' : 'rejected',
      invoice_id: invoiceId,
      decided_by: actor.userId,
      decided_at: new Date(),
      rejection_reason: decision.confirm ? null : decision.reason,
    })
    .where('id', '=', id)
    .execute();
  if (invoiceId) await recalcInvoice(trx, invoiceId);
  await logActivity(trx, actor, {
    action: decision.confirm ? 'payment_confirmed' : 'payment_rejected',
    entityType: 'payment',
    entityId: id,
    reason: decision.confirm ? null : decision.reason,
    details: { amount: p.amount, method: p.method },
    important: !decision.confirm,
  });
  if (!decision.confirm) {
    // The owner gets an alert with the reason (C-30)
    await notify(trx, actor.wholesalerId, (await usersWithRoles(trx, ['owner'])).filter((u) => u !== actor.userId), {
      type: 'payment_rejected',
      title: { en: `A payment of ${p.amount} was rejected`, ar: `تم رفض دفعة بقيمة ${p.amount}` },
      body: { en: decision.reason, ar: decision.reason },
      entityType: 'payment',
      entityId: id,
    });
  }
  if (p.trip_stop_id) {
    const s = await trx.selectFrom('trip_stops').select('trip_id').where('id', '=', p.trip_stop_id).executeTakeFirstOrThrow();
    await tryCloseTrip(trx, actor, s.trip_id);
  }
}

// ACC-12: a confirmed payment recorded by mistake is cancelled with a reason, never deleted
export async function cancelPayment(trx: Trx, actor: Actor, id: string, reason: string) {
  const p = await trx.selectFrom('payments').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
  if (!p) throw errors.notFound();
  if (p.status !== 'confirmed') throw changed('Only confirmed payments can be cancelled', 'يمكن إلغاء المدفوعات المؤكدة فقط');
  await trx.updateTable('payments').set({ status: 'cancelled', cancel_reason: reason, decided_by: actor.userId, decided_at: new Date() }).where('id', '=', id).execute();
  if (p.invoice_id) await recalcInvoice(trx, p.invoice_id);
  await logActivity(trx, actor, { action: 'payment_cancelled', entityType: 'payment', entityId: id, reason, details: { amount: p.amount }, important: true });
}

// ACC-03: the cash the delivery person handed over. A difference needs a note.
export async function cashHandover(trx: Trx, actor: Actor, tripId: string, input: { cashReceived: string; note?: string | null }) {
  const t = await trx.selectFrom('trips').selectAll().where('id', '=', tripId).forUpdate().executeTakeFirst();
  if (!t) throw errors.notFound();
  if (t.status !== 'finished') throw changed('The trip is not finished', 'الرحلة لم تنته بعد');
  const expected = toPiasters(t.cash_expected ?? '0');
  if (toPiasters(input.cashReceived) !== expected && !input.note) {
    throw errors.validation({ fields: { note: 'note_required' } });
  }
  await trx.updateTable('trips').set({ cash_received: input.cashReceived, cash_difference_note: input.note ?? null }).where('id', '=', tripId).execute();
  await logActivity(trx, actor, {
    action: 'cash_handed_over',
    entityType: 'trip',
    entityId: tripId,
    reason: input.note ?? null,
    details: { expected: t.cash_expected, received: input.cashReceived },
    important: toPiasters(input.cashReceived) !== expected,
  });
  await tryCloseTrip(trx, actor, tripId);
}

// ACC-06: invoices, payments, and return credits in date order, with a running balance
export async function statement(trx: Trx, customerId: string) {
  const invoices = await trx.selectFrom('invoices').select(['id', 'invoice_number', 'invoice_date', 'total', 'created_at']).where('customer_id', '=', customerId).where('status', '<>', 'cancelled').execute();
  const payments = await trx
    .selectFrom('payments')
    .select(['id', 'amount', 'method', 'paid_on', 'decided_at', 'invoice_id'])
    .where('customer_id', '=', customerId)
    .where('status', '=', 'confirmed')
    .execute();
  const returns = await trx
    .selectFrom('customer_returns')
    .select(['id', 'return_number', 'applied_to_invoice', 'created_at', 'completed_at', 'source'])
    .where('customer_id', '=', customerId)
    .where('invoice_id', 'is not', null)
    .where((eb) => eb.or([eb('source', '=', 'at_the_door'), eb('status', '=', 'completed')]))
    .execute();
  const leftOvers = await trx
    .selectFrom('customer_returns')
    .select(['id', 'return_number', 'left_over', 'completed_at'])
    .where('customer_id', '=', customerId)
    .where('status', '=', 'completed')
    .where('left_over', '>', '0')
    .execute();
  const refunds = await trx.selectFrom('refunds').select(['id', 'amount', 'refunded_on', 'created_at', 'method']).where('customer_id', '=', customerId).execute();
  const rows = [
    // C-69: what is left over after the unpaid part is a credit, until it is paid back
    ...leftOvers.map((r) => ({ kind: 'return' as const, id: r.id + '-left', number: r.return_number, date: new Date(r.completed_at!).toISOString().slice(0, 10), at: new Date(r.completed_at!).getTime() + 1, amount: -toPiasters(r.left_over) })),
    ...refunds.map((r) => ({ kind: 'refund' as const, id: r.id, number: r.method, date: r.refunded_on, at: new Date(r.created_at).getTime(), amount: toPiasters(r.amount) })),
    ...invoices.map((i) => ({ kind: 'invoice' as const, id: i.id, number: i.invoice_number, date: i.invoice_date, at: new Date(i.created_at).getTime(), amount: toPiasters(i.total) })),
    ...payments.map((p) => ({ kind: 'payment' as const, id: p.id, number: p.method, date: p.paid_on, at: new Date(p.decided_at ?? p.paid_on).getTime(), amount: -toPiasters(p.amount) })),
    ...returns.map((r) => ({ kind: 'return' as const, id: r.id, number: r.return_number, date: new Date(r.completed_at ?? r.created_at).toISOString().slice(0, 10), at: new Date(r.completed_at ?? r.created_at).getTime(), amount: -toPiasters(r.applied_to_invoice) })),
  ].sort((a, b) => (a.date === b.date ? a.at - b.at : a.date < b.date ? -1 : 1));
  let balance = 0;
  return {
    rows: rows.map((r) => {
      balance += r.amount;
      return { kind: r.kind, id: r.id, reference: r.number, date: r.date, amount: fromPiasters(r.amount), balance: fromPiasters(balance) };
    }),
    balance: fromPiasters(balance),
  };
}

export async function balances(trx: Trx, customerIds: string[], today: string) {
  if (!customerIds.length) return new Map<string, { balance: string; overdue: string }>();
  const rows = await trx
    .selectFrom('invoices')
    .select(['customer_id', 'total', 'confirmed_paid', 'return_credit', 'due_date', 'payment_choice'])
    .where('customer_id', 'in', customerIds)
    .where('status', '<>', 'cancelled')
    .execute();
  const out = new Map<string, { balance: number; overdue: number }>();
  const leftOvers = await trx.selectFrom('customer_returns').select(['customer_id', 'left_over']).where('customer_id', 'in', customerIds).where('status', '=', 'completed').execute();
  const refunds = await trx.selectFrom('refunds').select(['customer_id', 'amount']).where('customer_id', 'in', customerIds).execute();
  for (const l of leftOvers) {
    const cur = out.get(l.customer_id) ?? { balance: 0, overdue: 0 };
    cur.balance -= toPiasters(l.left_over);
    out.set(l.customer_id, cur);
  }
  for (const r of refunds) {
    const cur = out.get(r.customer_id) ?? { balance: 0, overdue: 0 };
    cur.balance += toPiasters(r.amount);
    out.set(r.customer_id, cur);
  }
  for (const r of rows) {
    const left = toPiasters(r.total) - toPiasters(r.confirmed_paid) - toPiasters(r.return_credit);
    const cur = out.get(r.customer_id) ?? { balance: 0, overdue: 0 };
    cur.balance += left;
    // C-33: a credit invoice past its due date and not paid is overdue
    if (r.payment_choice === 'credit' && r.due_date < today && left > 0) cur.overdue += left;
    out.set(r.customer_id, cur);
  }
  return new Map([...out].map(([k, v]) => [k, { balance: fromPiasters(v.balance), overdue: fromPiasters(v.overdue) }]));
}
