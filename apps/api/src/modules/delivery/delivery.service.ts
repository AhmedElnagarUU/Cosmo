import { fromPiasters, toPiasters } from '@cosmo/shared';
import type { Trx } from '../../core/db';
import { AppError, errors } from '../../core/errors';
import { logActivity } from '../../core/activity';
import { notify, usersWithRoles } from '../../core/notifications';
import { nextNumber } from '../../core/numbers';
import type { AuthContext } from '../../core/context';
import { returnShippedOrder, shipOrder, todayIn } from '../stock/stock.service';
import { createInvoiceIfMoment, invoiceOf, tryCloseTrip } from '../billing/billing.service';

// Delivery (docs/workflows/04-delivery.md): C-20, C-21, C-25, C-27, C-28, C-44, C-47, C-61, C-81

const changed = (en: string, ar: string) => new AppError(409, 'STATUS_CHANGED', { en, ar });

async function history(trx: Trx, ctx: AuthContext, orderId: string, from: string, to: string, reason?: string | null) {
  await trx
    .insertInto('order_status_history')
    .values({ wholesaler_id: ctx.wholesalerId, order_id: orderId, from_status: from as never, to_status: to as never, changed_by: ctx.userId, reason: reason ?? null })
    .execute();
}

export async function deliveryPeople(trx: Trx) {
  return trx
    .selectFrom('employee_roles as r')
    .innerJoin('employees as e', 'e.id', 'r.employee_id')
    .innerJoin('users as u', 'u.id', 'e.user_id')
    .select(['u.id as userId', 'e.name'])
    .where('r.role', '=', 'delivery')
    .where('u.is_active', '=', true)
    .orderBy('e.name')
    .execute();
}

async function checkPerson(trx: Trx, userId: string) {
  const ok = (await deliveryPeople(trx)).some((p) => p.userId === userId);
  if (!ok) throw errors.rule({ en: 'Choose an active delivery person', ar: 'اختر مندوب توصيل نشطاً' }, { field: 'deliveryPersonId' });
}

async function setStops(trx: Trx, ctx: AuthContext, tripId: string, orderIds: string[]) {
  const orders = await trx.selectFrom('orders').select(['id', 'status']).where('id', 'in', orderIds).execute();
  const notReady = orderIds.filter((id) => orders.find((o) => o.id === id)?.status !== 'ready');
  if (notReady.length) throw errors.rule({ en: 'Only ready orders can be added to a trip', ar: 'يمكن إضافة الطلبات الجاهزة فقط إلى الرحلة' }, { orderIds: notReady });
  await trx.deleteFrom('trip_stops').where('trip_id', '=', tripId).execute();
  try {
    await trx
      .insertInto('trip_stops')
      .values(orderIds.map((orderId, i) => ({ wholesaler_id: ctx.wholesalerId, trip_id: tripId, order_id: orderId, stop_position: i + 1 })))
      .execute();
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === '23505') {
      throw errors.rule({ en: 'An order is already in another trip', ar: 'يوجد طلب في رحلة أخرى بالفعل' });
    }
    throw e;
  }
}

// DM-02: group ready orders into a trip and assign one delivery person
export async function createTrip(trx: Trx, ctx: AuthContext, input: { deliveryPersonId: string; orderIds: string[] }) {
  await checkPerson(trx, input.deliveryPersonId);
  const number = await nextNumber(trx, ctx.wholesalerId, 'trip', 'TRP');
  const trip = await trx
    .insertInto('trips')
    .values({ wholesaler_id: ctx.wholesalerId, trip_number: number, delivery_person_id: input.deliveryPersonId, created_by: ctx.userId })
    .returning('id')
    .executeTakeFirstOrThrow();
  await setStops(trx, ctx, trip.id, input.orderIds);
  await logActivity(trx, ctx, { action: 'trip_created', entityType: 'trip', entityId: trip.id, details: { number, orders: input.orderIds.length } });
  await notify(trx, ctx.wholesalerId, [input.deliveryPersonId], {
    type: 'trip_assigned',
    title: { en: `New trip ${number}`, ar: `رحلة جديدة ${number}` },
    body: { en: `${input.orderIds.length} stops`, ar: `${input.orderIds.length} محطات` },
    entityType: 'trip',
    entityId: trip.id,
  });
  return trip.id;
}

