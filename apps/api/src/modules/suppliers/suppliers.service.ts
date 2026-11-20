import { sql } from 'kysely';
import { fromPiasters, toPiasters } from '@cosmo/shared';
import type { Trx } from '../../core/db';
import { AppError, errors } from '../../core/errors';
import { logActivity, type Actor } from '../../core/activity';
import { notify, usersWithRoles } from '../../core/notifications';
import { nextNumber } from '../../core/numbers';
import { batchByNumber, holdForSupplierReturn, receiveIntoBatch, releaseHold, removeForSupplierReturn } from '../stock/stock.service';
import type { SupplierReturnReason } from '../../core/schema';

// A supplier's balance is calculated, never typed (idea 9 of the database design):
// confirmed receipts - confirmed supplier returns - payments that are not cancelled
export async function supplierBalances(trx: Trx, supplierIds?: string[]) {
  let q = trx
    .selectFrom('suppliers as s')
    .select((eb) => [
      's.id',
      eb
        .selectFrom('receipts as r')
        .select(sql<string>`coalesce(sum(r.total_amount), 0)::text`.as('v'))
        .whereRef('r.supplier_id', '=', 's.id')
        .where('r.status', '=', 'confirmed')
        .as('purchases'),
      eb
        .selectFrom('supplier_returns as x')
        .select(sql<string>`coalesce(sum(x.total_value), 0)::text`.as('v'))
        .whereRef('x.supplier_id', '=', 's.id')
        .where('x.status', '=', 'confirmed')
        .as('returns'),
      eb
        .selectFrom('supplier_payments as p')
        .select(sql<string>`coalesce(sum(p.amount), 0)::text`.as('v'))
        .whereRef('p.supplier_id', '=', 's.id')
        .where('p.cancelled_at', 'is', null)
        .as('paid'),
    ]);
  if (supplierIds) q = q.where('s.id', 'in', supplierIds.length ? supplierIds : ['00000000-0000-0000-0000-000000000000']);
  const rows = await q.execute();
  return new Map(
    rows.map((r) => {
      const purchases = toPiasters(r.purchases ?? '0');
      const returns = toPiasters(r.returns ?? '0');
      const paid = toPiasters(r.paid ?? '0');
      return [
        r.id,
        {
          purchases: fromPiasters(purchases),
          returns: fromPiasters(returns),
          paid: fromPiasters(paid),
          balance: fromPiasters(purchases - returns - paid),
        },
      ];
    }),
  );
}

async function activeSupplier(trx: Trx, id: string) {
  const s = await trx.selectFrom('suppliers').select(['id', 'name', 'is_active']).where('id', '=', id).executeTakeFirst();
  if (!s) throw errors.notFound();
  if (!s.is_active) throw errors.rule({ en: 'This supplier is switched off', ar: 'هذا المورد موقوف' }, { field: 'supplierId' });
  return s;
}

// ---------- Receipts (C-04, C-43, STK-01, STK-02) ----------

export async function loadReceipt(trx: Trx, id: string) {
  const r = await trx
    .selectFrom('receipts as r')
    .innerJoin('suppliers as s', 's.id', 'r.supplier_id')
    .leftJoin('employees as e', 'e.user_id', 'r.created_by')
    .selectAll('r')
    .select(['s.name as supplier_name', 'e.name as created_by_name'])
    .where('r.id', '=', id)
    .executeTakeFirst();
  if (!r) throw errors.notFound();
  const lines = await trx
    .selectFrom('receipt_lines as l')
    .innerJoin('products as p', 'p.id', 'l.product_id')
    .select(['l.id', 'l.product_id', 'l.batch_number', 'l.expiry_date', 'l.batch_id', 'l.quantity', 'l.cost_price', 'p.name_ar', 'p.name_en', 'p.track_batches'])
    .where('l.receipt_id', '=', id)
    .orderBy('l.line_order')
    .execute();
  return {
    id: r.id,
    receiptNumber: r.receipt_number,
    status: r.status,
    supplierId: r.supplier_id,
    supplierName: r.supplier_name,
    supplierInvoiceNumber: r.supplier_invoice_number,
    supplierInvoiceDate: r.supplier_invoice_date,
    totalAmount: r.total_amount,
    createdBy: r.created_by_name,
    createdAt: r.created_at,
    confirmedAt: r.confirmed_at,
    lines: lines.map((l) => ({
      id: l.id,
      productId: l.product_id,
      product: { nameAr: l.name_ar, nameEn: l.name_en },
      trackBatches: l.track_batches,
      batchNumber: l.batch_number,
      expiryDate: l.expiry_date,
      quantity: l.quantity,
      costPrice: l.cost_price,
      lineTotal: fromPiasters(toPiasters(l.cost_price) * l.quantity),
    })),
  };
}

