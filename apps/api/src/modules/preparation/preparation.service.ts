import { sql } from 'kysely';
import type { Trx } from '../../core/db';
import { AppError, errors } from '../../core/errors';
import { logActivity } from '../../core/activity';
import { notify, usersWithRoles } from '../../core/notifications';
import type { AuthContext } from '../../core/context';
import { todayIn } from '../stock/stock.service';
import { reduceLines } from '../orders/orders.service';

// Order preparation (docs/workflows/03-order-preparation.md, C-14, C-38, C-39, C-55, C-77).
// On-hand stock does not change here. It changes when the trip starts (C-25).

const statusChanged = (en: string, ar: string) => new AppError(409, 'STATUS_CHANGED', { en, ar });

async function lockPreparing(trx: Trx, ctx: AuthContext, id: string) {
  const o = await trx.selectFrom('orders').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
  if (!o) throw errors.notFound();
  if (o.status !== 'preparing') throw statusChanged('This order is not being prepared', 'هذا الطلب ليس قيد التجهيز');
  if (o.preparing_by && o.preparing_by !== ctx.userId) {
    throw statusChanged('Another person is preparing this order', 'شخص آخر يجهز هذا الطلب');
  }
  return o;
}

async function history(trx: Trx, ctx: AuthContext, orderId: string, from: string, to: string, reason?: string) {
  await trx
    .insertInto('order_status_history')
    .values({ wholesaler_id: ctx.wholesalerId, order_id: orderId, from_status: from as never, to_status: to as never, changed_by: ctx.userId, reason: reason ?? null })
    .execute();
}

// STK-07: opening the order marks it as Preparing. One person at a time (C-77).
export async function startPreparing(trx: Trx, ctx: AuthContext, id: string) {
  const o = await trx.selectFrom('orders').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
  if (!o) throw errors.notFound();
  if (o.status === 'preparing') {
    if (o.preparing_by === ctx.userId) return;
    if (o.preparing_by) {
      const who = await trx.selectFrom('employees').select('name').where('user_id', '=', o.preparing_by).executeTakeFirst();
      throw statusChanged(`${who?.name ?? 'Another person'} is preparing this order`, `${who?.name ?? 'شخص آخر'} يجهز هذا الطلب`);
    }
    await trx.updateTable('orders').set({ preparing_by: ctx.userId, updated_at: new Date() }).where('id', '=', id).execute();
    return;
  }
  if (o.status !== 'accepted') throw statusChanged('Only accepted orders can be prepared', 'يمكن تجهيز الطلبات المقبولة فقط');
  await trx.updateTable('orders').set({ status: 'preparing', preparing_by: ctx.userId, updated_at: new Date() }).where('id', '=', id).execute();
  await history(trx, ctx, id, 'accepted', 'preparing');
  await logActivity(trx, ctx, { action: 'preparation_started', entityType: 'order', entityId: id, details: { number: o.order_number } });
}

export async function releasePreparing(trx: Trx, ctx: AuthContext, id: string) {
  const o = await trx.selectFrom('orders').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
  if (!o) throw errors.notFound();
  if (o.status !== 'preparing') throw statusChanged('This order is not being prepared', 'هذا الطلب ليس قيد التجهيز');
  if (o.preparing_by !== ctx.userId && !ctx.roles.includes('owner')) throw errors.notAllowed();
  await trx.updateTable('orders').set({ preparing_by: null, updated_at: new Date() }).where('id', '=', id).execute();
}

// Units of a batch already promised to other prepared orders that have not left yet
async function pickedElsewhere(trx: Trx, batchIds: string[], exceptOrderId: string) {
  if (!batchIds.length) return new Map<string, number>();
  const rows = await trx
    .selectFrom('picks as p')
    .innerJoin('order_lines as l', 'l.id', 'p.order_line_id')
    .innerJoin('orders as o', 'o.id', 'l.order_id')
    .select(['p.batch_id', sql<string>`sum(p.quantity)::text`.as('n')])
    .where('p.batch_id', 'in', batchIds)
    .where('o.status', '=', 'ready')
    .where('o.id', '!=', exceptOrderId)
    .groupBy('p.batch_id')
    .execute();
  return new Map(rows.map((r) => [r.batch_id, Number(r.n)]));
}

