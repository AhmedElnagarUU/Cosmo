import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, firstLogin, newWholesaler, setup, uniquePhone, type Client } from './helpers';
import { withTenant } from '../src/core/db';
import { expireBatches } from '../src/modules/stock/stock.service';

const { db, ownerDb, app } = setup();
afterAll(async () => {
  await db.destroy();
  await ownerDb.destroy();
});

type W = Awaited<ReturnType<typeof newWholesaler>>;
let w: W;
let stockManager: Client;
let sales: Client;
let pharmacy: Client;
let brandId: string;
let medCategory: string;
let cosCategory: string;
let tabletForm: string;

async function employee(role: string) {
  const phone = uniquePhone();
  const r = await w.owner.post('/api/v1/employees', { name: role, phone, roles: [role] });
  return firstLogin(app, w.loginCode, phone, r.body.temporaryPassword);
}

beforeAll(async () => {
  w = await newWholesaler(ownerDb, app);
  stockManager = await employee('stock_manager');
  sales = await employee('sales');
  const c = await w.owner.post('/api/v1/customers', { businessName: 'Pharmacy', contactPerson: 'X', phone: uniquePhone(), address: 'Y' });
  pharmacy = await firstLogin(app, w.loginCode, c.body.firstLogin.phone, c.body.firstLogin.temporaryPassword);

  brandId = (await stockManager.post('/api/v1/brands', { nameAr: 'جي إس كيه', nameEn: 'GSK' })).body.id;
  medCategory = (await stockManager.post('/api/v1/categories', { nameAr: 'مسكنات', nameEn: 'Pain relief', appliesTo: 'medicine' })).body.id;
  cosCategory = (await stockManager.post('/api/v1/categories', { nameAr: 'العناية بالشعر', nameEn: 'Hair care', appliesTo: 'cosmetic' })).body.id;
  tabletForm = (await stockManager.post('/api/v1/dosage-forms', { nameAr: 'أقراص', nameEn: 'Tablets' })).body.id;
});

function medicine(overrides: Record<string, unknown> = {}) {
  return {
    productType: 'medicine',
    nameAr: 'بنادول ٥٠٠ مجم',
    nameEn: 'Panadol 500 mg',
    barcode: null,
    brandId,
    categoryId: medCategory,
    unit: 'box',
    packSize: '24 tablets',
    costPrice: '40.00',
    sellingPrice: '52.50',
    trackBatches: true,
    medicine: { activeIngredient: 'Paracetamol', strength: '500 mg', dosageFormId: tabletForm, storage: 'room', publicPrice: '60.00' },
    ...overrides,
  };
}

describe('lists (C-74)', () => {
  it('stock manager and owner manage lists, sales cannot', async () => {
    await sales.post('/api/v1/brands', { nameAr: 'x', nameEn: 'X' }).expect(403);
    const list = await pharmacy.get('/api/v1/brands').expect(200);
    expect(list.body.items.map((b: { nameEn: string }) => b.nameEn)).toContain('GSK');
    await stockManager.post('/api/v1/brands', { nameAr: 'جي إس كيه', nameEn: 'gsk' }).expect(409);
  });
});

