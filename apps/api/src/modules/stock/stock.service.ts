import type { Trx } from '../../core/db';
import type { MovementType } from '../../core/schema';
import { errors } from '../../core/errors';
import { logActivity, type Actor } from '../../core/activity';
import { notify, usersWithRoles } from '../../core/notifications';

// The only module that changes stock (docs/technical/03-project-structure.md).
// Every change writes the summary rows and a ledger row in the same transaction (C-09).

export async function createStockFor(trx: Trx, wholesalerId: string, productId: string, trackBatches: boolean) {
  await trx.insertInto('product_stock').values({ product_id: productId, wholesaler_id: wholesalerId }).execute();
  if (!trackBatches) {
    await trx.insertInto('batches').values({ wholesaler_id: wholesalerId, product_id: productId }).execute();
  }
}

// Locks the product's stock row, so two changes to one product happen one after the other
export async function lockProductStock(trx: Trx, productId: string) {
  const row = await trx.selectFrom('product_stock').selectAll().where('product_id', '=', productId).forUpdate().executeTakeFirst();
  if (!row) throw errors.notFound();
  return row;
}

async function lockBatch(trx: Trx, productId: string, batchId: string) {
  const b = await trx
    .selectFrom('batches')
    .selectAll()
    .where('id', '=', batchId)
    .where('product_id', '=', productId)
    .forUpdate()
    .executeTakeFirst();
  if (!b) throw errors.notFound();
  return b;
}

export function todayIn(timeZone: string, at = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(at);
}

async function today(trx: Trx, wholesalerId: string) {
  const w = await trx.selectFrom('wholesalers').select('time_zone').where('id', '=', wholesalerId).executeTakeFirstOrThrow();
  return todayIn(w.time_zone);
}

// Finds or creates a batch by number. An expiry date in the past is refused (C-55).
export async function batchByNumber(
  trx: Trx,
  wholesalerId: string,
  productId: string,
  batchNumber: string,
  expiryDate: string,
) {
  if (expiryDate < (await today(trx, wholesalerId))) {
    throw errors.rule({ en: 'The expiry date is in the past', ar: 'تاريخ الصلاحية في الماضي' }, { field: 'expiryDate' });
  }
  const existing = await trx
    .selectFrom('batches')
    .selectAll()
    .where('product_id', '=', productId)
    .where('batch_number', '=', batchNumber)
    .executeTakeFirst();
  if (existing) {
    if (existing.expiry_date !== expiryDate) {
      throw errors.rule(
        { en: `Batch ${batchNumber} already exists with expiry ${existing.expiry_date}`, ar: `التشغيلة ${batchNumber} موجودة بتاريخ صلاحية ${existing.expiry_date}` },
        { field: 'expiryDate' },
      );
    }
    return existing;
  }
  return trx
    .insertInto('batches')
    .values({ wholesaler_id: wholesalerId, product_id: productId, batch_number: batchNumber, expiry_date: expiryDate })
    .returningAll()
    .executeTakeFirstOrThrow();
}

async function movement(
  trx: Trx,
  actor: Actor,
  m: {
    productId: string;
    batchId: string | null;
    type: MovementType;
    state: 'sellable' | 'damaged' | 'expired' | 'held' | null;
    quantityChange?: number;
    reservedChange?: number;
    reason?: string | null;
    documentType?: string;
    documentId?: string;
  },
) {
  await trx
    .insertInto('stock_movements')
    .values({
      wholesaler_id: actor.wholesalerId,
      product_id: m.productId,
      batch_id: m.batchId,
      movement_type: m.type,
      stock_state: m.state,
      quantity_change: m.quantityChange ?? 0,
      reserved_change: m.reservedChange ?? 0,
      reason: m.reason ?? null,
      document_type: m.documentType ?? null,
      document_id: m.documentId ?? null,
      created_by: actor.userId,
    })
    .execute();
}

const notEnough = (available: number) =>
  errors.rule(
    {
      en: `Stock cannot go below what is promised to orders. Only ${available} can be changed`,
      ar: `لا يمكن أن يقل المخزون عن الكمية المحجوزة للطلبات. يمكن تغيير ${available} فقط`,
    },
    { available },
  );

