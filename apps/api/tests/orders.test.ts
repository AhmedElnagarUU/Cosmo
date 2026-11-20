import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { firstLogin, newWholesaler, setup, uniquePhone, type Client } from './helpers';
import { withTenant } from '../src/core/db';
import { reportWaitingOrders } from '../src/jobs/waiting-orders';

const { db, ownerDb, app } = setup();
afterAll(async () => {
  await db.destroy();
  await ownerDb.destroy();
});

let w: Awaited<ReturnType<typeof newWholesaler>>;
let keeper: Client;
let sales: Client;
let pharmacyA: Client;
let pharmacyB: Client;
let customerA: string;
let base: Record<string, unknown>;

async function employee(role: string) {
  const phone = uniquePhone();
  const r = await w.owner.post('/api/v1/employees', { name: role, phone, roles: [role] });
  return firstLogin(app, w.loginCode, phone, r.body.temporaryPassword);
}
async function customer(name: string) {
  const c = await w.owner.post('/api/v1/customers', { businessName: name, contactPerson: 'X', phone: uniquePhone(), address: 'Y' });
  return { id: c.body.customer.id as string, client: await firstLogin(app, w.loginCode, c.body.firstLogin.phone, c.body.firstLogin.temporaryPassword) };
}
// A product with stock, sold at 10.00 per unit
async function product(stock: number, name = 'P' + Math.random()) {
  const p = (await keeper.post('/api/v1/products', { ...base, nameAr: name, nameEn: name, trackBatches: false, cosmetic: {} })).body;
  if (stock) await keeper.post('/api/v1/stock/adjustments', { productId: p.id, countedQuantity: stock, reason: 'Opening' }).expect(201);
  return p.id as string;
}
async function stockOf(id: string) {
  return (await keeper.get(`/api/v1/products/${id}`)).body.stock as { onHand: number; reserved: number; available: number };
}

beforeAll(async () => {
  w = await newWholesaler(ownerDb, app);
  keeper = await employee('stock_manager');
  sales = await employee('sales');
  const a = await customer('Pharmacy A');
  customerA = a.id;
  pharmacyA = a.client;
  pharmacyB = (await customer('Pharmacy B')).client;
  const brandId = (await keeper.post('/api/v1/brands', { nameAr: 'ب', nameEn: 'B' })).body.id;
  const categoryId = (await keeper.post('/api/v1/categories', { nameAr: 'ف', nameEn: 'C' })).body.id;
  base = { productType: 'cosmetic', brandId, categoryId, unit: 'box', packSize: '1', costPrice: '7.00', sellingPrice: '10.00' };
});