async function lockTrip(trx: Trx, id: string) {
  const t = await trx.selectFrom('trips').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
  if (!t) throw errors.notFound();
  return t;
}

// DM-03: change a trip before it starts
export async function updateTrip(trx: Trx, ctx: AuthContext, id: string, input: { deliveryPersonId?: string; orderIds?: string[] }) {
  const t = await lockTrip(trx, id);
  if (t.status !== 'planned') throw changed('A trip cannot change after it starts', 'لا يمكن تغيير الرحلة بعد بدئها');
  if (input.deliveryPersonId) {
    await checkPerson(trx, input.deliveryPersonId);
    await trx.updateTable('trips').set({ delivery_person_id: input.deliveryPersonId }).where('id', '=', id).execute();
  }
  if (input.orderIds) await setStops(trx, ctx, id, input.orderIds);
  await logActivity(trx, ctx, { action: 'trip_changed', entityType: 'trip', entityId: id, details: input });
}

export async function deleteTrip(trx: Trx, ctx: AuthContext, id: string) {
  const t = await lockTrip(trx, id);
  if (t.status !== 'planned') throw changed('A trip cannot be deleted after it starts', 'لا يمكن حذف الرحلة بعد بدئها');
  await trx.deleteFrom('trip_stops').where('trip_id', '=', id).execute();
  await trx.deleteFrom('trips').where('id', '=', id).execute();
  await logActivity(trx, ctx, { action: 'trip_deleted', entityType: 'trip', entityId: id, details: { number: t.trip_number } });
}

function ownTrip(ctx: AuthContext, t: { delivery_person_id: string }) {
  // The delivery person sees and changes only their own trips (C-64). The owner can step in.
  if (t.delivery_person_id !== ctx.userId && !ctx.roles.includes('owner')) throw errors.notFound();
}

// DEL-02: one tap starts the trip. Stock leaves the warehouse now (C-25).
export async function startTrip(trx: Trx, ctx: AuthContext, id: string) {
  const t = await lockTrip(trx, id);
  ownTrip(ctx, t);
  if (t.status !== 'planned') throw changed('This trip has already started', 'هذه الرحلة بدأت بالفعل');
  const stops = await trx.selectFrom('trip_stops').select(['order_id']).where('trip_id', '=', id).orderBy('stop_position').execute();
  for (const s of stops) {
    const o = await trx.selectFrom('orders').select(['status']).where('id', '=', s.order_id).forUpdate().executeTakeFirstOrThrow();
    if (o.status !== 'ready') throw changed('An order in this trip is no longer ready. Ask the delivery manager', 'طلب في هذه الرحلة لم يعد جاهزاً. اسأل مدير التوصيل');
    await shipOrder(trx, ctx, s.order_id, id);
    await trx.updateTable('orders').set({ status: 'out_for_delivery', updated_at: new Date() }).where('id', '=', s.order_id).execute();
    await history(trx, ctx, s.order_id, 'ready', 'out_for_delivery');
  }
  await trx.updateTable('trips').set({ status: 'in_progress', started_at: new Date() }).where('id', '=', id).execute();
  await logActivity(trx, ctx, { action: 'trip_started', entityType: 'trip', entityId: id, details: { number: t.trip_number, stops: stops.length } });
}

// C-81: the delivery person can change the order of stops. The change is recorded.
export async function reorderStops(trx: Trx, ctx: AuthContext, id: string, stopIds: string[]) {
  const t = await lockTrip(trx, id);
  ownTrip(ctx, t);
  if (t.status === 'closed') throw changed('This trip is closed', 'هذه الرحلة مغلقة');
  const stops = await trx.selectFrom('trip_stops').select('id').where('trip_id', '=', id).execute();
  if (stops.length !== stopIds.length || !stops.every((s) => stopIds.includes(s.id))) throw errors.validation({ fields: { stopIds: 'must_list_every_stop' } });
  for (const [i, sid] of stopIds.entries()) await trx.updateTable('trip_stops').set({ stop_position: i + 1 }).where('id', '=', sid).execute();
  await logActivity(trx, ctx, { action: 'trip_stops_reordered', entityType: 'trip', entityId: id, details: { stopIds } });
}

async function lockStop(trx: Trx, ctx: AuthContext, stopId: string) {
  const s = await trx.selectFrom('trip_stops').selectAll().where('id', '=', stopId).forUpdate().executeTakeFirst();
  if (!s) throw errors.notFound();
  const t = await lockTrip(trx, s.trip_id);
  return { s, t };
}