// STK-14: correct a batch to the counted quantity. The owner gets an alert (C-10, C-30).
export async function adjustToCount(
  trx: Trx,
  actor: Actor,
  input: { productId: string; batchId?: string | null; newBatch?: { batchNumber: string; expiryDate: string } | null; countedQuantity: number; reason: string },
) {
  const product = await trx.selectFrom('products').select(['id', 'name_en', 'name_ar', 'track_batches']).where('id', '=', input.productId).executeTakeFirst();
  if (!product) throw errors.notFound();
  const stock = await lockProductStock(trx, product.id);

  let batchId = input.batchId ?? null;
  if (input.newBatch) {
    if (!product.track_batches) throw errors.rule({ en: 'This product has no batch tracking', ar: 'هذا المنتج بدون تتبع تشغيلات' });
    batchId = (await batchByNumber(trx, actor.wholesalerId, product.id, input.newBatch.batchNumber.trim(), input.newBatch.expiryDate)).id;
  }
  if (!batchId) {
    if (product.track_batches) throw errors.rule({ en: 'Choose a batch', ar: 'اختر التشغيلة' }, { field: 'batchId' });
    const def = await trx.selectFrom('batches').select('id').where('product_id', '=', product.id).where('batch_number', 'is', null).executeTakeFirstOrThrow();
    batchId = def.id;
  }
  const batch = await lockBatch(trx, product.id, batchId);
  const diff = input.countedQuantity - batch.qty_sellable;
  if (diff === 0) return { changed: 0 };
  if (stock.on_hand_sellable + diff < stock.reserved) throw notEnough(stock.on_hand_sellable - stock.reserved);

  await trx.updateTable('batches').set({ qty_sellable: input.countedQuantity }).where('id', '=', batch.id).execute();
  await trx
    .updateTable('product_stock')
    .set({ on_hand_sellable: stock.on_hand_sellable + diff })
    .where('product_id', '=', product.id)
    .execute();
  await movement(trx, actor, { productId: product.id, batchId: batch.id, type: 'adjustment', state: 'sellable', quantityChange: diff, reason: input.reason });
  await logActivity(trx, actor, {
    action: 'stock_adjusted',
    entityType: 'product',
    entityId: product.id,
    reason: input.reason,
    details: { batchId: batch.id, batchNumber: batch.batch_number, before: batch.qty_sellable, after: input.countedQuantity },
    important: true,
  });
  await notify(trx, actor.wholesalerId, (await usersWithRoles(trx, ['owner'])).filter((u) => u !== actor.userId), {
    type: 'stock_adjusted',
    title: { en: `Stock corrected: ${product.name_en}`, ar: `تصحيح مخزون: ${product.name_ar}` },
    body: {
      en: `${batch.qty_sellable} → ${input.countedQuantity}. Reason: ${input.reason}`,
      ar: `${batch.qty_sellable} ← ${input.countedQuantity}. السبب: ${input.reason}`,
    },
    entityType: 'product',
    entityId: product.id,
  });
  return { changed: diff };
}

// STK-15: damaged stock moves to "damaged". Lost stock leaves on hand. The owner gets an alert.
export async function markDamagedOrLost(
  trx: Trx,
  actor: Actor,
  input: { productId: string; batchId: string; kind: 'damaged' | 'lost'; quantity: number; reason: string },
) {
  const product = await trx.selectFrom('products').select(['id', 'name_en', 'name_ar']).where('id', '=', input.productId).executeTakeFirst();
  if (!product) throw errors.notFound();
  const stock = await lockProductStock(trx, product.id);
  const batch = await lockBatch(trx, product.id, input.batchId);
  if (input.quantity > batch.qty_sellable) {
    throw errors.rule(
      { en: `This batch has only ${batch.qty_sellable} sellable units`, ar: `هذه التشغيلة بها ${batch.qty_sellable} وحدة صالحة فقط` },
      { available: batch.qty_sellable },
    );
  }
  if (stock.on_hand_sellable - input.quantity < stock.reserved) throw notEnough(stock.on_hand_sellable - stock.reserved);

  await trx
    .updateTable('batches')
    .set({
      qty_sellable: batch.qty_sellable - input.quantity,
      ...(input.kind === 'damaged' ? { qty_damaged: batch.qty_damaged + input.quantity } : {}),
    })
    .where('id', '=', batch.id)
    .execute();
  await trx
    .updateTable('product_stock')
    .set({ on_hand_sellable: stock.on_hand_sellable - input.quantity })
    .where('product_id', '=', product.id)
    .execute();
  await movement(trx, actor, { productId: product.id, batchId: batch.id, type: input.kind, state: 'sellable', quantityChange: -input.quantity, reason: input.reason });
  if (input.kind === 'damaged') {
    await movement(trx, actor, { productId: product.id, batchId: batch.id, type: 'damaged', state: 'damaged', quantityChange: input.quantity, reason: input.reason });
  }
  await logActivity(trx, actor, {
    action: input.kind === 'damaged' ? 'stock_damaged' : 'stock_lost',
    entityType: 'product',
    entityId: product.id,
    reason: input.reason,
    details: { batchId: batch.id, batchNumber: batch.batch_number, quantity: input.quantity },
    important: true,
  });
  await notify(trx, actor.wholesalerId, (await usersWithRoles(trx, ['owner'])).filter((u) => u !== actor.userId), {
    type: 'stock_damaged',
    title: {
      en: `${input.kind === 'damaged' ? 'Damaged' : 'Lost'} stock: ${product.name_en}`,
      ar: `${input.kind === 'damaged' ? 'مخزون تالف' : 'مخزون مفقود'}: ${product.name_ar}`,
    },
    body: { en: `${input.quantity} units. Reason: ${input.reason}`, ar: `${input.quantity} وحدة. السبب: ${input.reason}` },
    entityType: 'product',
    entityId: product.id,
  });
}