export async function createReceipt(trx: Trx, actor: Actor, supplierId: string) {
  await activeSupplier(trx, supplierId);
  const r = await trx
    .insertInto('receipts')
    .values({ wholesaler_id: actor.wholesalerId, supplier_id: supplierId, created_by: actor.userId })
    .returning('id')
    .executeTakeFirstOrThrow();
  return r.id;
}

async function draft(trx: Trx, id: string) {
  const r = await trx.selectFrom('receipts').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
  if (!r) throw errors.notFound();
  if (r.status !== 'draft') {
    // A confirmed receipt cannot be edited (C-09)
    throw new AppError(409, 'STATUS_CHANGED', {
      en: 'This receipt is already confirmed and cannot be changed',
      ar: 'هذا الاستلام مؤكد ولا يمكن تعديله',
    });
  }
  return r;
}

export async function updateReceipt(
  trx: Trx,
  actor: Actor,
  id: string,
  input: {
    supplierId?: string;
    supplierInvoiceNumber?: string | null;
    supplierInvoiceDate?: string | null;
    lines?: Array<{ productId: string; batchNumber: string | null; expiryDate: string | null; quantity: number; costPrice: string }>;
  },
) {
  await draft(trx, id);
  if (input.supplierId) await activeSupplier(trx, input.supplierId);
  let total: string | undefined;
  if (input.lines) {
    const ids = [...new Set(input.lines.map((l) => l.productId))];
    const found = ids.length ? await trx.selectFrom('products').select('id').where('id', 'in', ids).execute() : [];
    if (found.length !== ids.length) throw errors.rule({ en: 'A product in the list does not exist', ar: 'منتج في القائمة غير موجود' });
    await trx.deleteFrom('receipt_lines').where('receipt_id', '=', id).execute();
    if (input.lines.length) {
      await trx
        .insertInto('receipt_lines')
        .values(
          input.lines.map((l, i) => ({
            wholesaler_id: actor.wholesalerId,
            receipt_id: id,
            product_id: l.productId,
            batch_number: l.batchNumber,
            expiry_date: l.expiryDate,
            quantity: l.quantity,
            cost_price: l.costPrice,
            line_order: i,
          })),
        )
        .execute();
    }
    total = fromPiasters(input.lines.reduce((s, l) => s + toPiasters(l.costPrice) * l.quantity, 0));
  }
  await trx
    .updateTable('receipts')
    .set({
      ...(input.supplierId && { supplier_id: input.supplierId }),
      ...(input.supplierInvoiceNumber !== undefined && { supplier_invoice_number: input.supplierInvoiceNumber }),
      ...(input.supplierInvoiceDate !== undefined && { supplier_invoice_date: input.supplierInvoiceDate }),
      ...(total !== undefined && { total_amount: total }),
    })
    .where('id', '=', id)
    .execute();
}

// Confirms the receipt: stock goes up, cost prices update (C-75), and the supplier balance goes up. All together.
export async function confirmReceipt(trx: Trx, actor: Actor, id: string) {
  const r = await draft(trx, id);
  await activeSupplier(trx, r.supplier_id);
  const lines = await trx
    .selectFrom('receipt_lines as l')
    .innerJoin('products as p', 'p.id', 'l.product_id')
    .select(['l.id', 'l.product_id', 'l.batch_number', 'l.expiry_date', 'l.quantity', 'l.cost_price', 'p.track_batches', 'p.cost_price as product_cost', 'p.name_en'])
    .where('l.receipt_id', '=', id)
    .orderBy('l.line_order')
    .execute();
  if (lines.length === 0) throw errors.rule({ en: 'Add at least one product', ar: 'أضف منتجاً واحداً على الأقل' });

  const problems: Record<string, string> = {};
  lines.forEach((l, i) => {
    if (l.track_batches && (!l.batch_number || !l.expiry_date)) problems[`lines.${i}.batchNumber`] = 'batch_required';
  });
  if (Object.keys(problems).length) {
    throw errors.rule({ en: 'Batch number and expiry date are required for these products', ar: 'رقم التشغيلة وتاريخ الصلاحية مطلوبان لهذه المنتجات' }, { fields: problems });
  }

  const number = await nextNumber(trx, actor.wholesalerId, 'receipt', 'REC');
  const newCost = new Map<string, { old: string; next: string }>();
  for (const l of lines) {
    let batchId: string;
    if (l.track_batches) {
      batchId = (await batchByNumber(trx, actor.wholesalerId, l.product_id, l.batch_number!.trim(), l.expiry_date!)).id;
    } else {
      batchId = (await trx.selectFrom('batches').select('id').where('product_id', '=', l.product_id).where('batch_number', 'is', null).executeTakeFirstOrThrow()).id;
    }
    await trx.updateTable('receipt_lines').set({ batch_id: batchId }).where('id', '=', l.id).execute();
    await receiveIntoBatch(trx, actor, { productId: l.product_id, batchId, quantity: l.quantity, documentId: id });
    if (Number(l.cost_price) !== Number(l.product_cost)) newCost.set(l.product_id, { old: l.product_cost, next: l.cost_price });
  }
  for (const [productId, c] of newCost) {
    await trx.updateTable('products').set({ cost_price: c.next, updated_at: new Date() }).where('id', '=', productId).execute();
    await trx
      .insertInto('price_history')
      .values({ wholesaler_id: actor.wholesalerId, product_id: productId, price_type: 'cost', old_price: c.old, new_price: c.next, changed_by: actor.userId })
      .execute();
  }
  await trx
    .updateTable('receipts')
    .set({ status: 'confirmed', receipt_number: number, confirmed_by: actor.userId, confirmed_at: new Date() })
    .where('id', '=', id)
    .execute();
  await logActivity(trx, actor, {
    action: 'receipt_confirmed',
    entityType: 'receipt',
    entityId: id,
    details: { number, supplierId: r.supplier_id, lines: lines.length },
  });
}

