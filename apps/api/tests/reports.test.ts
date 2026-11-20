import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { firstLogin, newWholesaler, setup, uniquePhone, type Client } from './helpers';

const { db, ownerDb, app } = setup();
afterAll(async () => {
  await db.destroy();
  await ownerDb.destroy();
});

let w: Awaited<ReturnType<typeof newWholesaler>>;
let keeper: Client;
let sales: Client;
let pharmacy: Client;
let product: string;

beforeAll(async () => {
  w = await newWholesaler(ownerDb, app);
  const mk = async (role: string) => {
    const phone = uniquePhone();
    const r = await w.owner.post('/api/v1/employees', { name: role, phone, roles: [role] });
    return firstLogin(app, w.loginCode, phone, r.body.temporaryPassword);
  };
  keeper = await mk('stock_manager');
  sales = await mk('sales');
  const c = await w.owner.post('/api/v1/customers', { businessName: 'Pharmacy', contactPerson: 'X', phone: uniquePhone(), address: 'Y' });
  pharmacy = await firstLogin(app, w.loginCode, c.body.firstLogin.phone, c.body.firstLogin.temporaryPassword);
  const brandId = (await keeper.post('/api/v1/brands', { nameAr: 'ب', nameEn: 'B' })).body.id;
  const categoryId = (await keeper.post('/api/v1/categories', { nameAr: 'ف', nameEn: 'C' })).body.id;
  product = (await keeper.post('/api/v1/products', { productType: 'cosmetic', brandId, categoryId, unit: 'box', packSize: '1', costPrice: '7.00', sellingPrice: '10.00', cosmetic: {}, nameAr: 'م', nameEn: 'Item', trackBatches: false })).body.id;
  await keeper.post('/api/v1/stock/adjustments', { productId: product, countedQuantity: 20, reason: 'Opening' }).expect(201);
  await w.owner.patch('/api/v1/settings', { invoiceTiming: 'on_accepted' }).expect(200);
  const o = (await pharmacy.post('/api/v1/orders', { paymentChoice: 'on_arrival', lines: [{ productId: product, quantity: 3 }] })).body;
  await keeper.post(`/api/v1/orders/${o.id}/accept`).expect(200);
  await pharmacy.post('/api/v1/orders', { paymentChoice: 'on_arrival', lines: [{ productId: product, quantity: 2 }] }).expect(201);
});

describe('dashboard, activity, reports (OWN-09, OWN-10, OWN-12)', () => {
  it('each role sees the numbers of its work', async () => {
    const owner = (await w.owner.get('/api/v1/dashboard').expect(200)).body;
    expect(owner).toMatchObject({ ordersToAccept: 1, ordersToPrepare: 1, unpaidTotal: '30.00', paymentsWaiting: 0 });
    const k = (await keeper.get('/api/v1/dashboard').expect(200)).body;
    expect(k.ordersToAccept).toBe(1);
    expect(k.unpaidTotal).toBeUndefined();
    await pharmacy.get('/api/v1/dashboard').expect(403);
  });

  it('only the owner sees the activity screen, filtered by type and person', async () => {
    await sales.get('/api/v1/activity').expect(403);
    const all = (await w.owner.get('/api/v1/activity?limit=100').expect(200)).body.items;
    expect(all.some((a: { action: string }) => a.action === 'order_accepted')).toBe(true);
    const important = (await w.owner.get('/api/v1/activity?important=1').expect(200)).body.items;
    expect(important.every((a: { important: boolean }) => a.important)).toBe(true);
    expect(important.some((a: { action: string }) => a.action === 'stock_adjusted')).toBe(true);
    const orders = (await w.owner.get('/api/v1/activity?type=order').expect(200)).body.items;
    expect(orders.every((a: { entityType: string }) => a.entityType === 'order')).toBe(true);
  });

  it('sales and stock value reports', async () => {
    const day = (await w.owner.get('/api/v1/reports/sales').expect(200)).body;
    expect(day.total).toBe('30.00');
    const byProduct = (await w.owner.get('/api/v1/reports/sales?by=product').expect(200)).body;
    expect(byProduct.rows[0]).toMatchObject({ amount: '30.00', quantity: 3 });
    const byCustomer = (await w.owner.get('/api/v1/reports/sales?by=customer').expect(200)).body;
    expect(byCustomer.rows[0]).toMatchObject({ label: 'Pharmacy', invoices: 1 });
    await sales.get('/api/v1/reports/sales').expect(403);
    const value = (await keeper.get('/api/v1/reports/stock-value').expect(200)).body;
    expect(value).toMatchObject({ costValue: '140.00', sellingValue: '200.00' });
  });
});