// Nightly job: sellable units of batches that expired move to "expired" (C-55).
// Safe to run many times. Returns how many batches changed.
export async function expireBatches(trx: Trx, wholesalerId: string, todayDate?: string): Promise<number> {
  const day = todayDate ?? (await today(trx, wholesalerId));
  const found = await trx
    .selectFrom('batches')
    .select(['id', 'product_id'])
    .where('expiry_date', '<', day)
    .where('qty_sellable', '>', 0)
    .execute();
  for (const f of found) {
    // Same lock order as every other stock change: product first, then batch
    const stock = await lockProductStock(trx, f.product_id);
    const b = await lockBatch(trx, f.product_id, f.id);
    // Units already promised to orders stay promised. The stock manager sees the conflict on the near-expiry list.
    const free = Math.max(0, Math.min(b.qty_sellable, stock.on_hand_sellable - stock.reserved));
    if (free === 0) continue;
    await trx
      .updateTable('batches')
      .set({ qty_sellable: b.qty_sellable - free, qty_expired: b.qty_expired + free })
      .where('id', '=', b.id)
      .execute();
    await trx.updateTable('product_stock').set({ on_hand_sellable: stock.on_hand_sellable - free }).where('product_id', '=', b.product_id).execute();
    const actor = { userId: null, wholesalerId };
    await movement(trx, actor, { productId: b.product_id, batchId: b.id, type: 'expired', state: 'sellable', quantityChange: -free, reason: 'expired' });
    await movement(trx, actor, { productId: b.product_id, batchId: b.id, type: 'expired', state: 'expired', quantityChange: free, reason: 'expired' });
  }
  return found.length;
}

// ---------- Used by the suppliers module (phase 3) ----------

// Receiving from a supplier: units go into a batch as sellable stock (STK-01)
export async function receiveIntoBatch(
  trx: Trx,
  actor: Actor,
  m: { productId: string; batchId: string; quantity: number; documentId: string },
) {
  const stock = await lockProductStock(trx, m.productId);
  const batch = await lockBatch(trx, m.productId, m.batchId);
  await trx.updateTable('batches').set({ qty_sellable: batch.qty_sellable + m.quantity }).where('id', '=', batch.id).execute();
  await trx.updateTable('product_stock').set({ on_hand_sellable: stock.on_hand_sellable + m.quantity }).where('product_id', '=', m.productId).execute();
  await movement(trx, actor, {
    productId: m.productId,
    batchId: batch.id,
    type: 'receipt',
    state: 'sellable',
    quantityChange: m.quantity,
    documentType: 'receipt',
    documentId: m.documentId,
  });
}

type ReturnState = 'sellable' | 'damaged' | 'expired';
const stateColumn = { sellable: 'qty_sellable', damaged: 'qty_damaged', expired: 'qty_expired' } as const;

async function takeFromState(trx: Trx, productId: string, batchId: string, state: ReturnState, quantity: number) {
  const stock = await lockProductStock(trx, productId);
  const batch = await lockBatch(trx, productId, batchId);
  const have = batch[stateColumn[state]];
  if (quantity > have) {
    throw errors.rule(
      { en: `Batch ${batch.batch_number ?? ''} has only ${have} units in this state`, ar: `التشغيلة ${batch.batch_number ?? ''} بها ${have} وحدة فقط في هذه الحالة` },
      { batchId, available: have },
    );
  }
  // Sellable units promised to orders cannot leave (C-08)
  if (state === 'sellable' && stock.on_hand_sellable - quantity < stock.reserved) throw notEnough(stock.on_hand_sellable - stock.reserved);
  return { stock, batch };
}

