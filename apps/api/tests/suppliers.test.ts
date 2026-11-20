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
let supplierId: string;
let tracked: string;
let simple: string;

async function employee(role: string) {
  const phone = uniquePhone();
  const r = await w.owner.post('/api/v1/employees', { name: role, phone, roles: [role] });
  return firstLogin(app, w.loginCode, phone, r.body.temporaryPassword);
}

beforeAll(async () => {
  w = await newWholesaler(ownerDb, app);
  keeper = await employee('stock_manager');
  accountant = await employee('accountant');
  sales = await employee('sales');
  const brandId = (await keeper.post('/api/v1/brands', { nameAr: 'ب', nameEn: 'Brand' })).body.id;
  const categoryId = (await keeper.post('/api/v1/categories', { nameAr: 'ف', nameEn: 'Cat' })).body.id;
  const formId = (await keeper.post('/api/v1/dosage-forms', { nameAr: 'ش', nameEn: 'Form' })).body.id;
  const base = { brandId, categoryId, unit: 'box', packSize: '10', costPrice: '10.00', sellingPrice: '15.00' };
  tracked = (
    await keeper.post('/api/v1/products', {
      ...base,
      productType: 'medicine',
      nameAr: 'دواء',
      nameEn: 'Tracked medicine',
      trackBatches: true,
      medicine: { activeIngredient: 'X', strength: '1 mg', dosageFormId: formId, storage: 'room' },
    })
  ).body.id;
  simple = (
    await keeper.post('/api/v1/products', { ...base, productType: 'cosmetic', nameAr: 'كريم', nameEn: 'Cream', trackBatches: false, cosmetic: {} })
  ).body.id;
  supplierId = (await keeper.post('/api/v1/suppliers', { name: 'Pharco', contactPerson: 'Mr. A', phone: '0223456789' })).body.id;
});

describe('suppliers (C-03)', () => {
  it('stock manager adds suppliers, sales cannot see them', async () => {
    await sales.get('/api/v1/suppliers').expect(403);
    await keeper.post('/api/v1/suppliers', { name: 'pharco' }).expect(409);
    const list = await accountant.get('/api/v1/suppliers').expect(200);
    expect(list.body.items[0]).toMatchObject({ name: 'Pharco', balance: '0.00' });
  });
});