async function finishIfDone(trx: Trx, ctx: AuthContext, tripId: string) {
  const waiting = await trx.selectFrom('trip_stops').select('id').where('trip_id', '=', tripId).where('result', '=', 'waiting').executeTakeFirst();
  if (waiting) return;
  const cash = await trx
    .selectFrom('payments as p')
    .innerJoin('trip_stops as s', 's.id', 'p.trip_stop_id')
    .select((eb) => eb.fn.sum<string>('p.amount').as('n'))
    .where('s.trip_id', '=', tripId)
    .where('p.method', '=', 'cash')
    .where('p.status', '!=', 'cancelled')
    .executeTakeFirst();
  await trx
    .updateTable('trips')
    .set({ status: 'finished', finished_at: new Date(), cash_expected: fromPiasters(toPiasters(String(cash?.n ?? '0'))) })
    .where('id', '=', tripId)
    .execute();
  await logActivity(trx, ctx, { action: 'trip_finished', entityType: 'trip', entityId: tripId });
}

// C-63: the credit per unit is what was paid for the line divided by all its units, free ones included
export function unitCredit(lineTotal: string, units: number) {
  return units > 0 ? Math.floor(toPiasters(lineTotal) / units) : 0;
}

// DEL-04, DEL-07: delivered. Refused items become a return with a reason (C-47).
export async function deliverStop(trx: Trx, ctx: AuthContext, stopId: string, input: { refused: Array<{ orderLineId: string; quantity: number }>; refusedReason?: string | null }) {
  const { s, t } = await lockStop(trx, ctx, stopId);
  ownTrip(ctx, t);
  // Reporting the same stop twice has no extra effect
  if (s.result === 'delivered') return;
  if (t.status !== 'in_progress' || s.result !== 'waiting') throw changed('This stop already has a result', 'هذه المحطة لها نتيجة بالفعل');

  const o = await trx.selectFrom('orders').selectAll().where('id', '=', s.order_id).forUpdate().executeTakeFirstOrThrow();
  if (input.refused.length) {
    if (!input.refusedReason) throw errors.validation({ fields: { refusedReason: 'reason_required' } });
    const lines = await trx.selectFrom('order_lines').selectAll().where('order_id', '=', o.id).execute();
    const picks = await trx.selectFrom('picks').selectAll().where('order_line_id', 'in', lines.map((l) => l.id)).execute();
    let refusedAll = true;
    const returnLines: Array<{ order_line_id: string; product_id: string; batch_id: string; quantity: number; unit: number }> = [];
    for (const l of lines) {
      const r = input.refused.find((x) => x.orderLineId === l.id);
      const units = l.current_qty + l.bonus_qty;
      if (!r) {
        if (units > 0) refusedAll = false;
        continue;
      }
      if (r.quantity > units) throw errors.rule({ en: 'More refused than delivered', ar: 'الكمية المرفوضة أكبر من المسلمة' }, { orderLineId: l.id });
      if (r.quantity < units) refusedAll = false;
      // The refused units come from the picked batches, in order
      let left = r.quantity;
      for (const p of picks.filter((x) => x.order_line_id === l.id)) {
        if (left <= 0) break;
        const q = Math.min(left, p.quantity);
        returnLines.push({ order_line_id: l.id, product_id: l.product_id, batch_id: p.batch_id, quantity: q, unit: unitCredit(l.line_total, units) });
        left -= q;
      }
    }
    for (const r of input.refused) if (!lines.some((l) => l.id === r.orderLineId)) throw errors.notFound();
    if (refusedAll) {
      throw errors.rule({ en: 'Everything was refused. Report a failed delivery instead', ar: 'تم رفض كل شيء. سجّل توصيلاً فاشلاً بدلاً من ذلك' });
    }
    const credit = returnLines.reduce((sum, l) => sum + l.unit * l.quantity, 0);
    const ret = await trx
      .insertInto('customer_returns')
      .values({
        wholesaler_id: ctx.wholesalerId,
        return_number: await nextNumber(trx, ctx.wholesalerId, 'customer_return', 'RET'),
        order_id: o.id,
        customer_id: o.customer_id,
        source: 'at_the_door',
        trip_stop_id: s.id,
        reason: 'refused_at_door',
        note: input.refusedReason,
        credit_amount: fromPiasters(credit),
        created_by: ctx.userId,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await trx
      .insertInto('customer_return_lines')
      .values(
        returnLines.map((l) => ({
          wholesaler_id: ctx.wholesalerId,
          customer_return_id: ret.id,
          order_line_id: l.order_line_id,
          product_id: l.product_id,
          batch_id: l.batch_id,
          quantity: l.quantity,
          unit_credit: fromPiasters(l.unit),
          line_credit: fromPiasters(l.unit * l.quantity),
        })),
      )
      .execute();
    await logActivity(trx, ctx, { action: 'items_refused_at_door', entityType: 'order', entityId: o.id, reason: input.refusedReason, details: { returnId: ret.id, credit: fromPiasters(credit) } });
  }
  await trx.updateTable('trip_stops').set({ result: 'delivered', result_at: new Date(), trip_active: false }).where('id', '=', s.id).execute();
  await trx.updateTable('orders').set({ status: 'delivered', updated_at: new Date() }).where('id', '=', o.id).execute();
  await history(trx, ctx, o.id, 'out_for_delivery', 'delivered');
  await createInvoiceIfMoment(trx, ctx, o.id, 'on_delivered');
  await logActivity(trx, ctx, { action: 'order_delivered', entityType: 'order', entityId: o.id, details: { number: o.order_number } });
  const customer = await trx.selectFrom('customers').select('user_id').where('id', '=', o.customer_id).executeTakeFirstOrThrow();
  await notify(trx, ctx.wholesalerId, [customer.user_id], {
    type: 'order_delivered',
    title: { en: `Order ${o.order_number} was delivered`, ar: `تم تسليم الطلب ${o.order_number}` },
    entityType: 'order',
    entityId: o.id,
  });
  await finishIfDone(trx, ctx, t.id);
}

// DEL-06: a failure needs a reason (C-21). The goods stay with the delivery person until they are back.
export async function failStop(trx: Trx, ctx: AuthContext, stopId: string, input: { reason: 'not_available' | 'address_problem' | 'refused' | 'other'; note?: string | null }) {
  const { s, t } = await lockStop(trx, ctx, stopId);
  ownTrip(ctx, t);
  if (s.result === 'failed') return;
  if (t.status !== 'in_progress' || s.result !== 'waiting') throw changed('This stop already has a result', 'هذه المحطة لها نتيجة بالفعل');
  const o = await trx.selectFrom('orders').select(['id', 'order_number']).where('id', '=', s.order_id).forUpdate().executeTakeFirstOrThrow();
  await trx.updateTable('trip_stops').set({ result: 'failed', failure_reason: input.reason, failure_note: input.note ?? null, result_at: new Date() }).where('id', '=', s.id).execute();
  await trx.updateTable('orders').set({ status: 'delivery_failed', updated_at: new Date() }).where('id', '=', o.id).execute();
  await history(trx, ctx, o.id, 'out_for_delivery', 'delivery_failed', input.note ?? input.reason);
  await logActivity(trx, ctx, { action: 'delivery_failed', entityType: 'order', entityId: o.id, reason: input.note ?? input.reason, details: { number: o.order_number } });
  await notify(trx, ctx.wholesalerId, await usersWithRoles(trx, ['delivery_manager', 'owner']), {
    type: 'delivery_failed',
    title: { en: `Delivery of ${o.order_number} failed`, ar: `فشل توصيل الطلب ${o.order_number}` },
    body: { en: input.note ?? input.reason, ar: input.note ?? input.reason },
    entityType: 'order',
    entityId: o.id,
  });
  await finishIfDone(trx, ctx, t.id);
}

// What the customer still has to pay at the door: total, minus refused items, minus payments already recorded
export async function amountToCollect(trx: Trx, orderId: string) {
  const o = await trx.selectFrom('orders').select(['total', 'payment_choice']).where('id', '=', orderId).executeTakeFirstOrThrow();
  if (o.payment_choice === 'credit') return 0;
  const refused = await trx
    .selectFrom('customer_returns')
    .select((eb) => eb.fn.sum<string>('credit_amount').as('n'))
    .where('order_id', '=', orderId)
    .where('source', '=', 'at_the_door')
    .executeTakeFirst();
  const paid = await trx
    .selectFrom('payments')
    .select((eb) => eb.fn.sum<string>('amount').as('n'))
    .where('order_id', '=', orderId)
    .where('status', 'in', ['waiting', 'confirmed'])
    .executeTakeFirst();
  return toPiasters(o.total) - toPiasters(String(refused?.n ?? '0')) - toPiasters(String(paid?.n ?? '0'));
}

// DEL-05: the payment waits for the accountant (C-27)
export async function recordDoorPayment(
  trx: Trx,
  ctx: AuthContext,
  stopId: string,
  input: { method: 'cash' | 'instapay' | 'vodafone_cash'; amount: string; reference?: string | null },
  idempotencyKey: string | null,
) {
  if (idempotencyKey) {
    const existing = await trx.selectFrom('payments').select('id').where('idempotency_key', '=', idempotencyKey).executeTakeFirst();
    if (existing) return existing.id;
  }
  const { s, t } = await lockStop(trx, ctx, stopId);
  ownTrip(ctx, t);
  if (s.result !== 'delivered') throw changed('Mark the stop as delivered first', 'سجّل التسليم أولاً');
  const o = await trx.selectFrom('orders').select(['id', 'customer_id', 'payment_choice']).where('id', '=', s.order_id).forUpdate().executeTakeFirstOrThrow();
  if (o.payment_choice === 'credit') throw errors.rule({ en: 'Credit orders have nothing to collect', ar: 'طلبات الآجل ليس بها مبلغ للتحصيل' });
  const left = await amountToCollect(trx, o.id);
  if (toPiasters(input.amount) > left) {
    throw errors.rule({ en: `The amount is more than the ${fromPiasters(left)} left to pay`, ar: `المبلغ أكبر من المتبقي ${fromPiasters(left)}` }, { left: fromPiasters(left) });
  }
  const w = await trx.selectFrom('wholesalers').select('time_zone').where('id', '=', ctx.wholesalerId).executeTakeFirstOrThrow();
  const p = await trx
    .insertInto('payments')
    .values({
      wholesaler_id: ctx.wholesalerId,
      order_id: o.id,
      invoice_id: (await invoiceOf(trx, o.id))?.id ?? null,
      customer_id: o.customer_id,
      amount: input.amount,
      method: input.method,
      reference: input.reference ?? null,
      paid_on: todayIn(w.time_zone),
      status: 'waiting',
      recorded_by: ctx.userId,
      trip_stop_id: s.id,
      idempotency_key: idempotencyKey,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  if (t.status === 'finished') {
    // A payment recorded after the last stop still counts in the cash to hand over
    const cash = await trx
      .selectFrom('payments as p')
      .innerJoin('trip_stops as st', 'st.id', 'p.trip_stop_id')
      .select((eb) => eb.fn.sum<string>('p.amount').as('n'))
      .where('st.trip_id', '=', t.id)
      .where('p.method', '=', 'cash')
      .where('p.status', '!=', 'cancelled')
      .executeTakeFirst();
    await trx.updateTable('trips').set({ cash_expected: fromPiasters(toPiasters(String(cash?.n ?? '0'))) }).where('id', '=', t.id).execute();
  }
  await logActivity(trx, ctx, { action: 'door_payment_recorded', entityType: 'order', entityId: o.id, details: { amount: input.amount, method: input.method } });
  return p.id;
}

// STK-12: goods from a failed delivery are back. The order is ready for another trip (C-61).
export async function confirmGoodsBack(trx: Trx, ctx: AuthContext, stopId: string) {
  const { s } = await lockStop(trx, ctx, stopId);
  if (s.result !== 'failed') throw changed('Only failed stops bring goods back', 'البضاعة تعود من المحطات الفاشلة فقط');
  if (s.goods_back_confirmed) return;
  const o = await trx.selectFrom('orders').select(['id', 'status', 'order_number']).where('id', '=', s.order_id).forUpdate().executeTakeFirstOrThrow();
  await returnShippedOrder(trx, ctx, o.id, s.trip_id);
  await trx.updateTable('trip_stops').set({ goods_back_confirmed: true, goods_back_by: ctx.userId, trip_active: false }).where('id', '=', s.id).execute();
  await trx.updateTable('orders').set({ status: 'ready', updated_at: new Date() }).where('id', '=', o.id).execute();
  await history(trx, ctx, o.id, 'delivery_failed', 'ready');
  await logActivity(trx, ctx, { action: 'goods_back_confirmed', entityType: 'order', entityId: o.id, details: { number: o.order_number } });
}

// DM-06: the signed paper came back (C-44)
export async function paperReceived(trx: Trx, ctx: AuthContext, stopId: string) {
  const { s } = await lockStop(trx, ctx, stopId);
  if (s.result !== 'delivered') throw changed('Only delivered stops have a signed paper', 'المحطات المسلمة فقط لها ورقة موقعة');
  if (s.signed_paper_received) return;
  await trx.updateTable('trip_stops').set({ signed_paper_received: true, paper_received_by: ctx.userId, paper_received_at: new Date() }).where('id', '=', s.id).execute();
  await logActivity(trx, ctx, { action: 'signed_paper_received', entityType: 'order', entityId: s.order_id });
  await tryCloseTrip(trx, ctx, s.trip_id);
}

// The trip with its stops, for the delivery manager and the delivery person's phone
export async function loadTrip(trx: Trx, id: string) {
  const t = await trx
    .selectFrom('trips as t')
    .leftJoin('employees as e', 'e.user_id', 't.delivery_person_id')
    .selectAll('t')
    .select('e.name as person_name')
    .where('t.id', '=', id)
    .executeTakeFirst();
  if (!t) throw errors.notFound();
  const stops = await trx
    .selectFrom('trip_stops as s')
    .innerJoin('orders as o', 'o.id', 's.order_id')
    .innerJoin('customers as c', 'c.id', 'o.customer_id')
    .selectAll('s')
    .select(['o.order_number', 'o.total', 'o.payment_choice', 'o.status as order_status', 'c.business_name', 'c.phone', 'c.address', 'c.area'])
    .where('s.trip_id', '=', id)
    .orderBy('s.stop_position')
    .execute();
  const orderIds = stops.map((s) => s.order_id);
  const lines = orderIds.length
    ? await trx
        .selectFrom('order_lines as l')
        .innerJoin('products as p', 'p.id', 'l.product_id')
        .leftJoin('medicine_details as m', 'm.product_id', 'p.id')
        .select(['l.id', 'l.order_id', 'l.current_qty', 'l.bonus_qty', 'p.name_ar', 'p.name_en', 'm.storage'])
        .where('l.order_id', 'in', orderIds)
        .where('l.current_qty', '>', 0)
        .orderBy('l.line_order')
        .execute()
    : [];
  const payments = orderIds.length
    ? await trx.selectFrom('payments').select(['id', 'order_id', 'amount', 'method', 'reference', 'status']).where('order_id', 'in', orderIds).where('trip_stop_id', 'is not', null).execute()
    : [];
  const refused = orderIds.length
    ? await trx.selectFrom('customer_returns').select(['order_id', 'credit_amount']).where('order_id', 'in', orderIds).where('source', '=', 'at_the_door').execute()
    : [];
  const out = [];
  for (const s of stops) {
    out.push({
      id: s.id,
      position: s.stop_position,
      orderId: s.order_id,
      orderNumber: s.order_number,
      orderStatus: s.order_status,
      customer: { businessName: s.business_name, phone: s.phone, address: s.address, area: s.area },
      total: s.total,
      paymentChoice: s.payment_choice,
      refusedCredit: refused.find((r) => r.order_id === s.order_id)?.credit_amount ?? null,
      toCollect: fromPiasters(Math.max(0, await amountToCollect(trx, s.order_id))),
      result: s.result,
      failureReason: s.failure_reason,
      failureNote: s.failure_note,
      goodsBackConfirmed: s.goods_back_confirmed,
      signedPaperReceived: s.signed_paper_received,
      keepCold: lines.some((l) => l.order_id === s.order_id && l.storage === 'fridge'),
      lines: lines
        .filter((l) => l.order_id === s.order_id)
        .map((l) => ({ id: l.id, product: { nameAr: l.name_ar, nameEn: l.name_en }, quantity: l.current_qty, bonusQty: l.bonus_qty, keepCold: l.storage === 'fridge' })),
      payments: payments.filter((p) => p.order_id === s.order_id).map((p) => ({ id: p.id, amount: p.amount, method: p.method, reference: p.reference, status: p.status })),
    });
  }
  return {
    id: t.id,
    tripNumber: t.trip_number,
    status: t.status,
    deliveryPersonId: t.delivery_person_id,
    deliveryPerson: t.person_name,
    createdAt: t.created_at,
    startedAt: t.started_at,
    finishedAt: t.finished_at,
    cashExpected: t.cash_expected,
    stops: out,
  };
}
