import { applyDiscount, bonusUnits, fromPiasters, toPiasters, type CartInput, type OrderStatus } from '@cosmo/shared';
import type { Trx } from '../../core/db';
import { AppError, errors } from '../../core/errors';
import { logActivity, type Actor } from '../../core/activity';
import { notify, usersWithRoles } from '../../core/notifications';
import { nextNumber } from '../../core/numbers';
import type { AuthContext } from '../../core/context';
import { offerIsCurrent } from '../catalog/products.service';
import { releaseForOrder, reserveForOrder, todayIn, type Shortage } from '../stock/stock.service';
import { currentOpenStatus } from '../settings/open-status';
import { cancelInvoiceOf, createInvoiceIfMoment, syncInvoice } from '../billing/billing.service';

// ---------- Prices: always from the database, never from the request ----------

interface PricedLine {
  productId: string;
  nameAr: string;
  nameEn: string;
  quantity: number;
  mustHave: boolean;
  unitPrice: string;
  discountPercent: string | null;
  offerId: string | null;
  offerBuy: number | null;
  offerFree: number | null;
  bonusQty: number;
  lineTotal: string;
  keepCold: boolean;
}

export function lineAmounts(qty: number, unitPrice: string, discountPercent: string | null, offerBuy: number | null, offerFree: number | null) {
  const price = discountPercent ? applyDiscount(unitPrice, discountPercent) : unitPrice;
  return {
    bonusQty: offerBuy && offerFree ? bonusUnits(qty, offerBuy, offerFree) : 0,
    lineTotal: fromPiasters(toPiasters(price) * qty),
    gross: toPiasters(unitPrice) * qty,
  };
}

async function customerFor(trx: Trx, ctx: AuthContext, customerId?: string) {
  const id = ctx.userType === 'customer' ? ctx.customerId! : customerId;
  if (!id) throw errors.validation({ fields: { customerId: 'required' } });
  const c = await trx.selectFrom('customers').select(['id', 'user_id', 'business_name', 'is_active', 'credit_allowed', 'credit_days']).where('id', '=', id).executeTakeFirst();
  if (!c) throw errors.notFound();
  if (!c.is_active) throw errors.rule({ en: 'This customer account is deactivated', ar: 'حساب العميل موقوف' });
  return c;
}

export async function priceCart(trx: Trx, ctx: AuthContext, input: CartInput) {
  const customer = await customerFor(trx, ctx, input.customerId);
  if (input.paymentChoice === 'credit' && !customer.credit_allowed) {
    throw errors.rule({ en: 'Credit is not allowed for this customer', ar: 'الآجل غير مسموح لهذا العميل' }, { field: 'paymentChoice' });
  }
  const ids = input.lines.map((l) => l.productId);
  const products = await trx
    .selectFrom('products as p')
    .innerJoin('product_stock as s', 's.product_id', 'p.id')
    .leftJoin('medicine_details as m', 'm.product_id', 'p.id')
    .select(['p.id', 'p.name_ar', 'p.name_en', 'p.selling_price', 'p.is_active', 's.on_hand_sellable', 's.reserved', 'm.storage'])
    .where('p.id', 'in', ids)
    .execute();
  const w = await trx.selectFrom('wholesalers').select('time_zone').where('id', '=', ctx.wholesalerId).executeTakeFirstOrThrow();
  const today = todayIn(w.time_zone);
  const offers = await trx.selectFrom('offers').selectAll().where('product_id', 'in', ids).where('is_active', '=', true).execute();

  const lines: PricedLine[] = [];
  const unavailable: string[] = [];
  for (const l of input.lines) {
    const p = products.find((x) => x.id === l.productId);
    if (!p || !p.is_active) {
      unavailable.push(l.productId);
      continue;
    }
    const offer = offers.find((o) => o.product_id === p.id && offerIsCurrent(o, today));
    const discountPercent = offer?.offer_type === 'discount' ? offer.discount_percent : null;
    const offerBuy = offer?.offer_type === 'bonus' ? offer.buy_quantity : null;
    const offerFree = offer?.offer_type === 'bonus' ? offer.free_quantity : null;
    const a = lineAmounts(l.quantity, p.selling_price, discountPercent, offerBuy, offerFree);
    lines.push({
      productId: p.id,
      nameAr: p.name_ar,
      nameEn: p.name_en,
      quantity: l.quantity,
      mustHave: l.mustHave,
      unitPrice: p.selling_price,
      discountPercent,
      offerId: offer?.id ?? null,
      offerBuy,
      offerFree,
      bonusQty: a.bonusQty,
      lineTotal: a.lineTotal,
      keepCold: p.storage === 'fridge',
    });
  }
  if (unavailable.length) {
    throw errors.rule({ en: 'Some products are no longer available', ar: 'بعض المنتجات لم تعد متاحة' }, { unavailable });
  }
  const gross = lines.reduce((s, l) => s + toPiasters(l.unitPrice) * l.quantity, 0);
  const total = lines.reduce((s, l) => s + toPiasters(l.lineTotal), 0);

  // Customers see "in stock" only (C-56), so a shortage tells how many can be ordered, not the stock level
  const shortages: Shortage[] = lines
    .map((l) => {
      const p = products.find((x) => x.id === l.productId)!;
      return { productId: l.productId, requested: l.quantity + l.bonusQty, available: Math.max(0, p.on_hand_sellable - p.reserved) };
    })
    .filter((s) => s.requested > s.available);

  const settings = await trx.selectFrom('settings').select('minimum_order_value').executeTakeFirstOrThrow();
  const minimum = settings.minimum_order_value;
  return {
    customer,
    lines,
    subtotal: fromPiasters(gross),
    discountTotal: fromPiasters(gross - total),
    total: fromPiasters(total),
    minimumOrderValue: minimum,
    belowMinimum: minimum !== null && total < toPiasters(minimum),
    shortages,
  };
}