describe('receiving goods with the invoice in one step (C-04, C-43, C-75)', () => {
  it('a draft is filled, confirmed once, then locked', async () => {
    const draft = (await keeper.post('/api/v1/receipts', { supplierId }).expect(201)).body;
    expect(draft.status).toBe('draft');
    const filled = await keeper.patch(`/api/v1/receipts/${draft.id}`, {
      supplierInvoiceNumber: 'INV-778',
      supplierInvoiceDate: '2026-11-01',
      lines: [
        { productId: tracked, batchNumber: 'L1', expiryDate: '2029-05-31', quantity: 100, costPrice: '11.50' },
        { productId: simple, quantity: 20, costPrice: '30.00' },
      ],
    });
    expect(filled.status).toBe(200);
    expect(filled.body.totalAmount).toBe('1750.00');

    const confirmed = await keeper.post(`/api/v1/receipts/${draft.id}/confirm`).expect(200);
    expect(confirmed.body.status).toBe('confirmed');
    expect(confirmed.body.receiptNumber).toMatch(/^REC-\d{4}-00001$/);

    // Stock went up
    const p = (await keeper.get(`/api/v1/products/${tracked}`).expect(200)).body;
    expect(p.stock.onHand).toBe(100);
    expect(p.costPrice).toBe('11.50');
    const history = (await w.owner.get(`/api/v1/products/${tracked}/price-history`).expect(200)).body.items;
    expect(history[0]).toMatchObject({ priceType: 'cost', oldPrice: '10.00', newPrice: '11.50' });
    const moves = (await keeper.get(`/api/v1/products/${tracked}/movements`).expect(200)).body.items;
    expect(moves[0]).toMatchObject({ type: 'receipt', quantityChange: 100, batchNumber: 'L1' });

    // The supplier balance went up
    const s = (await accountant.get(`/api/v1/suppliers/${supplierId}`).expect(200)).body;
    expect(s.balance).toBe('1750.00');

    // A confirmed receipt cannot be changed or confirmed twice (C-09)
    await keeper.patch(`/api/v1/receipts/${draft.id}`, { supplierInvoiceNumber: 'X' }).expect(409);
    await keeper.post(`/api/v1/receipts/${draft.id}/confirm`).expect(409);
    const again = (await keeper.get(`/api/v1/products/${tracked}`).expect(200)).body;
    expect(again.stock.onHand).toBe(100);
  });

  it('refuses missing batch details, past expiry, and empty receipts', async () => {
    const empty = (await keeper.post('/api/v1/receipts', { supplierId })).body;
    await keeper.post(`/api/v1/receipts/${empty.id}/confirm`).expect(409);

    const noBatch = (await keeper.post('/api/v1/receipts', { supplierId })).body;
    await keeper.patch(`/api/v1/receipts/${noBatch.id}`, { lines: [{ productId: tracked, quantity: 5, costPrice: '11.50' }] }).expect(200);
    const res = await keeper.post(`/api/v1/receipts/${noBatch.id}/confirm`);
    expect(res.status).toBe(409);
    expect(res.body.error.details.fields['lines.0.batchNumber']).toBe('batch_required');

    const past = (await keeper.post('/api/v1/receipts', { supplierId })).body;
    await keeper.patch(`/api/v1/receipts/${past.id}`, { lines: [{ productId: tracked, batchNumber: 'OLD', expiryDate: '2020-01-01', quantity: 5, costPrice: '1' }] }).expect(200);
    await keeper.post(`/api/v1/receipts/${past.id}/confirm`).expect(409);
    // Nothing was added by the failed confirmations
    const p = (await keeper.get(`/api/v1/products/${tracked}`).expect(200)).body;
    expect(p.stock.onHand).toBe(100);
  });

  it('the same batch number received again is added to the batch', async () => {
    const r = (await keeper.post('/api/v1/receipts', { supplierId })).body;
    await keeper.patch(`/api/v1/receipts/${r.id}`, { lines: [{ productId: tracked, batchNumber: 'L1', expiryDate: '2029-05-31', quantity: 10, costPrice: '11.50' }] });
    await keeper.post(`/api/v1/receipts/${r.id}/confirm`).expect(200);
    const batches = (await keeper.get(`/api/v1/products/${tracked}/batches`).expect(200)).body.items;
    expect(batches).toHaveLength(1);
    expect(batches[0].sellable).toBe(110);
  });
});

describe('supplier payments (ACC-09, ACC-10)', () => {
  it('the accountant pays, partly, and can cancel a wrong payment with a reason', async () => {
    await keeper.post('/api/v1/supplier-payments', { supplierId, amount: '100', method: 'cash', paidOn: '2026-11-10' }).expect(403);
    const pay = await accountant.post('/api/v1/supplier-payments', { supplierId, amount: '500.00', method: 'bank_transfer', paidOn: '2026-11-10', reference: 'TRX1' }).expect(201);
    let s = (await accountant.get(`/api/v1/suppliers/${supplierId}`).expect(200)).body;
    expect(s.balance).toBe('1365.00'); // 1750 + 115 - 500
    await accountant.post(`/api/v1/supplier-payments/${pay.body.id}/cancel`, { reason: '' }).expect(400);
    await accountant.post(`/api/v1/supplier-payments/${pay.body.id}/cancel`, { reason: 'Wrong amount' }).expect(200);
    s = (await accountant.get(`/api/v1/suppliers/${supplierId}`).expect(200)).body;
    expect(s.balance).toBe('1865.00');
    expect(s.payments[0].cancelReason).toBe('Wrong amount');
    expect(Array.isArray(s.supplierReturns)).toBe(true);
    expect(typeof s.returns).toBe('string');
  });
});