// STK-07, STK-08: each line with its picks and the recommended batches, soonest expiry first (C-14)
export async function preparationView(trx: Trx, ctx: AuthContext, id: string) {
  const o = await trx.selectFrom('orders').select(['id', 'status', 'preparing_by']).where('id', '=', id).executeTakeFirst();
  if (!o) throw errors.notFound();
  const w = await trx.selectFrom('wholesalers').select('time_zone').where('id', '=', ctx.wholesalerId).executeTakeFirstOrThrow();
  const s = await trx.selectFrom('settings').select('near_expiry_months').executeTakeFirstOrThrow();
  const today = todayIn(w.time_zone);
  const near = new Date(today + 'T00:00:00Z');
  near.setUTCMonth(near.getUTCMonth() + s.near_expiry_months);
  const nearDate = near.toISOString().slice(0, 10);

  const lines = await trx
    .selectFrom('order_lines as l')
    .innerJoin('products as p', 'p.id', 'l.product_id')
    .leftJoin('medicine_details as m', 'm.product_id', 'p.id')
    .select(['l.id', 'l.product_id', 'l.current_qty', 'l.bonus_qty', 'l.is_must_have', 'p.name_ar', 'p.name_en', 'p.barcode', 'p.track_batches', 'm.storage'])
    .where('l.order_id', '=', id)
    .where('l.current_qty', '>', 0)
    .orderBy('l.line_order')
    .execute();
  const productIds = lines.map((l) => l.product_id);
  const batches = productIds.length
    ? await trx
        .selectFrom('batches')
        .select(['id', 'product_id', 'batch_number', 'expiry_date', 'qty_sellable'])
        .where('product_id', 'in', productIds)
        .where('qty_sellable', '>', 0)
        .orderBy(sql`expiry_date nulls last`)
        .execute()
    : [];
  const elsewhere = await pickedElsewhere(trx, batches.map((b) => b.id), id);
  const picks = lines.length ? await trx.selectFrom('picks').selectAll().where('order_line_id', 'in', lines.map((l) => l.id)).execute() : [];

  return {
    status: o.status,
    preparingByMe: o.preparing_by === ctx.userId,
    lines: lines.map((l) => {
      const need = l.current_qty + l.bonus_qty;
      // Expired batches are never offered (C-55)
      const options = batches
        .filter((b) => b.product_id === l.product_id && (!b.expiry_date || b.expiry_date >= today))
        .map((b) => ({
          batchId: b.id,
          batchNumber: b.batch_number,
          expiryDate: b.expiry_date,
          available: b.qty_sellable - (elsewhere.get(b.id) ?? 0),
          nearExpiry: !!b.expiry_date && b.expiry_date <= nearDate,
        }))
        .filter((b) => b.available > 0);
      let left = need;
      const recommended: Array<{ batchId: string; quantity: number }> = [];
      for (const b of options) {
        if (left <= 0) break;
        const q = Math.min(left, b.available);
        recommended.push({ batchId: b.batchId, quantity: q });
        left -= q;
      }
      const myPicks = picks.filter((p) => p.order_line_id === l.id);
      return {
        orderLineId: l.id,
        productId: l.product_id,
        product: { nameAr: l.name_ar, nameEn: l.name_en },
        barcode: l.barcode,
        trackBatches: l.track_batches,
        keepCold: l.storage === 'fridge',
        mustHave: l.is_must_have,
        quantity: l.current_qty,
        bonusQty: l.bonus_qty,
        need,
        batches: options,
        recommended,
        picks: myPicks.map((p) => ({ batchId: p.batch_id, quantity: p.quantity })),
        picked: myPicks.reduce((s, p) => s + p.quantity, 0),
      };
    }),
  };
}

// STK-08, STK-09: save what was really picked for one line
export async function savePicks(trx: Trx, ctx: AuthContext, orderId: string, lineId: string, picks: Array<{ batchId: string; quantity: number }>) {
  await lockPreparing(trx, ctx, orderId);
  const line = await trx.selectFrom('order_lines').selectAll().where('id', '=', lineId).where('order_id', '=', orderId).executeTakeFirst();
  if (!line) throw errors.notFound();
  const need = line.current_qty + line.bonus_qty;
  const total = picks.reduce((s, p) => s + p.quantity, 0);
  if (total > need) throw errors.rule({ en: `Pick ${need} units, not more`, ar: `اجمع ${need} وحدة فقط` });
  const view = await preparationView(trx, ctx, orderId);
  const lv = view.lines.find((l) => l.orderLineId === lineId)!;
  for (const p of picks) {
    const b = lv.batches.find((x) => x.batchId === p.batchId);
    // Expired or unknown batches cannot be chosen (C-55)
    if (!b) throw errors.rule({ en: 'This batch cannot be picked', ar: 'لا يمكن الاختيار من هذه التشغيلة' }, { batchId: p.batchId });
    if (p.quantity > b.available) {
      throw errors.rule({ en: `Batch ${b.batchNumber ?? ''} has only ${b.available} units`, ar: `التشغيلة ${b.batchNumber ?? ''} بها ${b.available} وحدة فقط` }, { batchId: p.batchId });
    }
  }
  await trx.deleteFrom('picks').where('order_line_id', '=', lineId).execute();
  if (picks.length) {
    await trx
      .insertInto('picks')
      .values(
        picks.map((p) => ({
          wholesaler_id: ctx.wholesalerId,
          order_line_id: lineId,
          batch_id: p.batchId,
          quantity: p.quantity,
          recommended_batch_id: lv.recommended[0]?.batchId ?? null,
          picked_by: ctx.userId,
        })),
      )
      .execute();
  }
  // A batch other than the recommended one is recorded (C-14)
  const changed = picks.some((p) => !lv.recommended.some((r) => r.batchId === p.batchId));
  if (changed) {
    await logActivity(trx, ctx, { action: 'batch_override', entityType: 'order', entityId: orderId, details: { lineId, picks, recommended: lv.recommended } });
  }
}

