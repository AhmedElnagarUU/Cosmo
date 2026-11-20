import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { firstLogin, newWholesaler, setup, uniquePhone, type Client } from './helpers';

const { db, ownerDb, app } = setup();
afterAll(async () => {
  await db.destroy();
  await ownerDb.destroy();
});

let w: Awaited<ReturnType<typeof newWholesaler>>;
let keeper: Client;
let accountant: Client;
let sales: Client;
let driver: Client;
let driverId: string;
let pharmacy: Client;
let customerId: string;
let product: string;

async function employee(role: string) {
  const phone = uniquePhone();
  const r = await w.owner.post('/api/v1/employees', { name: role + phone.slice(-3), phone, roles: [role] });
  return { c: await firstLogin(app, w.loginCode, phone, r.body.temporaryPassword), userId: r.body.employee.userId as string };
}
async function delivered(quantity: number, paymentChoice = 'on_arrival') {
  const o = (await pharmacy.post('/api/v1/orders', { paymentChoice, lines: [{ productId: product, quantity }] }).expect(201)).body;
  await keeper.post(`/api/v1/orders/${o.id}/accept`).expect(200);
  const v = (await keeper.post(`/api/v1/orders/${o.id}/start-preparing`)).body;
  for (const l of v.lines) await keeper.put(`/api/v1/orders/${o.id}/lines/${l.orderLineId}/picks`, { picks: l.recommended }).expect(200);
  await keeper.post(`/api/v1/orders/${o.id}/confirm-preparation`).expect(200);
  const trip = (await w.owner.post('/api/v1/trips', { deliveryPersonId: driverId, orderIds: [o.id] }).expect(201)).body;
  const s = (await driver.post(`/api/v1/trips/${trip.id}/start`)).body.stops[0];
  await driver.post(`/api/v1/trip-stops/${s.id}/deliver`, {}).expect(200);
  return { order: (await keeper.get(`/api/v1/orders/${o.id}`)).body, stopId: s.id as string };
}
const stock = async () => (await keeper.get(`/api/v1/products/${product}`)).body.stock;
const balance = async () => (await accountant.get(`/api/v1/customers/${customerId}/statement`)).body.balance;

beforeAll(async () => {
  w = await newWholesaler(ownerDb, app);
  keeper = (await employee('stock_manager')).c;
  accountant = (await employee('accountant')).c;
  sales = (await employee('sales')).c;
  const d = await employee('delivery');
  driver = d.c;
  driverId = d.userId;
  const c = await w.owner.post('/api/v1/customers', { businessName: 'Pharmacy', contactPerson: 'X', phone: uniquePhone(), address: 'Y' });
  customerId = c.body.customer.id;
  pharmacy = await firstLogin(app, w.loginCode, c.body.firstLogin.phone, c.body.firstLogin.temporaryPassword);
  const brandId = (await keeper.post('/api/v1/brands', { nameAr: 'ب', nameEn: 'B' })).body.id;
  const categoryId = (await keeper.post('/api/v1/categories', { nameAr: 'ف', nameEn: 'C' })).body.id;
  product = (await keeper.post('/api/v1/products', { productType: 'cosmetic', brandId, categoryId, unit: 'box', packSize: '1', costPrice: '7.00', sellingPrice: '10.00', cosmetic: {}, nameAr: 'م', nameEn: 'Item', trackBatches: true })).body.id;
  await keeper.post('/api/v1/stock/adjustments', { productId: product, newBatch: { batchNumber: 'B1', expiryDate: '2030-01-31' }, countedQuantity: 200, reason: 'Opening' }).expect(201);
});