describe('products (C-66, C-67, OWN-06)', () => {
  it('creates a medicine and hides cost from sales and customers', async () => {
    const created = await stockManager.post('/api/v1/products', medicine({ barcode: '6221234567890' }));
    expect(created.status).toBe(201);
    expect(created.body.costPrice).toBe('40.00');
    expect(created.body.medicine.activeIngredient).toBe('Paracetamol');
    expect(created.body.stock).toEqual({ onHand: 0, reserved: 0, held: 0, available: 0 });

    const forSales = await sales.get(`/api/v1/products/${created.body.id}`).expect(200);
    expect(forSales.body.costPrice).toBeUndefined();
    const forPharmacy = await pharmacy.get(`/api/v1/products/${created.body.id}`).expect(200);
    expect(forPharmacy.body.costPrice).toBeUndefined();
    expect(forPharmacy.body.stock).toBeUndefined();
    expect(forPharmacy.body.inStock).toBe(false);
    expect(forPharmacy.body.medicine.publicPrice).toBe('60.00');

    // The same barcode cannot be used twice
    await stockManager.post('/api/v1/products', medicine({ barcode: '6221234567890', nameEn: 'Copy' })).expect(409);
  });

  it('searches by name in Arabic and English, barcode, and active ingredient', async () => {
    await stockManager.post('/api/v1/products', medicine({ nameAr: 'كونجستال', nameEn: 'Congestal', barcode: '622999', medicine: { activeIngredient: 'Chlorpheniramine', strength: '2 mg', dosageFormId: tabletForm, storage: 'room' } })).expect(201);
    const byName = await pharmacy.get('/api/v1/products?q=congest').expect(200);
    expect(byName.body.items.map((p: { nameEn: string }) => p.nameEn)).toEqual(['Congestal']);
    const byArabic = await pharmacy.get(`/api/v1/products?q=${encodeURIComponent('كونجستال')}`).expect(200);
    expect(byArabic.body.total).toBe(1);
    const byIngredient = await pharmacy.get('/api/v1/products?q=chlorphen').expect(200);
    expect(byIngredient.body.total).toBe(1);
    const byBarcode = await pharmacy.get('/api/v1/products?q=622999').expect(200);
    expect(byBarcode.body.total).toBe(1);
  });

  it('refuses a category of the wrong type and a missing medicine field', async () => {
    await stockManager.post('/api/v1/products', medicine({ categoryId: cosCategory })).expect(409);
    const res = await stockManager.post('/api/v1/products', medicine({ medicine: { strength: '1 mg', dosageFormId: tabletForm, storage: 'room' } }));
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields['medicine.activeIngredient']).toBeDefined();
  });

  it('creates a cosmetic shade without batch tracking, with a default batch', async () => {
    const res = await stockManager.post('/api/v1/products', {
      productType: 'cosmetic',
      nameAr: 'صبغة شعر ٥٫٠',
      nameEn: 'Hair color 5.0',
      brandId,
      categoryId: cosCategory,
      unit: 'piece',
      packSize: '50 ml',
      costPrice: '80',
      sellingPrice: '95',
      trackBatches: false,
      cosmetic: { shadeName: 'Light brown', shadeNumber: '5.0', periodAfterOpeningMonths: 12 },
    });
    expect(res.status).toBe(201);
    const batches = await stockManager.get(`/api/v1/products/${res.body.id}/batches`).expect(200);
    expect(batches.body.items).toHaveLength(1);
    expect(batches.body.items[0].batchNumber).toBeNull();
  });

  it('only the owner changes prices, and the change is kept in the history (OWN-07)', async () => {
    const p = (await stockManager.post('/api/v1/products', medicine({ nameEn: 'Priced' }))).body;
    await stockManager.patch(`/api/v1/products/${p.id}/price`, { sellingPrice: '1.00' }).expect(403);
    const changed = await w.owner.patch(`/api/v1/products/${p.id}/price`, { sellingPrice: '55.00' }).expect(200);
    expect(changed.body.sellingPrice).toBe('55.00');
    const history = await w.owner.get(`/api/v1/products/${p.id}/price-history`).expect(200);
    expect(history.body.items[0]).toMatchObject({ priceType: 'selling', oldPrice: '52.50', newPrice: '55.00' });
    // Editing the product never changes the price
    const edit = medicine({ nameEn: 'Priced v2', sellingPrice: '1.00' });
    delete (edit as Record<string, unknown>).productType;
    const after = await stockManager.patch(`/api/v1/products/${p.id}`, edit).expect(200);
    expect(after.body.sellingPrice).toBe('55.00');
    expect(after.body.nameEn).toBe('Priced v2');
  });

  it('a deactivated product is hidden from customers', async () => {
    const p = (await stockManager.post('/api/v1/products', medicine({ nameEn: 'Hidden soon' }))).body;
    await stockManager.post(`/api/v1/products/${p.id}/deactivate`).expect(200);
    await pharmacy.get(`/api/v1/products/${p.id}`).expect(404);
    const list = await pharmacy.get('/api/v1/products?q=hidden').expect(200);
    expect(list.body.total).toBe(0);
  });
});