// ---------- Supplier returns (C-42, C-65, STK-19, OWN-14) ----------

export async function loadSupplierReturn(trx: Trx, id: string) {
  const r = await trx
    .selectFrom('supplier_returns as r')
    .innerJoin('suppliers as s', 's.id', 'r.supplier_id')
    .leftJoin('employees as e', 'e.user_id', 'r.created_by')
    .leftJoin('employees as d', 'd.user_id', 'r.decided_by')
    .selectAll('r')
    .select(['s.name as supplier_name', 'e.name as created_by_name', 'd.name as decided_by_name'])
    .where('r.id', '=', id)
    .executeTakeFirst();
  if (!r) throw errors.notFound();
  const lines = await trx
    .selectFrom('supplier_return_lines as l')
    .innerJoin('products as p', 'p.id', 'l.product_id')
    .innerJoin('batches as b', 'b.id', 'l.batch_id')
    .select(['l.id', 'l.product_id', 'l.batch_id', 'l.stock_state', 'l.quantity', 'l.cost_price', 'p.name_ar', 'p.name_en', 'b.batch_number', 'b.expiry_date'])
    .where('l.supplier_return_id', '=', id)
    .execute();
  return {
    id: r.id,
    returnNumber: r.return_number,
    status: r.status,
    supplierId: r.supplier_id,
    supplierName: r.supplier_name,
    reason: r.reason,
    note: r.note,
    totalValue: r.total_value,
    createdBy: r.created_by_name,
    createdAt: r.created_at,
    decidedBy: r.decided_by_name,
    decidedAt: r.decided_at,
    rejectionReason: r.rejection_reason,
    lines: lines.map((l) => ({
      id: l.id,
      productId: l.product_id,
      product: { nameAr: l.name_ar, nameEn: l.name_en },
      batchId: l.batch_id,
      batchNumber: l.batch_number,
      expiryDate: l.expiry_date,
      stockState: l.stock_state,
      quantity: l.quantity,
      costPrice: l.cost_price,
    })),
  };
}

// The value of a returned unit is the cost on the latest receipt of that batch, or else the product's cost price
async function unitCost(trx: Trx, productId: string, batchId: string) {
  const fromReceipt = await trx
    .selectFrom('receipt_lines as l')
    .innerJoin('receipts as r', 'r.id', 'l.receipt_id')
    .select('l.cost_price')
    .where('l.batch_id', '=', batchId)
    .where('r.status', '=', 'confirmed')
    .orderBy('r.confirmed_at', 'desc')
    .executeTakeFirst();
  if (fromReceipt) return fromReceipt.cost_price;
  const p = await trx.selectFrom('products').select('cost_price').where('id', '=', productId).executeTakeFirstOrThrow();
  return p.cost_price;
}