describe('placing an order (C-25, C-54, C-56)', () => {
  it('reserves stock at once and calculates every price itself', async () => {
    const p = await product(100);
    const order = await pharmacyA.post('/api/v1/orders', {
      paymentChoice: 'on_arrival',
      // Prices sent by the app are ignored
      lines: [{ productId: p, quantity: 70, price: '0.01', total: '0.01' }],
      total: '0.01',
    });
    expect(order.status).toBe(201);
    expect(order.body).toMatchObject({ status: 'placed', total: '700.00' });
    expect(order.body.orderNumber).toMatch(/^ORD-\d{4}-\d{5}$/);
    expect(await stockOf(p)).toMatchObject({ onHand: 100, reserved: 70, available: 30 });

    // Customer B cannot take the same units (C-54)
    const b = await pharmacyB.post('/api/v1/orders', { paymentChoice: 'on_arrival', lines: [{ productId: p, quantity: 50 }] });
    expect(b.status).toBe(409);
    expect(b.body.error.details.shortages[0]).toMatchObject({ requested: 50, available: 30 });
    expect(await stockOf(p)).toMatchObject({ reserved: 70 });
  });

  it('two customers ordering the last units at the same moment: only one succeeds', async () => {
    const p = await product(10);
    const results = await Promise.all([
      pharmacyA.post('/api/v1/orders', { paymentChoice: 'on_arrival', lines: [{ productId: p, quantity: 8 }] }),
      pharmacyB.post('/api/v1/orders', { paymentChoice: 'on_arrival', lines: [{ productId: p, quantity: 8 }] }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await stockOf(p)).toMatchObject({ reserved: 8, available: 2 });
  });

  it('pressing "place order" twice creates one order', async () => {
    const p = await product(10);
    const send = () =>
      pharmacyA.agent
        .post('/api/v1/orders')
        .set('Origin', 'http://localhost:3000')
        .set('Idempotency-Key', 'tap-123456789-abc')
        .send({ paymentChoice: 'on_arrival', lines: [{ productId: p, quantity: 2 }] });
    const [one, two] = await Promise.all([send(), send()]);
    expect(one.body.id).toBe(two.body.id);
    expect(await stockOf(p)).toMatchObject({ reserved: 2 });
  });

  it('credit only when allowed, and the minimum order value', async () => {
    const p = await product(10);
    await pharmacyA.post('/api/v1/orders', { paymentChoice: 'credit', lines: [{ productId: p, quantity: 1 }] }).expect(409);
    await w.owner.patch(`/api/v1/customers/${customerA}/credit`, { creditAllowed: true, creditDays: 30 }).expect(200);
    await pharmacyA.post('/api/v1/orders', { paymentChoice: 'credit', lines: [{ productId: p, quantity: 1 }] }).expect(201);

    await w.owner.patch('/api/v1/settings', { minimumOrderValue: '50.00' }).expect(200);
    const small = await pharmacyA.post('/api/v1/orders', { paymentChoice: 'on_arrival', lines: [{ productId: p, quantity: 2 }] });
    expect(small.status).toBe(409);
    expect(small.body.error.details.code).toBe('BELOW_MINIMUM_ORDER');
    const preview = await pharmacyA.post('/api/v1/orders/preview', { paymentChoice: 'on_arrival', lines: [{ productId: p, quantity: 2 }] }).expect(200);
    expect(preview.body.belowMinimum).toBe(true);
    await w.owner.patch('/api/v1/settings', { minimumOrderValue: null }).expect(200);
  });

  it('offers: discount and bonus units, which also need stock (C-41)', async () => {
    const d = await product(100);
    const b = await product(11);
    await w.owner.post('/api/v1/offers', { offerType: 'discount', productId: d, discountPercent: '5' }).expect(201);
    await w.owner.post('/api/v1/offers', { offerType: 'bonus', productId: b, buyQuantity: 10, freeQuantity: 1 }).expect(201);
    const o = (await pharmacyA.post('/api/v1/orders', { paymentChoice: 'on_arrival', lines: [{ productId: d, quantity: 10 }, { productId: b, quantity: 10 }] }).expect(201)).body;
    expect(o).toMatchObject({ subtotal: '200.00', discountTotal: '5.00', total: '195.00' });
    expect(o.lines[1]).toMatchObject({ currentQty: 10, bonusQty: 1 });
    expect(await stockOf(b)).toMatchObject({ reserved: 11, available: 0 });
    // 10 more would need 11 units with the free one
    const short = await pharmacyB.post('/api/v1/orders', { paymentChoice: 'on_arrival', lines: [{ productId: b, quantity: 10 }] });
    expect(short.status).toBe(409);
  });

  it('sales places an order for a customer, and orders work while closed (C-32, C-37)', async () => {
    const p = await product(10);
    await sales.post('/api/v1/orders', { paymentChoice: 'on_arrival', lines: [{ productId: p, quantity: 1 }] }).expect(400);
    const o = (await sales.post('/api/v1/orders', { customerId: customerA, paymentChoice: 'on_arrival', lines: [{ productId: p, quantity: 1 }] }).expect(201)).body;
    expect(o.placedBy).toBe('sales');
    // No working hours are set, so the warehouse is closed
    expect(o.placedWhileClosed).toBe(true);
    // A customer cannot order for another customer
    const other = await pharmacyB.post('/api/v1/orders', { customerId: customerA, paymentChoice: 'on_arrival', lines: [{ productId: p, quantity: 1 }] }).expect(201);
    expect(other.body.customer.businessName).toBe('Pharmacy B');
  });
});

describe('acceptance (C-24, C-38, C-39)', () => {
  async function place(lines: Array<{ productId: string; quantity: number; mustHave?: boolean }>) {
    return (await pharmacyA.post('/api/v1/orders', { paymentChoice: 'on_arrival', lines }).expect(201)).body;
  }

  it('accept, reject with a reason, and the customer is told', async () => {
    const p = await product(20);
    const o1 = await place([{ productId: p, quantity: 5 }]);
    await sales.post(`/api/v1/orders/${o1.id}/accept`).expect(403);
    const accepted = await keeper.post(`/api/v1/orders/${o1.id}/accept`).expect(200);
    expect(accepted.body.status).toBe('accepted');
    await keeper.post(`/api/v1/orders/${o1.id}/accept`).expect(409);

    const o2 = await place([{ productId: p, quantity: 5 }]);
    await keeper.post(`/api/v1/orders/${o2.id}/reject`, { reason: '' }).expect(400);
    const rejected = await keeper.post(`/api/v1/orders/${o2.id}/reject`, { reason: 'Customer has unpaid invoices' }).expect(200);
    expect(rejected.body.history.at(-1)).toMatchObject({ to: 'rejected', reason: 'Customer has unpaid invoices' });
    expect(await stockOf(p)).toMatchObject({ reserved: 5 });
    const notes = (await pharmacyA.get('/api/v1/notifications')).body.items;
    expect(notes[0]).toMatchObject({ type: 'order_rejected', body: 'Customer has unpaid invoices' });
    const ownerNotes = (await w.owner.get('/api/v1/notifications')).body.items;
    expect(ownerNotes.some((n: { type: string }) => n.type === 'order_rejected')).toBe(true);
  });

  it('reducing a normal product: accepted, customer informed, stock released', async () => {
    const p = await product(20);
    const q = await product(20);
    const o = await place([{ productId: p, quantity: 10 }, { productId: q, quantity: 5, mustHave: true }]);
    const res = await keeper.post(`/api/v1/orders/${o.id}/accept`, { changes: [{ orderLineId: o.lines[0].id, newQuantity: 6, reason: 'not_found' }] }).expect(200);
    expect(res.body.status).toBe('accepted');
    expect(res.body.total).toBe('110.00');
    expect(res.body.lines[0]).toMatchObject({ orderedQty: 10, currentQty: 6 });
    expect(res.body.lines[0].changes[0]).toMatchObject({ oldQty: 10, newQty: 6, reason: 'not_found', stage: 'acceptance' });
    expect(await stockOf(p)).toMatchObject({ reserved: 6 });
  });

  it('a quantity can never be increased, and "other" needs a note', async () => {
    const p = await product(20);
    const o = await place([{ productId: p, quantity: 5 }]);
    await keeper.post(`/api/v1/orders/${o.id}/accept`, { changes: [{ orderLineId: o.lines[0].id, newQuantity: 6, reason: 'not_found' }] }).expect(409);
    await keeper.post(`/api/v1/orders/${o.id}/accept`, { changes: [{ orderLineId: o.lines[0].id, newQuantity: 4, reason: 'other' }] }).expect(400);
    // Removing everything must be a rejection instead
    await keeper.post(`/api/v1/orders/${o.id}/accept`, { changes: [{ orderLineId: o.lines[0].id, newQuantity: 0, reason: 'not_found' }] }).expect(409);
    expect(await stockOf(p)).toMatchObject({ reserved: 5 });
  });

  it('reducing a must-have product: the order waits for the customer, who accepts or cancels', async () => {
    const p = await product(20);
    const q = await product(20);
    const o = await place([{ productId: p, quantity: 10, mustHave: true }, { productId: q, quantity: 2 }]);
    const waiting = await keeper.post(`/api/v1/orders/${o.id}/accept`, { changes: [{ orderLineId: o.lines[0].id, newQuantity: 4, reason: 'damaged' }] }).expect(200);
    expect(waiting.body.status).toBe('waiting_for_customer');
    expect((await pharmacyA.get('/api/v1/notifications')).body.items[0].type).toBe('order_needs_answer');
    expect(await stockOf(p)).toMatchObject({ reserved: 4 });
    await pharmacyB.post(`/api/v1/orders/${o.id}/answer`, { answer: 'accept_change' }).expect(404);
    const ok = await pharmacyA.post(`/api/v1/orders/${o.id}/answer`, { answer: 'accept_change' }).expect(200);
    expect(ok.body.status).toBe('accepted');

    const o2 = await place([{ productId: p, quantity: 3, mustHave: true }]);
    await keeper.post(`/api/v1/orders/${o2.id}/accept`, { changes: [{ orderLineId: o2.lines[0].id, newQuantity: 1, reason: 'not_found' }] }).expect(200);
    const cancelled = await pharmacyA.post(`/api/v1/orders/${o2.id}/answer`, { answer: 'cancel' }).expect(200);
    expect(cancelled.body.status).toBe('cancelled');
    expect(await stockOf(p)).toMatchObject({ reserved: 4 });
  });
});

describe('cancelling (C-35, C-57)', () => {
  it('the customer cancels without a reason; employees need one, and the customer sees it', async () => {
    const p = await product(20);
    const o1 = (await pharmacyA.post('/api/v1/orders', { paymentChoice: 'on_arrival', lines: [{ productId: p, quantity: 3 }] })).body;
    await pharmacyB.post(`/api/v1/orders/${o1.id}/cancel`).expect(404);
    await pharmacyA.post(`/api/v1/orders/${o1.id}/cancel`).expect(200);
    await pharmacyA.post(`/api/v1/orders/${o1.id}/cancel`).expect(409);

    const o2 = (await pharmacyA.post('/api/v1/orders', { paymentChoice: 'on_arrival', lines: [{ productId: p, quantity: 3 }] })).body;
    await keeper.post(`/api/v1/orders/${o2.id}/accept`).expect(200);
    await sales.post(`/api/v1/orders/${o2.id}/cancel`, { reason: 'x' }).expect(403);
    await w.owner.post(`/api/v1/orders/${o2.id}/cancel`).expect(400);
    await w.owner.post(`/api/v1/orders/${o2.id}/cancel`, { reason: 'Waited too long' }).expect(200);
    const notes = (await pharmacyA.get('/api/v1/notifications')).body.items;
    expect(notes[0]).toMatchObject({ type: 'order_cancelled', body: 'Waited too long' });
    expect(await stockOf(p)).toMatchObject({ reserved: 0, available: 20 });
  });
});

describe('orders that wait too long (C-35)', () => {
  it('is reported to the owner once, after 5 working hours, and never cancelled', async () => {
    const allWeek = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, opensAt: '00:00', closesAt: '23:59' }));
    await w.owner.put('/api/v1/settings/working-hours', { days: allWeek }).expect(200);
    const p = await product(5);
    const o = (await pharmacyA.post('/api/v1/orders', { paymentChoice: 'on_arrival', lines: [{ productId: p, quantity: 1 }] })).body;
    // Pretend it was placed 6 hours ago
    await withTenant(db, w.wholesalerId, (trx) =>
      trx.updateTable('orders').set({ waiting_since: new Date(Date.now() - 6 * 3600_000) }).where('id', '=', o.id).execute(),
    );
    const first = await reportWaitingOrders(db, new Date());
    expect(first).toBeGreaterThanOrEqual(1);
    expect(await reportWaitingOrders(db, new Date())).toBe(0);
    const order = (await w.owner.get(`/api/v1/orders/${o.id}`)).body;
    expect(order).toMatchObject({ status: 'placed', reportedToOwner: true });
    const notes = (await w.owner.get('/api/v1/notifications')).body.items;
    expect(notes.some((n: { type: string }) => n.type === 'order_waiting_long')).toBe(true);
  });
});

describe('who sees which orders', () => {
  it('customers see only their own; other wholesalers see nothing', async () => {
    const p = await product(5);
    const o = (await pharmacyA.post('/api/v1/orders', { paymentChoice: 'on_arrival', lines: [{ productId: p, quantity: 1 }] })).body;
    await pharmacyB.get(`/api/v1/orders/${o.id}`).expect(404);
    const mine = (await pharmacyB.get('/api/v1/orders')).body.items;
    expect(mine.every((x: { customerName: string }) => x.customerName === 'Pharmacy B')).toBe(true);
    const other = await newWholesaler(ownerDb, app);
    await other.owner.get(`/api/v1/orders/${o.id}`).expect(404);
    await other.owner.post(`/api/v1/orders/${o.id}/cancel`, { reason: 'x' }).expect(404);
  });
});