describe('supplier returns (C-42, C-65)', () => {
  it('without approval: stock and the amount owed go down at once, and the owner is alerted', async () => {
    const batches = (await keeper.get(`/api/v1/products/${tracked}/batches`)).body.items;
    const ret = await keeper.post('/api/v1/supplier-returns', {
      supplierId,
      reason: 'damaged',
      lines: [{ productId: tracked, batchId: batches[0].id, stockState: 'sellable', quantity: 10 }],
    });
    expect(ret.status).toBe(201);
    expect(ret.body).toMatchObject({ status: 'confirmed', totalValue: '115.00' });
    const p = (await keeper.get(`/api/v1/products/${tracked}`)).body;
    expect(p.stock.onHand).toBe(100);
    const s = (await accountant.get(`/api/v1/suppliers/${supplierId}`)).body;
    expect(s.balance).toBe('1750.00');
    const notes = (await w.owner.get('/api/v1/notifications')).body.items;
    expect(notes.some((n: { type: string }) => n.type === 'supplier_return_confirmed')).toBe(true);
  });

  it('with approval: the units are held, then the owner approves or rejects', async () => {
    await w.owner.patch('/api/v1/settings', { supplierReturnApproval: true }).expect(200);
    const batchId = (await keeper.get(`/api/v1/products/${tracked}/batches`)).body.items[0].id;

    const first = (await keeper.post('/api/v1/supplier-returns', { supplierId, reason: 'near_expiry', lines: [{ productId: tracked, batchId, stockState: 'sellable', quantity: 30 }] }).expect(201)).body;
    expect(first.status).toBe('waiting_for_owner');
    let p = (await keeper.get(`/api/v1/products/${tracked}`)).body;
    expect(p.stock).toMatchObject({ onHand: 70, held: 30, available: 70 });
    // Still owed, until the owner approves
    expect((await accountant.get(`/api/v1/suppliers/${supplierId}`)).body.balance).toBe('1750.00');

    await keeper.post(`/api/v1/supplier-returns/${first.id}/approve`).expect(403);
    await w.owner.post(`/api/v1/supplier-returns/${first.id}/reject`, { reason: '' }).expect(400);
    const rejected = (await w.owner.post(`/api/v1/supplier-returns/${first.id}/reject`, { reason: 'Supplier refuses' }).expect(200)).body;
    expect(rejected).toMatchObject({ status: 'rejected', rejectionReason: 'Supplier refuses' });
    p = (await keeper.get(`/api/v1/products/${tracked}`)).body;
    expect(p.stock).toMatchObject({ onHand: 100, held: 0 });
    // The stock manager is told
    const keeperNotes = (await keeper.get('/api/v1/notifications')).body.items;
    expect(keeperNotes[0].type).toBe('supplier_return_rejected');

    const second = (await keeper.post('/api/v1/supplier-returns', { supplierId, reason: 'near_expiry', lines: [{ productId: tracked, batchId, stockState: 'sellable', quantity: 20 }] }).expect(201)).body;
    await w.owner.post(`/api/v1/supplier-returns/${second.id}/approve`).expect(200);
    await w.owner.post(`/api/v1/supplier-returns/${second.id}/approve`).expect(409);
    p = (await keeper.get(`/api/v1/products/${tracked}`)).body;
    expect(p.stock).toMatchObject({ onHand: 80, held: 0 });
    expect((await accountant.get(`/api/v1/suppliers/${supplierId}`)).body.balance).toBe('1520.00');
    const batch = (await keeper.get(`/api/v1/products/${tracked}/batches`)).body.items[0];
    expect(batch).toMatchObject({ sellable: 80, held: 0 });
    await w.owner.patch('/api/v1/settings', { supplierReturnApproval: false }).expect(200);
  });

  it('returns damaged stock, refuses more than exists, and needs a note for "other"', async () => {
    const batchId = (await keeper.get(`/api/v1/products/${tracked}/batches`)).body.items[0].id;
    await keeper.post('/api/v1/stock/damaged', { productId: tracked, batchId, kind: 'damaged', quantity: 4, reason: 'Broken' }).expect(201);
    await keeper.post('/api/v1/supplier-returns', { supplierId, reason: 'damaged', lines: [{ productId: tracked, batchId, stockState: 'damaged', quantity: 5 }] }).expect(409);
    await keeper.post('/api/v1/supplier-returns', { supplierId, reason: 'other', lines: [{ productId: tracked, batchId, stockState: 'damaged', quantity: 4 }] }).expect(400);
    const ok = await keeper.post('/api/v1/supplier-returns', { supplierId, reason: 'damaged', lines: [{ productId: tracked, batchId, stockState: 'damaged', quantity: 4 }] }).expect(201);
    expect(ok.body.status).toBe('confirmed');
    const batch = (await keeper.get(`/api/v1/products/${tracked}/batches`)).body.items[0];
    expect(batch).toMatchObject({ sellable: 76, damaged: 0 });
  });

  it('another wholesaler cannot see these suppliers', async () => {
    const other = await newWholesaler(ownerDb, app);
    await other.owner.get(`/api/v1/suppliers/${supplierId}`).expect(404);
    expect((await other.owner.get('/api/v1/suppliers')).body.items).toHaveLength(0);
  });
});