export async function createSupplierReturn(
  trx: Trx,
  actor: Actor,
  input: {
    supplierId: string;
    reason: SupplierReturnReason;
    note: string | null;
    lines: Array<{ productId: string; batchId: string; stockState: 'sellable' | 'damaged' | 'expired'; quantity: number }>;
  },
) {
  const supplier = await activeSupplier(trx, input.supplierId);
  const settings = await trx.selectFrom('settings').select('supplier_return_approval').executeTakeFirstOrThrow();
  const needsApproval = settings.supplier_return_approval;
  const number = await nextNumber(trx, actor.wholesalerId, 'supplier_return', 'SRT');

  const priced = [];
  for (const l of input.lines) {
    priced.push({ ...l, cost: await unitCost(trx, l.productId, l.batchId) });
  }
  const total = fromPiasters(priced.reduce((s, l) => s + toPiasters(l.cost) * l.quantity, 0));

  const r = await trx
    .insertInto('supplier_returns')
    .values({
      wholesaler_id: actor.wholesalerId,
      return_number: number,
      supplier_id: supplier.id,
      status: needsApproval ? 'waiting_for_owner' : 'confirmed',
      reason: input.reason,
      note: input.note,
      total_value: total,
      created_by: actor.userId,
      confirmed_at: needsApproval ? null : new Date(),
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  await trx
    .insertInto('supplier_return_lines')
    .values(
      priced.map((l) => ({
        wholesaler_id: actor.wholesalerId,
        supplier_return_id: r.id,
        product_id: l.productId,
        batch_id: l.batchId,
        stock_state: l.stockState,
        quantity: l.quantity,
        cost_price: l.cost,
      })),
    )
    .execute();

  for (const l of priced) {
    const m = { productId: l.productId, batchId: l.batchId, state: l.stockState, quantity: l.quantity, documentId: r.id };
    if (needsApproval) await holdForSupplierReturn(trx, actor, m);
    else await removeForSupplierReturn(trx, actor, { ...m, fromHeld: false });
  }

  const owners = (await usersWithRoles(trx, ['owner'])).filter((u) => u !== actor.userId);
  await logActivity(trx, actor, {
    action: needsApproval ? 'supplier_return_submitted' : 'supplier_return_confirmed',
    entityType: 'supplier_return',
    entityId: r.id,
    reason: input.note ?? input.reason,
    details: { number, supplier: supplier.name, total },
    important: !needsApproval,
  });
  // C-65: approval on -> the owner must decide. Approval off -> the owner gets an alert.
  await notify(trx, actor.wholesalerId, owners, {
    type: needsApproval ? 'supplier_return_waiting' : 'supplier_return_confirmed',
    title: needsApproval
      ? { en: `Supplier return ${number} waits for your approval`, ar: `مرتجع المورد ${number} ينتظر موافقتك` }
      : { en: `Goods returned to ${supplier.name}`, ar: `تم إرجاع بضاعة إلى ${supplier.name}` },
    body: { en: `${number} · ${total} EGP`, ar: `${number} · ${total} جنيه` },
    entityType: 'supplier_return',
    entityId: r.id,
  });
  return r.id;
}

async function waiting(trx: Trx, id: string) {
  const r = await trx.selectFrom('supplier_returns').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
  if (!r) throw errors.notFound();
  if (r.status !== 'waiting_for_owner') {
    throw new AppError(409, 'STATUS_CHANGED', {
      en: 'This return was already decided',
      ar: 'تم اتخاذ قرار في هذا المرتجع بالفعل',
    });
  }
  const lines = await trx.selectFrom('supplier_return_lines').selectAll().where('supplier_return_id', '=', id).execute();
  return { r, lines };
}

export async function decideSupplierReturn(trx: Trx, actor: Actor, id: string, decision: { approve: true } | { approve: false; reason: string }) {
  const { r, lines } = await waiting(trx, id);
  for (const l of lines) {
    const m = { productId: l.product_id, batchId: l.batch_id, state: l.stock_state, quantity: l.quantity, documentId: id };
    if (decision.approve) await removeForSupplierReturn(trx, actor, { ...m, fromHeld: true });
    else await releaseHold(trx, actor, m);
  }
  await trx
    .updateTable('supplier_returns')
    .set({
      status: decision.approve ? 'confirmed' : 'rejected',
      decided_by: actor.userId,
      decided_at: new Date(),
      confirmed_at: decision.approve ? new Date() : null,
      rejection_reason: decision.approve ? null : decision.reason,
    })
    .where('id', '=', id)
    .execute();
  await logActivity(trx, actor, {
    action: decision.approve ? 'supplier_return_approved' : 'supplier_return_rejected',
    entityType: 'supplier_return',
    entityId: id,
    reason: decision.approve ? null : decision.reason,
    details: { number: r.return_number },
  });
  if (r.created_by && r.created_by !== actor.userId) {
    await notify(trx, actor.wholesalerId, [r.created_by], {
      type: decision.approve ? 'supplier_return_approved' : 'supplier_return_rejected',
      title: decision.approve
        ? { en: `Supplier return ${r.return_number} approved`, ar: `تمت الموافقة على مرتجع المورد ${r.return_number}` }
        : { en: `Supplier return ${r.return_number} rejected`, ar: `تم رفض مرتجع المورد ${r.return_number}` },
      body: decision.approve ? undefined : { en: decision.reason, ar: decision.reason },
      entityType: 'supplier_return',
      entityId: id,
    });
  }
}
