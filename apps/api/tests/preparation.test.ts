import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { firstLogin, newWholesaler, setup, uniquePhone, type Client } from './helpers';

const { db, ownerDb, app } = setup();
afterAll(async () => {
  await db.destroy();
  await ownerDb.destroy();
});

let w: Awaited<ReturnType<typeof newWholesaler>>;
let keeper: Client;
let keeper2: Client;
let pharmacy: Client;
let product: string;
let base: Record<string, unknown>;

async function employee(role: string) {
  const phone = uniquePhone();
  const r = await w.owner.post('/api/v1/employees', { name: role + phone.slice(-3), phone, roles: [role] });
  return firstLogin(app, w.loginCode, phone, r.body.temporaryPassword);
}

async function orderOf(quantity: number, mustHave = false) {
  const o = (await pharmacy.post('/api/v1/orders', { paymentChoice: 'on_arrival', lines: [{ productId: product, quantity, mustHave }] }).expect(201)).body;
  await keeper.post(`/api/v1/orders/${o.id}/accept`).expect(200);
  return o;
}

beforeAll(async () => {
  w = await newWholesaler(ownerDb, app);
  keeper = await employee('stock_manager');
  keeper2 = await employee('stock_manager');
  const c = await w.owner.post('/api/v1/customers', { businessName: 'Pharmacy', contactPerson: 'X', phone: uniquePhone(), address: 'Y' });
  pharmacy = await firstLogin(app, w.loginCode, c.body.firstLogin.phone, c.body.firstLogin.temporaryPassword);
  const brandId = (await keeper.post('/api/v1/brands', { nameAr: 'ب', nameEn: 'B' })).body.id;
  const categoryId = (await keeper.post('/api/v1/categories', { nameAr: 'ف', nameEn: 'C' })).body.id;
  base = { productType: 'cosmetic', brandId, categoryId, unit: 'box', packSize: '1', costPrice: '7.00', sellingPrice: '10.00', cosmetic: {} };
  product = (await keeper.post('/api/v1/products', { ...base, nameAr: 'م', nameEn: 'Batched', trackBatches: true })).body.id;
  // Two batches: the one expiring first is recommended first (C-14)
  await keeper.post('/api/v1/stock/adjustments', { productId: product, newBatch: { batchNumber: 'LATE', expiryDate: '2031-01-31' }, countedQuantity: 50, reason: 'Opening' }).expect(201);
  await keeper.post('/api/v1/stock/adjustments', { productId: product, newBatch: { batchNumber: 'EARLY', expiryDate: '2029-01-31' }, countedQuantity: 8, reason: 'Opening' }).expect(201);
});