describe('customer returns (C-19, C-60, C-62, C-69, C-83)', () => {
  it('on an unpaid invoice: the credit reduces what is owed; stock goes back by condition', async () => {
    const { order } = await delivered(5);
    expect(await balance()).toBe('50.00');
    await pharmacy.post('/api/v1/returns', { orderId: order.id, reason: 'damaged', lines: [{ orderLineId: order.lines[0].id, quantity: 2 }] }).expect(403);
    await sales.post('/api/v1/returns', { orderId: order.id, reason: 'damaged', lines: [{ orderLineId: order.lines[0].id, quantity: 6 }] }).expect(409);
    const ret = (await sales.post('/api/v1/returns', { orderId: order.id, reason: 'damaged', lines: [{ orderLineId: order.lines[0].id, quantity: 3 }] }).expect(201)).body;
    expect(ret).toMatchObject({ status: 'requested', creditAmount: '30.00' });
    // Only what is left can be returned later
    await sales.post('/api/v1/returns', { orderId: order.id, reason: 'damaged', lines: [{ orderLineId: order.lines[0].id, quantity: 3 }] }).expect(409);

    const before = await stock();
    const checked = (await keeper.post(`/api/v1/returns/${ret.id}/check`, { lines: [{ lineId: ret.lines[0].id, condition: 'sellable' }] }).expect(200)).body;
    expect(checked).toMatchObject({ status: 'completed', appliedToInvoice: '30.00', leftOver: '0.00' });
    expect((await stock()).onHand).toBe(before.onHand + 3);
    expect(await balance()).toBe('20.00');
    const notes = (await w.owner.get('/api/v1/notifications')).body.items;
    expect(notes.some((n: { type: string }) => n.type === 'return_completed')).toBe(true);
    // The customer sees it, but cannot create one
    expect((await pharmacy.get('/api/v1/returns')).body.items).toHaveLength(1);
  });

  it('damaged goods never become available', async () => {
    const { order } = await delivered(2);
    const ret = (await keeper.post('/api/v1/returns', { orderId: order.id, reason: 'damaged', lines: [{ orderLineId: order.lines[0].id, quantity: 2 }] }).expect(201)).body;
    const before = await stock();
    await keeper.post(`/api/v1/returns/${ret.id}/check`, { lines: [{ lineId: ret.lines[0].id, condition: 'damaged' }] }).expect(200);
    expect((await stock()).available).toBe(before.available);
    const batch = (await keeper.get(`/api/v1/products/${product}/batches`)).body.items[0];
    expect(batch.damaged).toBeGreaterThanOrEqual(2);
  });

  it('on a paid invoice: the left-over is paid back or kept as credit (C-69)', async () => {
    const { order, stopId } = await delivered(4);
    await driver.post(`/api/v1/trip-stops/${stopId}/payments`, { method: 'cash', amount: '40.00' }).expect(201);
    const p = (await accountant.get('/api/v1/payments?status=waiting')).body.items[0];
    await accountant.post(`/api/v1/payments/${p.id}/confirm`).expect(200);
    const startBalance = await balance();

    const ret = (await sales.post('/api/v1/returns', { orderId: order.id, reason: 'not_needed', lines: [{ orderLineId: order.lines[0].id, quantity: 2 }] }).expect(201)).body;
    const done = (await keeper.post(`/api/v1/returns/${ret.id}/check`, { lines: [{ lineId: ret.lines[0].id, condition: 'sellable' }] }).expect(200)).body;
    expect(done).toMatchObject({ appliedToInvoice: '0.00', leftOver: '20.00' });
    // A credit of 20 on the balance until it is paid back
    expect(Number(await balance())).toBeCloseTo(Number(startBalance) - 20, 2);

    await accountant.post(`/api/v1/returns/${ret.id}/refund`, { amount: '20.00', method: 'cash', refundedOn: '2026-11-20' }).expect(409);
    await accountant.post(`/api/v1/returns/${ret.id}/left-over`, { choice: 'refund' }).expect(200);
    await accountant.post(`/api/v1/returns/${ret.id}/refund`, { amount: '25.00', method: 'cash', refundedOn: '2026-11-20' }).expect(409);
    const paid = (await accountant.post(`/api/v1/returns/${ret.id}/refund`, { amount: '20.00', method: 'cash', refundedOn: '2026-11-20' }).expect(200)).body;
    expect(paid.refunded).toBe('20.00');
    expect(await balance()).toBe(startBalance);
    const rows = (await accountant.get(`/api/v1/customers/${customerId}/statement`)).body.rows;
    expect(rows.some((r: { kind: string }) => r.kind === 'refund')).toBe(true);
  });

  it('items refused at the door are completed by the stock manager', async () => {
    const o = (await pharmacy.post('/api/v1/orders', { paymentChoice: 'on_arrival', lines: [{ productId: product, quantity: 3 }] }).expect(201)).body;
    await keeper.post(`/api/v1/orders/${o.id}/accept`).expect(200);
    const v = (await keeper.post(`/api/v1/orders/${o.id}/start-preparing`)).body;
    await keeper.put(`/api/v1/orders/${o.id}/lines/${v.lines[0].orderLineId}/picks`, { picks: v.lines[0].recommended }).expect(200);
    await keeper.post(`/api/v1/orders/${o.id}/confirm-preparation`).expect(200);
    const trip = (await w.owner.post('/api/v1/trips', { deliveryPersonId: driverId, orderIds: [o.id] })).body;
    const s = (await driver.post(`/api/v1/trips/${trip.id}/start`)).body.stops[0];
    await driver.post(`/api/v1/trip-stops/${s.id}/deliver`, { refused: [{ orderLineId: v.lines[0].orderLineId, quantity: 1 }], refusedReason: 'Wrong' }).expect(200);
    const door = (await keeper.get('/api/v1/returns?status=requested')).body.items.find((r: { source: string }) => r.source === 'at_the_door');
    const full = (await keeper.get(`/api/v1/returns/${door.id}`)).body;
    const before = await stock();
    const done = (await keeper.post(`/api/v1/returns/${door.id}/check`, { lines: [{ lineId: full.lines[0].id, condition: 'sellable' }] }).expect(200)).body;
    expect(done).toMatchObject({ status: 'completed', appliedToInvoice: '10.00' });
    expect((await stock()).onHand).toBe(before.onHand + 1);
  });
});