function shortageError(shortages: Shortage[], lines: PricedLine[]) {
  const first = shortages[0]!;
  const line = lines.find((l) => l.productId === first.productId)!;
  return new AppError(
    409,
    'RULE_BROKEN',
    {
      en: `Not enough ${line.nameEn}. You can order up to ${first.available}, free units included`,
      ar: `الكمية المتاحة من ${line.nameAr} غير كافية. يمكنك طلب حتى ${first.available} شاملة الوحدات المجانية`,
    },
    { code: 'NOT_ENOUGH_STOCK', shortages },
  );
}

// ---------- Placing (C-25, C-32, C-37, C-41, C-54, C-76) ----------

export async function placeOrder(trx: Trx, ctx: AuthContext, input: CartInput, idempotencyKey: string | null) {
  if (idempotencyKey) {
    const existing = await trx.selectFrom('orders').select('id').where('idempotency_key', '=', idempotencyKey).executeTakeFirst();
    if (existing) return existing.id;
  }
  const priced = await priceCart(trx, ctx, input);
  if (priced.belowMinimum) {
    throw new AppError(409, 'RULE_BROKEN', {
      en: `The minimum order is ${priced.minimumOrderValue} EGP`,
      ar: `الحد الأدنى للطلب ${priced.minimumOrderValue} جنيه`,
    }, { code: 'BELOW_MINIMUM_ORDER', minimum: priced.minimumOrderValue });
  }
  const open = await currentOpenStatus(trx, ctx.wholesalerId);
  const number = await nextNumber(trx, ctx.wholesalerId, 'order', 'ORD');
  const order = await trx
    .insertInto('orders')
    .values({
      wholesaler_id: ctx.wholesalerId,
      order_number: number,
      customer_id: priced.customer.id,
      placed_by: ctx.userId,
      payment_choice: input.paymentChoice,
      subtotal: priced.subtotal,
      discount_total: priced.discountTotal,
      total: priced.total,
      placed_while_closed: !open.open,
      waiting_since: new Date(),
      idempotency_key: idempotencyKey,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  await trx
    .insertInto('order_lines')
    .values(
      priced.lines.map((l, i) => ({
        wholesaler_id: ctx.wholesalerId,
        order_id: order.id,
        product_id: l.productId,
        is_must_have: l.mustHave,
        ordered_qty: l.quantity,
        current_qty: l.quantity,
        bonus_qty: l.bonusQty,
        unit_price: l.unitPrice,
        discount_percent: l.discountPercent,
        offer_id: l.offerId,
        offer_buy: l.offerBuy,
        offer_free: l.offerFree,
        line_total: l.lineTotal,
        line_order: i,
      })),
    )
    .execute();
  // Creating the order and reserving the stock happen together, or not at all
  const shortages = await reserveForOrder(
    trx,
    ctx,
    order.id,
    priced.lines.map((l) => ({ productId: l.productId, quantity: l.quantity + l.bonusQty })),
  );
  if (shortages.length) throw shortageError(shortages, priced.lines);

  await history(trx, ctx, order.id, null, 'placed');
  await logActivity(trx, ctx, { action: 'order_placed', entityType: 'order', entityId: order.id, details: { number, total: priced.total } });
  const staff = await usersWithRoles(trx, ['owner', 'stock_manager']);
  await notify(trx, ctx.wholesalerId, staff.filter((u) => u !== ctx.userId), {
    type: 'order_placed',
    title: { en: `New order ${number}`, ar: `طلب جديد ${number}` },
    body: { en: `${priced.customer.business_name} · ${priced.total} EGP`, ar: `${priced.customer.business_name} · ${priced.total} جنيه` },
    entityType: 'order',
    entityId: order.id,
  });
  return order.id;
}

// ---------- Reading ----------

export async function loadOrder(trx: Trx, id: string, viewer: AuthContext) {
  const o = await trx
    .selectFrom('orders as o')
    .innerJoin('customers as c', 'c.id', 'o.customer_id')
    .leftJoin('employees as e', 'e.user_id', 'o.placed_by')
    .selectAll('o')
    .select(['c.business_name', 'c.phone as customer_phone', 'c.address as customer_address', 'c.user_id as customer_user_id', 'e.name as placed_by_name'])
    .where('o.id', '=', id)
    .executeTakeFirst();
  if (!o) throw errors.notFound();
  if (viewer.userType === 'customer' && o.customer_id !== viewer.customerId) throw errors.notFound();

  const lines = await trx
    .selectFrom('order_lines as l')
    .innerJoin('products as p', 'p.id', 'l.product_id')
    .leftJoin('medicine_details as m', 'm.product_id', 'p.id')
    .selectAll('l')
    .select(['p.name_ar', 'p.name_en', 'p.pack_size', 'm.storage'])
    .where('l.order_id', '=', id)
    .orderBy('l.line_order')
    .execute();
  const changes = lines.length
    ? await trx
        .selectFrom('order_line_changes as c')
        .leftJoin('employees as e', 'e.user_id', 'c.changed_by')
        .selectAll('c')
        .select('e.name')
        .where('c.order_line_id', 'in', lines.map((l) => l.id))
        .orderBy('c.changed_at')
        .execute()
    : [];
  const hist = await trx
    .selectFrom('order_status_history as h')
    .leftJoin('employees as e', 'e.user_id', 'h.changed_by')
    .leftJoin('customers as c', 'c.user_id', 'h.changed_by')
    .selectAll('h')
    .select(['e.name as employee_name', 'c.business_name as customer_name'])
    .where('h.order_id', '=', id)
    .orderBy('h.changed_at')
    .execute();
  const isEmployee = viewer.userType === 'employee';
  return {
    id: o.id,
    orderNumber: o.order_number,
    status: o.status as OrderStatus,
    paymentChoice: o.payment_choice,
    customer: { id: o.customer_id, businessName: o.business_name, ...(isEmployee && { phone: o.customer_phone, address: o.customer_address }) },
    placedBy: o.placed_by === o.customer_user_id ? null : o.placed_by_name,
    subtotal: o.subtotal,
    discountTotal: o.discount_total,
    total: o.total,
    placedWhileClosed: o.placed_while_closed,
    placedAt: o.placed_at,
    waitingSince: o.waiting_since,
    ...(isEmployee && { reportedToOwner: o.reported_to_owner }),
    lines: lines.map((l) => ({
      id: l.id,
      productId: l.product_id,
      product: { nameAr: l.name_ar, nameEn: l.name_en },
      packSize: l.pack_size,
      keepCold: l.storage === 'fridge',
      mustHave: l.is_must_have,
      orderedQty: l.ordered_qty,
      currentQty: l.current_qty,
      bonusQty: l.bonus_qty,
      unitPrice: l.unit_price,
      discountPercent: l.discount_percent,
      offerBuy: l.offer_buy,
      offerFree: l.offer_free,
      lineTotal: l.line_total,
      changes: changes
        .filter((c) => c.order_line_id === l.id)
        .map((c) => ({ stage: c.stage, oldQty: c.old_qty, newQty: c.new_qty, reason: c.reason, note: c.note, by: c.name, at: c.changed_at })),
    })),
    history: hist.map((h) => ({
      from: h.from_status,
      to: h.to_status,
      by: h.employee_name ?? h.customer_name ?? null,
      reason: h.reason,
      at: h.changed_at,
    })),
  };
}

// ---------- Changing status ----------

async function history(trx: Trx, actor: Actor, orderId: string, from: OrderStatus | null, to: OrderStatus, reason?: string | null) {
  await trx
    .insertInto('order_status_history')
    .values({ wholesaler_id: actor.wholesalerId, order_id: orderId, from_status: from, to_status: to, changed_by: actor.userId, reason: reason ?? null })
    .execute();
}

const statusChanged = () =>
  new AppError(409, 'STATUS_CHANGED', {
    en: 'This order changed in the meantime. Please look at it again',
    ar: 'تغير هذا الطلب في هذه الأثناء. من فضلك راجعه مرة أخرى',
  });

async function lockOrder(trx: Trx, id: string, allowed: OrderStatus[]) {
  const o = await trx.selectFrom('orders').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
  if (!o) throw errors.notFound();
  if (!allowed.includes(o.status as OrderStatus)) throw statusChanged();
  return o;
}

async function customerUser(trx: Trx, customerId: string) {
  return (await trx.selectFrom('customers').select('user_id').where('id', '=', customerId).executeTakeFirstOrThrow()).user_id;
}

async function recalcTotals(trx: Trx, orderId: string) {
  const lines = await trx.selectFrom('order_lines').select(['current_qty', 'unit_price', 'line_total']).where('order_id', '=', orderId).execute();
  const gross = lines.reduce((s, l) => s + toPiasters(l.unit_price) * l.current_qty, 0);
  const total = lines.reduce((s, l) => s + toPiasters(l.line_total), 0);
  await trx
    .updateTable('orders')
    .set({ subtotal: fromPiasters(gross), discount_total: fromPiasters(gross - total), total: fromPiasters(total), updated_at: new Date() })
    .where('id', '=', orderId)
    .execute();
}

// Reduces lines (C-38). Returns true when a must-have line was changed (C-39).
export async function reduceLines(
  trx: Trx,
  actor: Actor,
  orderId: string,
  stage: 'acceptance' | 'preparation',
  changes: Array<{ orderLineId: string; newQuantity: number; reason: 'not_found' | 'damaged' | 'expired' | 'other'; note?: string | null }>,
) {
  let mustHaveChanged = false;
  for (const c of changes) {
    const line = await trx.selectFrom('order_lines').selectAll().where('id', '=', c.orderLineId).where('order_id', '=', orderId).executeTakeFirst();
    if (!line) throw errors.notFound();
    if (c.newQuantity >= line.current_qty) {
      throw errors.rule({ en: 'A quantity can only be reduced', ar: 'يمكن تقليل الكمية فقط' }, { orderLineId: c.orderLineId });
    }
    const a = lineAmounts(c.newQuantity, line.unit_price, line.discount_percent, line.offer_buy, line.offer_free);
    const released = line.current_qty + line.bonus_qty - (c.newQuantity + a.bonusQty);
    await trx
      .updateTable('order_lines')
      .set({ current_qty: c.newQuantity, bonus_qty: a.bonusQty, line_total: a.lineTotal })
      .where('id', '=', line.id)
      .execute();
    await trx
      .insertInto('order_line_changes')
      .values({
        wholesaler_id: actor.wholesalerId,
        order_line_id: line.id,
        stage,
        old_qty: line.current_qty,
        new_qty: c.newQuantity,
        reason: c.reason,
        note: c.note ?? null,
        changed_by: actor.userId,
      })
      .execute();
    await releaseForOrder(trx, actor, orderId, line.product_id, released, c.reason);
    if (line.is_must_have) mustHaveChanged = true;
  }
  const left = await trx.selectFrom('order_lines').select('id').where('order_id', '=', orderId).where('current_qty', '>', 0).executeTakeFirst();
  if (!left) {
    throw errors.rule({
      en: 'Every product would be removed. Reject or cancel the order instead',
      ar: 'سيتم حذف كل المنتجات. ارفض الطلب أو ألغه بدلاً من ذلك',
    });
  }
  await recalcTotals(trx, orderId);
  await syncInvoice(trx, orderId);
  return mustHaveChanged;
}

export async function acceptOrder(trx: Trx, actor: Actor, id: string, changes: Parameters<typeof reduceLines>[4]) {
  const o = await lockOrder(trx, id, ['placed']);
  const mustHave = changes.length ? await reduceLines(trx, actor, id, 'acceptance', changes) : false;
  const next: OrderStatus = mustHave ? 'waiting_for_customer' : 'accepted';
  await trx
    .updateTable('orders')
    .set({
      status: next,
      resume_status: mustHave ? 'accepted' : null,
      waiting_since: mustHave ? new Date() : null,
      reported_to_owner: false,
      updated_at: new Date(),
    })
    .where('id', '=', id)
    .execute();
  await history(trx, actor, id, 'placed', next);
  if (next === 'accepted') await createInvoiceIfMoment(trx, actor, id, 'on_accepted');
  await logActivity(trx, actor, { action: mustHave ? 'order_changed_waiting' : 'order_accepted', entityType: 'order', entityId: id, details: { number: o.order_number, changes: changes.length } });
  const recipient = await customerUser(trx, o.customer_id);
  await notify(trx, actor.wholesalerId, [recipient], mustHave
    ? {
        type: 'order_needs_answer',
        title: { en: `Order ${o.order_number} needs your answer`, ar: `الطلب ${o.order_number} يحتاج ردك` },
        body: { en: 'A product you must have was reduced. Accept the change or cancel the order', ar: 'تم تقليل منتج ضروري لك. اقبل التغيير أو ألغِ الطلب' },
        entityType: 'order',
        entityId: id,
      }
    : {
        type: 'order_accepted',
        title: { en: `Order ${o.order_number} was accepted`, ar: `تم قبول الطلب ${o.order_number}` },
        body: changes.length ? { en: 'Some quantities were changed. See the order', ar: 'تم تغيير بعض الكميات. راجع الطلب' } : undefined,
        entityType: 'order',
        entityId: id,
      });
  return next;
}

async function releaseAll(trx: Trx, actor: Actor, orderId: string, reason: string | null) {
  const lines = await trx.selectFrom('order_lines').select(['product_id', 'current_qty', 'bonus_qty']).where('order_id', '=', orderId).execute();
  for (const l of lines) await releaseForOrder(trx, actor, orderId, l.product_id, l.current_qty + l.bonus_qty, reason ?? undefined);
}

// C-24: a rejection needs a reason the customer sees. The owner gets an alert.
export async function rejectOrder(trx: Trx, actor: Actor, id: string, reason: string) {
  const o = await lockOrder(trx, id, ['placed']);
  await releaseAll(trx, actor, id, reason);
  await trx.updateTable('orders').set({ status: 'rejected', waiting_since: null, updated_at: new Date() }).where('id', '=', id).execute();
  await history(trx, actor, id, 'placed', 'rejected', reason);
  await logActivity(trx, actor, { action: 'order_rejected', entityType: 'order', entityId: id, reason, details: { number: o.order_number }, important: true });
  await notify(trx, actor.wholesalerId, [await customerUser(trx, o.customer_id)], {
    type: 'order_rejected',
    title: { en: `Order ${o.order_number} was rejected`, ar: `تم رفض الطلب ${o.order_number}` },
    body: { en: reason, ar: reason },
    entityType: 'order',
    entityId: id,
  });
  await notify(trx, actor.wholesalerId, (await usersWithRoles(trx, ['owner'])).filter((u) => u !== actor.userId), {
    type: 'order_rejected',
    title: { en: `Order ${o.order_number} was rejected`, ar: `تم رفض الطلب ${o.order_number}` },
    body: { en: reason, ar: reason },
    entityType: 'order',
    entityId: id,
  });
}

// C-39: the customer accepts the change or cancels
export async function answerChange(trx: Trx, ctx: AuthContext, id: string, answer: 'accept_change' | 'cancel') {
  const o = await lockOrder(trx, id, ['waiting_for_customer']);
  if (o.customer_id !== ctx.customerId) throw errors.notFound();
  if (answer === 'cancel') return cancelOrder(trx, ctx, id, null);
  const next = (o.resume_status ?? 'accepted') as OrderStatus;
  await trx.updateTable('orders').set({ status: next, resume_status: null, waiting_since: null, updated_at: new Date() }).where('id', '=', id).execute();
  await history(trx, ctx, id, 'waiting_for_customer', next);
  if (next === 'accepted') await createInvoiceIfMoment(trx, ctx, id, 'on_accepted');
  await logActivity(trx, ctx, { action: 'order_change_accepted', entityType: 'order', entityId: id, details: { number: o.order_number } });
  const staff = await usersWithRoles(trx, ['owner', 'stock_manager']);
  await notify(trx, ctx.wholesalerId, staff, {
    type: 'order_change_accepted',
    title: { en: `The customer accepted the change to ${o.order_number}`, ar: `العميل قبل التغيير في الطلب ${o.order_number}` },
    entityType: 'order',
    entityId: id,
  });
}

// C-57: the customer can cancel before preparation; the stock manager and the owner until the trip starts
export async function cancelOrder(trx: Trx, actor: AuthContext, id: string, reason: string | null) {
  const byCustomer = actor.userType === 'customer';
  const allowed: OrderStatus[] = byCustomer ? ['placed', 'waiting_for_customer', 'accepted'] : ['placed', 'waiting_for_customer', 'accepted', 'preparing', 'ready'];
  const current = await trx.selectFrom('orders').select(['status', 'customer_id']).where('id', '=', id).executeTakeFirst();
  if (!current) throw errors.notFound();
  if (byCustomer && current.customer_id !== actor.customerId) throw errors.notFound();
  if (!allowed.includes(current.status as OrderStatus)) {
    throw new AppError(409, 'STATUS_CHANGED', {
      en: byCustomer ? 'This order can no longer be cancelled here. Please contact the wholesaler' : 'This order can no longer be cancelled',
      ar: byCustomer ? 'لا يمكن إلغاء هذا الطلب من هنا الآن. من فضلك تواصل مع تاجر الجملة' : 'لا يمكن إلغاء هذا الطلب الآن',
    });
  }
  if (!byCustomer && !reason) throw errors.validation({ fields: { reason: 'reason_required' } });
  const o = await lockOrder(trx, id, allowed);
  await cancelInvoiceOf(trx, actor, id);
  await releaseAll(trx, actor, id, reason);
  await trx.updateTable('orders').set({ status: 'cancelled', waiting_since: null, preparing_by: null, updated_at: new Date() }).where('id', '=', id).execute();
  // A cancelled order leaves any trip that has not started
  await trx
    .deleteFrom('trip_stops')
    .where('order_id', '=', id)
    .where('trip_id', 'in', (eb) => eb.selectFrom('trips').select('id').where('status', '=', 'planned'))
    .execute();
  await history(trx, actor, id, o.status as OrderStatus, 'cancelled', reason);
  await logActivity(trx, actor, {
    action: 'order_cancelled',
    entityType: 'order',
    entityId: id,
    reason,
    details: { number: o.order_number, by: actor.userType },
    important: !byCustomer,
  });
  const title = { en: `Order ${o.order_number} was cancelled`, ar: `تم إلغاء الطلب ${o.order_number}` };
  if (byCustomer) {
    await notify(trx, actor.wholesalerId, await usersWithRoles(trx, ['owner', 'stock_manager']), { type: 'order_cancelled', title, entityType: 'order', entityId: id });
  } else {
    // C-35: the customer is told why
    await notify(trx, actor.wholesalerId, [await customerUser(trx, o.customer_id)], {
      type: 'order_cancelled',
      title,
      body: { en: reason!, ar: reason! },
      entityType: 'order',
      entityId: id,
    });
    await notify(trx, actor.wholesalerId, (await usersWithRoles(trx, ['owner'])).filter((u) => u !== actor.userId), {
      type: 'order_cancelled',
      title,
      body: { en: `${actor.name}: ${reason}`, ar: `${actor.name}: ${reason}` },
      entityType: 'order',
      entityId: id,
    });
  }
}