// C-65: while the owner decides, the units are held, so they cannot be sold or reserved
export async function holdForSupplierReturn(
  trx: Trx,
  actor: Actor,
  m: { productId: string; batchId: string; state: ReturnState; quantity: number; documentId: string },
) {
  const { stock, batch } = await takeFromState(trx, m.productId, m.batchId, m.state, m.quantity);
  await trx
    .updateTable('batches')
    .set({ [stateColumn[m.state]]: batch[stateColumn[m.state]] - m.quantity, qty_held: batch.qty_held + m.quantity })
    .where('id', '=', batch.id)
    .execute();
  await trx
    .updateTable('product_stock')
    .set({
      held: stock.held + m.quantity,
      ...(m.state === 'sellable' ? { on_hand_sellable: stock.on_hand_sellable - m.quantity } : {}),
    })
    .where('product_id', '=', m.productId)
    .execute();
  const doc = { documentType: 'supplier_return', documentId: m.documentId };
  await movement(trx, actor, { productId: m.productId, batchId: batch.id, type: 'held', state: m.state, quantityChange: -m.quantity, ...doc });
  await movement(trx, actor, { productId: m.productId, batchId: batch.id, type: 'held', state: 'held', quantityChange: m.quantity, ...doc });
}

// The owner rejected the return: held units go back to where they came from
export async function releaseHold(
  trx: Trx,
  actor: Actor,
  m: { productId: string; batchId: string; state: ReturnState; quantity: number; documentId: string },
) {
  const stock = await lockProductStock(trx, m.productId);
  const batch = await lockBatch(trx, m.productId, m.batchId);
  await trx
    .updateTable('batches')
    .set({ [stateColumn[m.state]]: batch[stateColumn[m.state]] + m.quantity, qty_held: batch.qty_held - m.quantity })
    .where('id', '=', batch.id)
    .execute();
  await trx
    .updateTable('product_stock')
    .set({
      held: stock.held - m.quantity,
      ...(m.state === 'sellable' ? { on_hand_sellable: stock.on_hand_sellable + m.quantity } : {}),
    })
    .where('product_id', '=', m.productId)
    .execute();
  const doc = { documentType: 'supplier_return', documentId: m.documentId };
  await movement(trx, actor, { productId: m.productId, batchId: batch.id, type: 'unheld', state: 'held', quantityChange: -m.quantity, ...doc });
  await movement(trx, actor, { productId: m.productId, batchId: batch.id, type: 'unheld', state: m.state, quantityChange: m.quantity, ...doc });
}

// The goods leave for the supplier (C-42). From held stock if the owner approved, otherwise from their state.
export async function removeForSupplierReturn(
  trx: Trx,
  actor: Actor,
  m: { productId: string; batchId: string; state: ReturnState; quantity: number; fromHeld: boolean; documentId: string },
) {
  const doc = { documentType: 'supplier_return', documentId: m.documentId };
  if (m.fromHeld) {
    const stock = await lockProductStock(trx, m.productId);
    const batch = await lockBatch(trx, m.productId, m.batchId);
    await trx.updateTable('batches').set({ qty_held: batch.qty_held - m.quantity }).where('id', '=', batch.id).execute();
    await trx.updateTable('product_stock').set({ held: stock.held - m.quantity }).where('product_id', '=', m.productId).execute();
    await movement(trx, actor, { productId: m.productId, batchId: batch.id, type: 'supplier_return', state: 'held', quantityChange: -m.quantity, ...doc });
    return;
  }
  const { stock, batch } = await takeFromState(trx, m.productId, m.batchId, m.state, m.quantity);
  await trx
    .updateTable('batches')
    .set({ [stateColumn[m.state]]: batch[stateColumn[m.state]] - m.quantity })
    .where('id', '=', batch.id)
    .execute();
  if (m.state === 'sellable') {
    await trx.updateTable('product_stock').set({ on_hand_sellable: stock.on_hand_sellable - m.quantity }).where('product_id', '=', m.productId).execute();
  }
  await movement(trx, actor, { productId: m.productId, batchId: batch.id, type: 'supplier_return', state: m.state, quantityChange: -m.quantity, ...doc });
}

// ---------- Used by the orders module (phase 4) ----------

export interface Shortage {
  productId: string;
  requested: number;
  available: number;
}

