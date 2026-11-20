import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { firstLogin, newWholesaler, setup, uniquePhone, type Client } from './helpers';
import { withTenant } from '../src/core/db';

const { db, ownerDb, app } = setup();
afterAll(async () => {
  await db.destroy();
  await ownerDb.destroy();
});

let w: Awaited<ReturnType<typeof newWholesaler>>;
let keeper: Client;
let accountant: Client;
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
async function prepared(quantity: number, paymentChoice = 'on_arrival') {
  const o = (await pharmacy.post('/api/v1/orders', { paymentChoice, lines: [{ productId: product, quantity }] }).expect(201)).body;
  await keeper.post(`/api/v1/orders/${o.id}/accept`).expect(200);
  const v = (await keeper.post(`/api/v1/orders/${o.id}/start-preparing`)).body;
  for (const l of v.lines) await keeper.put(`/api/v1/orders/${o.id}/lines/${l.orderLineId}/picks`, { picks: l.recommended }).expect(200);
  await keeper.post(`/api/v1/orders/${o.id}/confirm-preparation`).expect(200);
  return o;
}
async function invoiceFor(orderId: string) {
  const list = (await accountant.get('/api/v1/invoices?limit=100')).body.items as Array<{ id: string }>;
  for (const i of list) {
    const full = (await accountant.get(`/api/v1/invoices/${i.id}`)).body;
    if (full.orderId === orderId) return full;
  }
  return null;
}

beforeAll(async () => {
  w = await newWholesaler(ownerDb, app);
  keeper = (await employee('stock_manager')).c;
  accountant = (await employee('accountant')).c;
  const d = await employee('delivery');
  driver = d.c;
  driverId = d.userId;
  const c = await w.owner.post('/api/v1/customers', { businessName: 'Pharmacy', contactPerson: 'X', phone: uniquePhone(), address: 'Y' });
  customerId = c.body.customer.id;
  pharmacy = await firstLogin(app, w.loginCode, c.body.firstLogin.phone, c.body.firstLogin.temporaryPassword);
  const brandId = (await keeper.post('/api/v1/brands', { nameAr: 'ب', nameEn: 'B' })).body.id;
  const categoryId = (await keeper.post('/api/v1/categories', { nameAr: 'ف', nameEn: 'C' })).body.id;
  product = (await keeper.post('/api/v1/products', { productType: 'cosmetic', brandId, categoryId, unit: 'box', packSize: '1', costPrice: '7.00', sellingPrice: '10.00', cosmetic: {}, nameAr: 'م', nameEn: 'Item', trackBatches: false })).body.id;
  await keeper.post('/api/v1/stock/adjustments', { productId: product, countedQuantity: 500, reason: 'Opening' }).expect(201);
  await w.owner.post('/api/v1/offers', { offerType: 'bonus', productId: product, buyQuantity: 10, freeQuantity: 1 }).expect(201);
});

describe('invoice on delivery, door payment, trip closing (C-27, C-44, C-47, C-58)', () => {
  it('runs a full day', async () => {
    const o = await prepared(10);
    // Default timing is "on delivered": no invoice yet
    expect(await invoiceFor(o.id)).toBeNull();
    const trip = (await w.owner.post('/api/v1/trips', { deliveryPersonId: driverId, orderIds: [o.id] }).expect(201)).body;
    const started = (await driver.post(`/api/v1/trips/${trip.id}/start`).expect(200)).body;
    const stop = started.stops[0];
    const lineId = (await keeper.get(`/api/v1/orders/${o.id}`)).body.lines[0].id;
    await driver.post(`/api/v1/trip-stops/${stop.id}/deliver`, { refused: [{ orderLineId: lineId, quantity: 2 }], refusedReason: 'Damaged' }).expect(200);

    const inv = await invoiceFor(o.id);
    expect(inv).toMatchObject({ total: '100.00', returnCredit: '18.18', remaining: '81.82', status: 'partially_paid' });
    expect(inv.invoiceNumber).toMatch(/^INV-\d{4}-00001$/);
    // C-41: free units are a separate line at price zero
    expect(inv.lines.map((l: { quantity: number; isBonus: boolean; lineTotal: string }) => [l.quantity, l.isBonus, l.lineTotal])).toEqual([[10, false, '100.00'], [1, true, '0.00']]);

    await driver.post(`/api/v1/trip-stops/${stop.id}/payments`, { method: 'cash', amount: '81.82' }).expect(201);
    const waiting = (await accountant.get('/api/v1/payments?status=waiting')).body.items;
    expect(waiting).toHaveLength(1);
    expect(waiting[0]).toMatchObject({ amount: '81.82', recordedBy: expect.any(String), invoiceNumber: inv.invoiceNumber });
    // Waiting does not count as paid (C-27)
    expect((await invoiceFor(o.id)).status).toBe('partially_paid');
    await keeper.post(`/api/v1/payments/${waiting[0].id}/confirm`).expect(403);
    await accountant.post(`/api/v1/payments/${waiting[0].id}/confirm`).expect(200);
    await accountant.post(`/api/v1/payments/${waiting[0].id}/confirm`).expect(409);
    expect((await invoiceFor(o.id)).status).toBe('paid');

    // The trip closes only with the cash handed over and the paper in
    await accountant.post(`/api/v1/trips/${trip.id}/cash-handover`, { cashReceived: '80.00' }).expect(400);
    await accountant.post(`/api/v1/trips/${trip.id}/cash-handover`, { cashReceived: '81.82' }).expect(200);
    expect((await w.owner.get(`/api/v1/trips/${trip.id}`)).body.status).toBe('finished');
    await w.owner.post(`/api/v1/trip-stops/${stop.id}/paper-received`).expect(200);
    expect((await w.owner.get(`/api/v1/trips/${trip.id}`)).body.status).toBe('closed');

    // The customer sees the invoice and the statement
    const mine = (await pharmacy.get('/api/v1/invoices')).body.items;
    expect(mine).toHaveLength(1);
    const st = (await pharmacy.get('/api/v1/my/statement')).body;
    expect(st.balance).toBe('0.00');
    expect(st.rows.map((r: { kind: string; amount: string }) => [r.kind, r.amount])).toEqual([['invoice', '100.00'], ['return', '-18.18'], ['payment', '-81.82']]);
  });
});