// STK-10: less was found. A must-have line sends the order to the customer (C-38, C-39).
export async function reduceInPreparation(
  trx: Trx,
  ctx: AuthContext,
  orderId: string,
  lineId: string,
  change: { newQuantity: number; reason: 'not_found' | 'damaged' | 'expired' | 'other'; note?: string | null },
) {
  const o = await lockPreparing(trx, ctx, orderId);
  const mustHave = await reduceLines(trx, ctx, orderId, 'preparation', [{ orderLineId: lineId, ...change }]);
  // Picks are chosen again for the new quantity
  await trx.deleteFrom('picks').where('order_line_id', '=', lineId).execute();
  const customer = await trx.selectFrom('customers').select('user_id').where('id', '=', o.customer_id).executeTakeFirstOrThrow();
  if (mustHave) {
    await trx
      .updateTable('orders')
      .set({ status: 'waiting_for_customer', resume_status: 'preparing', waiting_since: new Date(), reported_to_owner: false, updated_at: new Date() })
      .where('id', '=', orderId)
      .execute();
    await history(trx, ctx, orderId, 'preparing', 'waiting_for_customer', change.reason);
    await notify(trx, ctx.wholesalerId, [customer.user_id], {
      type: 'order_needs_answer',
      title: { en: `Order ${o.order_number} needs your answer`, ar: `الطلب ${o.order_number} يحتاج ردك` },
      body: { en: 'A product you must have was reduced. Accept the change or cancel the order', ar: 'تم تقليل منتج ضروري لك. اقبل التغيير أو ألغِ الطلب' },
      entityType: 'order',
      entityId: orderId,
    });
  } else {
    await notify(trx, ctx.wholesalerId, [customer.user_id], {
      type: 'order_changed',
      title: { en: `A quantity in order ${o.order_number} was reduced`, ar: `تم تقليل كمية في الطلب ${o.order_number}` },
      entityType: 'order',
      entityId: orderId,
    });
  }
  await logActivity(trx, ctx, { action: 'order_line_reduced', entityType: 'order', entityId: orderId, reason: change.note ?? change.reason, details: { lineId, newQuantity: change.newQuantity } });
}

// STK-11: every line has its batches. The order becomes Ready and the delivery manager sees it (C-28).
export async function confirmPreparation(trx: Trx, ctx: AuthContext, orderId: string) {
  const o = await lockPreparing(trx, ctx, orderId);
  const view = await preparationView(trx, ctx, orderId);
  const missing = view.lines.filter((l) => l.picked !== l.need);
  if (missing.length) {
    throw errors.rule(
      { en: 'Every product needs its batches and full quantity first', ar: 'يجب اختيار التشغيلات والكمية الكاملة لكل منتج أولاً' },
      { lines: missing.map((l) => l.orderLineId) },
    );
  }
  // The same batch cannot be promised twice to orders waiting for delivery
  for (const l of view.lines) {
    for (const p of l.picks) {
      const b = l.batches.find((x) => x.batchId === p.batchId);
      if (!b || p.quantity > b.available) {
        throw errors.rule({ en: 'A picked batch no longer has enough units. Pick again', ar: 'تشغيلة مختارة لم تعد بها كمية كافية. اختر مرة أخرى' }, { orderLineId: l.orderLineId });
      }
    }
  }
  await trx.updateTable('orders').set({ status: 'ready', preparing_by: null, updated_at: new Date() }).where('id', '=', orderId).execute();
  await history(trx, ctx, orderId, 'preparing', 'ready');
  await logActivity(trx, ctx, { action: 'preparation_confirmed', entityType: 'order', entityId: orderId, details: { number: o.order_number } });
  await notify(trx, ctx.wholesalerId, (await usersWithRoles(trx, ['delivery_manager'])).filter((u) => u !== ctx.userId), {
    type: 'order_ready',
    title: { en: `Order ${o.order_number} is ready for delivery`, ar: `الطلب ${o.order_number} جاهز للتوصيل` },
    entityType: 'order',
    entityId: orderId,
  });
}