// Reserves stock for an order (C-25). Rows are locked in a fixed order (by product id),
// so two orders for the same products wait for each other instead of deadlocking.
// If any product is short, nothing is reserved and the list of shortages is returned.
export async function reserveForOrder(
  trx: Trx,
  actor: Actor,
  orderId: string,
  needs: Array<{ productId: string; quantity: number }>,
): Promise<Shortage[]> {
  const sorted = [...needs].sort((a, b) => (a.productId < b.productId ? -1 : 1));
  const locked = [];
  for (const n of sorted) locked.push({ need: n, stock: await lockProductStock(trx, n.productId) });
  const shortages = locked
    .filter(({ need, stock }) => stock.on_hand_sellable - stock.reserved < need.quantity)
    .map(({ need, stock }) => ({ productId: need.productId, requested: need.quantity, available: Math.max(0, stock.on_hand_sellable - stock.reserved) }));
  if (shortages.length) return shortages;
  for (const { need, stock } of locked) {
    await trx.updateTable('product_stock').set({ reserved: stock.reserved + need.quantity }).where('product_id', '=', need.productId).execute();
    await movement(trx, actor, {
      productId: need.productId,
      batchId: null,
      type: 'order_reserved',
      state: null,
      reservedChange: need.quantity,
      documentType: 'order',
      documentId: orderId,
    });
  }
  return [];
}

// Releases reserved stock: order rejected, cancelled, or a quantity reduced (C-12, C-38)
export async function releaseForOrder(trx: Trx, actor: Actor, orderId: string, productId: string, quantity: number, reason?: string) {
  if (quantity <= 0) return;
  const stock = await lockProductStock(trx, productId);
  await trx.updateTable('product_stock').set({ reserved: stock.reserved - quantity }).where('product_id', '=', productId).execute();
  await movement(trx, actor, {
    productId,
    batchId: null,
    type: 'order_released',
    state: null,
    reservedChange: -quantity,
    reason: reason ?? null,
    documentType: 'order',
    documentId: orderId,
  });
}

// ---------- Used by the delivery module (phase 6) ----------

async function picksOf(trx: Trx, orderId: string) {
  return trx
    .selectFrom('picks as p')
    .innerJoin('order_lines as l', 'l.id', 'p.order_line_id')
    .select(['p.batch_id', 'p.quantity', 'l.product_id'])
    .where('l.order_id', '=', orderId)
    .orderBy('l.product_id')
    .execute();
}

// The trip starts: the picked units leave the warehouse (C-25). On hand and reserved go down together.
export async function shipOrder(trx: Trx, actor: Actor, orderId: string, tripId: string) {
  for (const p of await picksOf(trx, orderId)) {
    const stock = await lockProductStock(trx, p.product_id);
    const batch = await lockBatch(trx, p.product_id, p.batch_id);
    if (batch.qty_sellable < p.quantity) {
      throw errors.rule(
        { en: `Batch ${batch.batch_number ?? ''} no longer has the picked units. Prepare the order again`, ar: `التشغيلة ${batch.batch_number ?? ''} لم تعد بها الكمية المجمعة. جهز الطلب مرة أخرى` },
        { orderId },
      );
    }
    await trx.updateTable('batches').set({ qty_sellable: batch.qty_sellable - p.quantity }).where('id', '=', batch.id).execute();
    await trx
      .updateTable('product_stock')
      .set({ on_hand_sellable: stock.on_hand_sellable - p.quantity, reserved: stock.reserved - p.quantity })
      .where('product_id', '=', p.product_id)
      .execute();
    await movement(trx, actor, {
      productId: p.product_id,
      batchId: batch.id,
      type: 'trip_started',
      state: 'sellable',
      quantityChange: -p.quantity,
      reservedChange: -p.quantity,
      documentType: 'trip',
      documentId: tripId,
    });
  }
}

// A failed delivery: the stock manager confirms the goods are back (C-61).
// They go back to their batches and are reserved again for the next trip.
export async function returnShippedOrder(trx: Trx, actor: Actor, orderId: string, tripId: string) {
  for (const p of await picksOf(trx, orderId)) {
    const stock = await lockProductStock(trx, p.product_id);
    const batch = await lockBatch(trx, p.product_id, p.batch_id);
    await trx.updateTable('batches').set({ qty_sellable: batch.qty_sellable + p.quantity }).where('id', '=', batch.id).execute();
    await trx
      .updateTable('product_stock')
      .set({ on_hand_sellable: stock.on_hand_sellable + p.quantity, reserved: stock.reserved + p.quantity })
      .where('product_id', '=', p.product_id)
      .execute();
    await movement(trx, actor, {
      productId: p.product_id,
      batchId: batch.id,
      type: 'delivery_failed_back',
      state: 'sellable',
      quantityChange: p.quantity,
      reservedChange: p.quantity,
      documentType: 'trip',
      documentId: tripId,
    });
  }
}