describe('preparation (C-14, C-25, C-34, C-77)', () => {
  it('recommends the batch that expires first, then the next, and confirms', async () => {
    const o = await orderOf(10);
    const view = (await keeper.post(`/api/v1/orders/${o.id}/start-preparing`).expect(200)).body;
    expect(view.status).toBe('preparing');
    const line = view.lines[0];
    expect(line.batches.map((b: { batchNumber: string }) => b.batchNumber)).toEqual(['EARLY', 'LATE']);
    expect(line.recommended.map((r: { quantity: number }) => r.quantity)).toEqual([8, 2]);

    // Another stock manager cannot open it at the same time
    await keeper2.post(`/api/v1/orders/${o.id}/start-preparing`).expect(409);
    // The customer can no longer cancel (C-57)
    await pharmacy.post(`/api/v1/orders/${o.id}/cancel`).expect(409);

    // Not all picked yet
    await keeper.post(`/api/v1/orders/${o.id}/confirm-preparation`).expect(409);
    await keeper.put(`/api/v1/orders/${o.id}/lines/${line.orderLineId}/picks`, { picks: line.recommended }).expect(200);
    await keeper.post(`/api/v1/orders/${o.id}/confirm-preparation`).expect(200);
    const after = (await keeper.get(`/api/v1/orders/${o.id}`)).body;
    expect(after.status).toBe('ready');
    // On hand does not change at preparation (C-25)
    const p = (await keeper.get(`/api/v1/products/${product}`)).body;
    expect(p.stock).toMatchObject({ onHand: 58, reserved: 10 });
  });

  it('a batch promised to a ready order is not offered twice', async () => {
    const o = await orderOf(5);
    const view = (await keeper.post(`/api/v1/orders/${o.id}/start-preparing`).expect(200)).body;
    const early = view.lines[0].batches.find((b: { batchNumber: string }) => b.batchNumber === 'EARLY');
    expect(early).toBeUndefined();
    const late = view.lines[0].batches.find((b: { batchNumber: string }) => b.batchNumber === 'LATE');
    expect(late.available).toBe(48);
    // Picking more than the batch has left is refused
    await keeper.put(`/api/v1/orders/${o.id}/lines/${view.lines[0].orderLineId}/picks`, { picks: [{ batchId: late.batchId, quantity: 6 }] }).expect(409);
    await keeper.put(`/api/v1/orders/${o.id}/lines/${view.lines[0].orderLineId}/picks`, { picks: [{ batchId: late.batchId, quantity: 5 }] }).expect(200);
    await keeper.post(`/api/v1/orders/${o.id}/confirm-preparation`).expect(200);
  });

  it('less found than ordered: a normal line continues, a must-have line waits for the customer (C-38, C-39)', async () => {
    const o = await orderOf(6);
    let view = (await keeper.post(`/api/v1/orders/${o.id}/start-preparing`)).body;
    await keeper.post(`/api/v1/orders/${o.id}/lines/${view.lines[0].orderLineId}/reduce`, { newQuantity: 4, reason: 'damaged' }).expect(200);
    view = (await keeper.get(`/api/v1/orders/${o.id}/preparation`)).body;
    expect(view.status).toBe('preparing');
    expect(view.lines[0].need).toBe(4);
    expect((await pharmacy.get('/api/v1/notifications')).body.items[0].type).toBe('order_changed');

    const m = await orderOf(3, true);
    const mv = (await keeper.post(`/api/v1/orders/${m.id}/start-preparing`)).body;
    await keeper.post(`/api/v1/orders/${m.id}/lines/${mv.lines[0].orderLineId}/reduce`, { newQuantity: 2, reason: 'not_found' }).expect(200);
    expect((await keeper.get(`/api/v1/orders/${m.id}`)).body.status).toBe('waiting_for_customer');
    await keeper.post(`/api/v1/orders/${m.id}/confirm-preparation`).expect(409);
    // The customer accepts: back to preparing, by the same person
    await pharmacy.post(`/api/v1/orders/${m.id}/answer`, { answer: 'accept_change' }).expect(200);
    const back = (await keeper.get(`/api/v1/orders/${m.id}/preparation`)).body;
    expect(back).toMatchObject({ status: 'preparing', preparingByMe: true });
  });

  it('release lets another stock manager take over; cancelling a ready order frees its batch', async () => {
    const o = await orderOf(2);
    await keeper.post(`/api/v1/orders/${o.id}/start-preparing`).expect(200);
    await keeper.post(`/api/v1/orders/${o.id}/release-preparing`).expect(200);
    const view = (await keeper2.post(`/api/v1/orders/${o.id}/start-preparing`).expect(200)).body;
    await keeper2.put(`/api/v1/orders/${o.id}/lines/${view.lines[0].orderLineId}/picks`, { picks: view.lines[0].recommended }).expect(200);
    await keeper2.post(`/api/v1/orders/${o.id}/confirm-preparation`).expect(200);
    await keeper.post(`/api/v1/orders/${o.id}/cancel`, { reason: 'Customer closed the shop' }).expect(200);
    const p = (await keeper.get(`/api/v1/products/${product}`)).body;
    // Still reserved: 10 + 5 (ready) + 4 + 2 (being prepared). The cancelled 2 are free again.
    expect(p.stock.reserved).toBe(21);
  });
});