describe('invoice on acceptance follows the order (C-58)', () => {
  it('is created at acceptance, corrected when a quantity is reduced, and cancelled with the order', async () => {
    await w.owner.patch('/api/v1/settings', { invoiceTiming: 'on_accepted' }).expect(200);
    const o = (await pharmacy.post('/api/v1/orders', { paymentChoice: 'on_arrival', lines: [{ productId: product, quantity: 5 }] }).expect(201)).body;
    await keeper.post(`/api/v1/orders/${o.id}/accept`).expect(200);
    expect((await invoiceFor(o.id)).total).toBe('50.00');
    const v = (await keeper.post(`/api/v1/orders/${o.id}/start-preparing`)).body;
    await keeper.post(`/api/v1/orders/${o.id}/lines/${v.lines[0].orderLineId}/reduce`, { newQuantity: 3, reason: 'damaged' }).expect(200);
    expect((await invoiceFor(o.id)).total).toBe('30.00');
    await keeper.post(`/api/v1/orders/${o.id}/cancel`, { reason: 'Customer closed' }).expect(200);
    expect((await invoiceFor(o.id)).status).toBe('cancelled');
    await w.owner.patch('/api/v1/settings', { invoiceTiming: 'on_delivered' }).expect(200);
  });
});

describe('credit, office payments, overdue (C-26, C-33, C-36, ACC-04 to ACC-08, ACC-12)', () => {
  it('works end to end', async () => {
    await w.owner.patch(`/api/v1/customers/${customerId}/credit`, { creditAllowed: true, creditDays: 15 }).expect(200);
    await w.owner.patch('/api/v1/settings', { invoiceTiming: 'on_prepared' }).expect(200);
    const o = await prepared(4, 'credit');
    const inv = await invoiceFor(o.id);
    expect(Date.parse(inv.dueDate) - Date.parse(inv.invoiceDate)).toBe(15 * 86_400_000);
    expect(inv.paymentChoice).toBe('credit');

    await accountant.post('/api/v1/payments', { invoiceId: inv.id, amount: '50.00', method: 'bank_transfer', paidOn: '2026-11-20' }).expect(409);
    const p1 = (await accountant.post('/api/v1/payments', { invoiceId: inv.id, amount: '15.00', method: 'bank_transfer', paidOn: '2026-11-20', reference: 'T1' }).expect(201)).body;
    expect((await invoiceFor(o.id)).status).toBe('partially_paid');
    await accountant.post(`/api/v1/payments/${p1.id}/cancel`, { reason: 'Wrong invoice' }).expect(200);
    expect((await invoiceFor(o.id))).toMatchObject({ status: 'unpaid', remaining: '40.00' });

    // Make it overdue
    await withTenant(db, w.wholesalerId, (trx) => trx.updateTable('invoices').set({ invoice_date: '2026-01-01', due_date: '2026-01-16' }).where('id', '=', inv.id).execute());
    const overdue = (await accountant.get('/api/v1/invoices?overdue=1')).body.items;
    expect(overdue.map((i: { id: string }) => i.id)).toContain(inv.id);
    expect(overdue.find((i: { id: string }) => i.id === inv.id).daysLate).toBeGreaterThan(0);
    const balances = (await accountant.get('/api/v1/customer-balances')).body.items;
    expect(balances.find((b: { id: string }) => b.id === customerId)).toMatchObject({ balance: '40.00', overdue: '40.00' });
    // C-33: the customer is not blocked
    await pharmacy.post('/api/v1/orders', { paymentChoice: 'credit', lines: [{ productId: product, quantity: 1 }] }).expect(201);
  });

  it('a rejected door payment alerts the owner and leaves the invoice unpaid', async () => {
    await w.owner.patch('/api/v1/settings', { invoiceTiming: 'on_delivered' }).expect(200);
    const o = await prepared(2);
    const trip = (await w.owner.post('/api/v1/trips', { deliveryPersonId: driverId, orderIds: [o.id] }).expect(201)).body;
    const s = (await driver.post(`/api/v1/trips/${trip.id}/start`)).body.stops[0];
    await driver.post(`/api/v1/trip-stops/${s.id}/deliver`, {}).expect(200);
    await driver.post(`/api/v1/trip-stops/${s.id}/payments`, { method: 'instapay', amount: '20.00', reference: 'IP-1' }).expect(201);
    const p = (await accountant.get('/api/v1/payments?status=waiting')).body.items[0];
    await accountant.post(`/api/v1/payments/${p.id}/reject`, { reason: 'Transfer not found' }).expect(200);
    expect((await invoiceFor(o.id)).status).toBe('unpaid');
    const notes = (await w.owner.get('/api/v1/notifications')).body.items;
    expect(notes[0]).toMatchObject({ type: 'payment_rejected', body: 'Transfer not found' });
  });
});