describe('extra fields (C-71)', () => {
  it('the owner adds a field, values are checked, and customers see only visible fields', async () => {
    await stockManager.post('/api/v1/extra-fields', { nameAr: 'بلد المنشأ', nameEn: 'Origin', fieldType: 'text', appliesTo: 'both', isRequired: false, shownToCustomers: true }).expect(403);
    const origin = await w.owner.post('/api/v1/extra-fields', { nameAr: 'بلد المنشأ', nameEn: 'Origin', fieldType: 'choice', choices: ['Egypt', 'Imported'], appliesTo: 'both', isRequired: true, shownToCustomers: true }).expect(201);
    const internal = await w.owner.post('/api/v1/extra-fields', { nameAr: 'رف', nameEn: 'Shelf', fieldType: 'number', appliesTo: 'medicine', isRequired: false, shownToCustomers: false }).expect(201);

    // Required field missing
    const missing = await stockManager.post('/api/v1/products', medicine({ nameEn: 'Needs origin' }));
    expect(missing.status).toBe(400);
    // Wrong choice
    const wrong = await stockManager.post('/api/v1/products', medicine({ nameEn: 'Bad', extraValues: { [origin.body.id]: 'Mars' } }));
    expect(wrong.status).toBe(400);

    const ok = await stockManager.post('/api/v1/products', medicine({ nameEn: 'With fields', extraValues: { [origin.body.id]: 'Egypt', [internal.body.id]: '12' } })).expect(201);
    const forPharmacy = await pharmacy.get(`/api/v1/products/${ok.body.id}`).expect(200);
    expect(forPharmacy.body.extraFields.map((f: { nameEn: string }) => f.nameEn)).toEqual(['Origin']);

    // Switch the required field off so other tests are not affected
    await w.owner.patch(`/api/v1/extra-fields/${origin.body.id}`, { isActive: false }).expect(200);
  });
});

describe('offers (C-41)', () => {
  it('one offer per product, customers see it, and it can be stopped', async () => {
    const p = (await stockManager.post('/api/v1/products', medicine({ nameEn: 'On offer' }))).body;
    await stockManager.post('/api/v1/offers', { offerType: 'bonus', productId: p.id, buyQuantity: 10, freeQuantity: 1 }).expect(403);
    const offer = await w.owner.post('/api/v1/offers', { offerType: 'bonus', productId: p.id, buyQuantity: 10, freeQuantity: 1 }).expect(201);
    await w.owner.post('/api/v1/offers', { offerType: 'discount', productId: p.id, discountPercent: '5' }).expect(409);
    const seen = await pharmacy.get(`/api/v1/products/${p.id}`).expect(200);
    expect(seen.body.offer).toMatchObject({ offerType: 'bonus', buyQuantity: 10, freeQuantity: 1 });
    await w.owner.post(`/api/v1/offers/${offer.body.id}/stop`).expect(200);
    await w.owner.post('/api/v1/offers', { offerType: 'discount', productId: p.id, discountPercent: '5' }).expect(201);
    await w.owner.post('/api/v1/offers', { offerType: 'discount', productId: p.id, discountPercent: '0' }).expect(400);
  });

  it('a future offer is not shown to customers yet', async () => {
    const p = (await stockManager.post('/api/v1/products', medicine({ nameEn: 'Future offer' }))).body;
    await w.owner.post('/api/v1/offers', { offerType: 'discount', productId: p.id, discountPercent: '10', startsOn: '2099-01-01' }).expect(201);
    const seen = await pharmacy.get(`/api/v1/products/${p.id}`).expect(200);
    expect(seen.body.offer).toBeNull();
  });
});

describe('stock (C-08 to C-10, STK-14 to STK-16)', () => {
  it('opening stock, correction, damaged and lost, with a ledger and owner alerts', async () => {
    const p = (await stockManager.post('/api/v1/products', medicine({ nameEn: 'Stocked' }))).body;
    // A batch-tracked product needs a batch
    await stockManager.post('/api/v1/stock/adjustments', { productId: p.id, countedQuantity: 100, reason: 'Opening stock' }).expect(409);
    await stockManager.post('/api/v1/stock/adjustments', { productId: p.id, newBatch: { batchNumber: 'B1', expiryDate: '2020-01-01' }, countedQuantity: 100, reason: 'Opening stock' }).expect(409);
    await stockManager.post('/api/v1/stock/adjustments', { productId: p.id, newBatch: { batchNumber: 'B1', expiryDate: '2030-01-31' }, countedQuantity: 100, reason: 'Opening stock' }).expect(201);
    await stockManager.post('/api/v1/stock/adjustments', { productId: p.id, newBatch: { batchNumber: 'B2', expiryDate: '2031-06-30' }, countedQuantity: 50, reason: 'Opening stock' }).expect(201);

    const batches = (await stockManager.get(`/api/v1/products/${p.id}/batches`).expect(200)).body.items;
    expect(batches.map((b: { batchNumber: string }) => b.batchNumber)).toEqual(['B1', 'B2']);
    const b1 = batches[0].id;

    await stockManager.post('/api/v1/stock/adjustments', { productId: p.id, batchId: b1, countedQuantity: 95, reason: 'Count after stocktake' }).expect(201);
    await stockManager.post('/api/v1/stock/damaged', { productId: p.id, batchId: b1, kind: 'damaged', quantity: 5, reason: 'Broken boxes' }).expect(201);
    await stockManager.post('/api/v1/stock/damaged', { productId: p.id, batchId: b1, kind: 'lost', quantity: 2, reason: 'Missing' }).expect(201);
    await stockManager.post('/api/v1/stock/damaged', { productId: p.id, batchId: b1, kind: 'lost', quantity: 1000, reason: 'Too many' }).expect(409);
    // A reason is required
    await stockManager.post('/api/v1/stock/damaged', { productId: p.id, batchId: b1, kind: 'lost', quantity: 1, reason: '' }).expect(400);

    const product = (await stockManager.get(`/api/v1/products/${p.id}`).expect(200)).body;
    expect(product.stock).toEqual({ onHand: 138, reserved: 0, held: 0, available: 138 });
    const after = (await stockManager.get(`/api/v1/products/${p.id}/batches`).expect(200)).body.items[0];
    expect(after).toMatchObject({ sellable: 88, damaged: 5 });

    // The ledger explains the number: 100 + 50 - 5 - 5 - 2 = 138 sellable
    const moves = (await stockManager.get(`/api/v1/products/${p.id}/movements?limit=100`).expect(200)).body.items;
    const sellable = moves.filter((m: { state: string }) => m.state === 'sellable').reduce((s: number, m: { quantityChange: number }) => s + m.quantityChange, 0);
    expect(sellable).toBe(138);

    const notes = (await w.owner.get('/api/v1/notifications?limit=100').expect(200)).body.items;
    expect(notes.filter((n: { type: string }) => n.type === 'stock_adjusted').length).toBeGreaterThanOrEqual(3);
    expect(notes.some((n: { type: string }) => n.type === 'stock_damaged')).toBe(true);

    // Customers see "in stock" only
    const forPharmacy = (await pharmacy.get(`/api/v1/products/${p.id}`).expect(200)).body;
    expect(forPharmacy.inStock).toBe(true);
    expect(forPharmacy.stock).toBeUndefined();
  });

  it('the database refuses stock below what is reserved', async () => {
    const p = (await stockManager.post('/api/v1/products', medicine({ nameEn: 'Reserved', trackBatches: false }))).body;
    await stockManager.post('/api/v1/stock/adjustments', { productId: p.id, countedQuantity: 10, reason: 'Opening' }).expect(201);
    // Phase 4 reserves stock for orders. Here we reserve directly to test the rule.
    await withTenant(db, w.wholesalerId, (trx) => trx.updateTable('product_stock').set({ reserved: 8 }).where('product_id', '=', p.id).execute());
    const res = await stockManager.post('/api/v1/stock/adjustments', { productId: p.id, countedQuantity: 5, reason: 'Count' });
    expect(res.status).toBe(409);
    await expect(
      withTenant(db, w.wholesalerId, (trx) => trx.updateTable('product_stock').set({ reserved: 11 }).where('product_id', '=', p.id).execute()),
    ).rejects.toThrow(/check constraint/);
  });

  it('expired batches stop counting as available, and show on the expiry list', async () => {
    const p = (await stockManager.post('/api/v1/products', medicine({ nameEn: 'Expiring' }))).body;
    await stockManager.post('/api/v1/stock/adjustments', { productId: p.id, newBatch: { batchNumber: 'OLD', expiryDate: '2030-01-01' }, countedQuantity: 20, reason: 'Opening' }).expect(201);
    // Run the nightly job as if today were in 2030
    await withTenant(db, w.wholesalerId, (trx) => expireBatches(trx, w.wholesalerId, '2030-01-02'));
    const product = (await stockManager.get(`/api/v1/products/${p.id}`).expect(200)).body;
    expect(product.stock.available).toBe(0);
    const batch = (await stockManager.get(`/api/v1/products/${p.id}/batches`).expect(200)).body.items[0];
    expect(batch).toMatchObject({ sellable: 0, expired: 20, onHand: 20 });
    // Running it again changes nothing
    await withTenant(db, w.wholesalerId, (trx) => expireBatches(trx, w.wholesalerId, '2030-01-02'));
    const again = (await stockManager.get(`/api/v1/products/${p.id}/batches`).expect(200)).body.items[0];
    expect(again.expired).toBe(20);
  });

  it('near-expiry list uses the setting', async () => {
    const p = (await stockManager.post('/api/v1/products', medicine({ nameEn: 'Soon' }))).body;
    const soon = new Date();
    soon.setUTCMonth(soon.getUTCMonth() + 2);
    await stockManager.post('/api/v1/stock/adjustments', { productId: p.id, newBatch: { batchNumber: 'SOON', expiryDate: soon.toISOString().slice(0, 10) }, countedQuantity: 5, reason: 'Opening' }).expect(201);
    const list = (await stockManager.get('/api/v1/stock/near-expiry').expect(200)).body;
    expect(list.months).toBe(6);
    expect(list.nearExpiry.some((b: { batchNumber: string }) => b.batchNumber === 'SOON')).toBe(true);
    await w.owner.patch('/api/v1/settings', { nearExpiryMonths: 1 }).expect(200);
    const shorter = (await stockManager.get('/api/v1/stock/near-expiry').expect(200)).body;
    expect(shorter.nearExpiry.some((b: { batchNumber: string }) => b.batchNumber === 'SOON')).toBe(false);
  });

  it('another wholesaler cannot read or change this stock', async () => {
    const other = await newWholesaler(ownerDb, app);
    const p = (await stockManager.post('/api/v1/products', medicine({ nameEn: 'Private' }))).body;
    await other.owner.get(`/api/v1/products/${p.id}`).expect(404);
    await other.owner.get(`/api/v1/products/${p.id}/batches`).expect(404);
    await other.owner.post('/api/v1/stock/adjustments', { productId: p.id, newBatch: { batchNumber: 'X', expiryDate: '2035-01-01' }, countedQuantity: 1, reason: 'x' }).expect(404);
    const list = (await other.owner.get('/api/v1/products').expect(200)).body;
    expect(list.total).toBe(0);
    void client;
  });
});
