import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { firstLogin, newWholesaler, setup, uniquePhone, type Client } from './helpers';

const { db, ownerDb, app } = setup();
afterAll(async () => {
  await db.destroy();
  await ownerDb.destroy();
});

let w: Awaited<ReturnType<typeof newWholesaler>>;
let keeper: Client;
let manager: Client;
let driver: Client;
let driver2: Client;
let driverId: string;
let pharmacy: Client;
let product: string;

async function employee(role: string) {
  const phone = uniquePhone();
  const r = await w.owner.post('/api/v1/employees', { name: role + phone.slice(-3), phone, roles: [role] });
  const c = await firstLogin(app, w.loginCode, phone, r.body.temporaryPassword);
  return { c, userId: r.body.employee.userId as string };
}

// Places, accepts, and prepares an order with the recommended batches
async function readyOrder(quantity: number) {
  const o = (await pharmacy.post('/api/v1/orders', { paymentChoice: 'on_arrival', lines: [{ productId: product, quantity }] }).expect(201)).body;
  await keeper.post(`/api/v1/orders/${o.id}/accept`).expect(200);
  const v = (await keeper.post(`/api/v1/orders/${o.id}/start-preparing`)).body;
  for (const l of v.lines) await keeper.put(`/api/v1/orders/${o.id}/lines/${l.orderLineId}/picks`, { picks: l.recommended }).expect(200);
  await keeper.post(`/api/v1/orders/${o.id}/confirm-preparation`).expect(200);
  return o;
}
const stock = async () => (await keeper.get(`/api/v1/products/${product}`)).body.stock;

beforeAll(async () => {
  w = await newWholesaler(ownerDb, app);
  keeper = (await employee('stock_manager')).c;
  manager = (await employee('delivery_manager')).c;
  const d = await employee('delivery');
  driver = d.c;
  driverId = d.userId;
  driver2 = (await employee('delivery')).c;
  const c = await w.owner.post('/api/v1/customers', { businessName: 'Pharmacy', contactPerson: 'X', phone: uniquePhone(), address: 'Street 1' });
  pharmacy = await firstLogin(app, w.loginCode, c.body.firstLogin.phone, c.body.firstLogin.temporaryPassword);
  const brandId = (await keeper.post('/api/v1/brands', { nameAr: 'ب', nameEn: 'B' })).body.id;
  const categoryId = (await keeper.post('/api/v1/categories', { nameAr: 'ف', nameEn: 'C' })).body.id;
  product = (
    await keeper.post('/api/v1/products', {
      productType: 'cosmetic', brandId, categoryId, unit: 'box', packSize: '1', costPrice: '7.00', sellingPrice: '10.00', cosmetic: {}, nameAr: 'م', nameEn: 'Item', trackBatches: true,
    })
  ).body.id;
  await keeper.post('/api/v1/stock/adjustments', { productId: product, newBatch: { batchNumber: 'B1', expiryDate: '2030-01-31' }, countedQuantity: 100, reason: 'Opening' }).expect(201);
  await w.owner.post('/api/v1/offers', { offerType: 'bonus', productId: product, buyQuantity: 10, freeQuantity: 1 }).expect(201);
});

describe('trips (C-20, C-25, C-28)', () => {
  it('the delivery manager builds a trip; stock leaves when it starts', async () => {
    const a = await readyOrder(10); // 10 + 1 free = 11 units, total 100.00
    const b = await readyOrder(5);
    const ready = (await manager.get('/api/v1/ready-orders').expect(200)).body.items;
    expect(ready).toHaveLength(2);
    await driver.post('/api/v1/trips', { deliveryPersonId: driverId, orderIds: [a.id] }).expect(403);
    const trip = (await manager.post('/api/v1/trips', { deliveryPersonId: driverId, orderIds: [a.id, b.id] }).expect(201)).body;
    expect(trip.stops.map((s: { position: number }) => s.position)).toEqual([1, 2]);
    // An order cannot be in two trips
    await manager.post('/api/v1/trips', { deliveryPersonId: driverId, orderIds: [a.id] }).expect(409);
    // Another delivery person cannot see or start it
    await driver2.get(`/api/v1/trips/${trip.id}`).expect(404);
    await driver2.post(`/api/v1/trips/${trip.id}/start`).expect(404);
    expect((await driver.get('/api/v1/my/trips')).body.items).toHaveLength(1);

    expect(await stock()).toMatchObject({ onHand: 100, reserved: 16 });
    const started = (await driver.post(`/api/v1/trips/${trip.id}/start`).expect(200)).body;
    expect(started.status).toBe('in_progress');
    expect(await stock()).toMatchObject({ onHand: 84, reserved: 0 });
    // A trip cannot change after it starts
    await manager.patch(`/api/v1/trips/${trip.id}`, { orderIds: [a.id] }).expect(409);
    await driver.post(`/api/v1/trips/${trip.id}/start`).expect(409);

    // C-81: the delivery person changes the order of stops
    const reordered = (await driver.patch(`/api/v1/trips/${trip.id}/stop-order`, { stopIds: [started.stops[1].id, started.stops[0].id] }).expect(200)).body;
    expect(reordered.stops[0].orderId).toBe(b.id);

    const stopA = started.stops.find((s: { orderId: string }) => s.orderId === a.id);
    const stopB = started.stops.find((s: { orderId: string }) => s.orderId === b.id);

    // Delivered with 2 units refused at the door (C-47): the credit is 100.00 / 11 units each (C-63)
    await driver.post(`/api/v1/trip-stops/${stopA.id}/deliver`, { refused: [{ orderLineId: (await keeper.get(`/api/v1/orders/${a.id}`)).body.lines[0].id, quantity: 2 }] }).expect(400);
    const lineId = (await keeper.get(`/api/v1/orders/${a.id}`)).body.lines[0].id;
    const afterA = (await driver.post(`/api/v1/trip-stops/${stopA.id}/deliver`, { refused: [{ orderLineId: lineId, quantity: 2 }], refusedReason: 'Box damaged' }).expect(200)).body;
    const sA = afterA.stops.find((s: { id: string }) => s.id === stopA.id);
    expect(sA).toMatchObject({ result: 'delivered', refusedCredit: '18.18', toCollect: '81.82' });
    // Tapping twice has no extra effect
    await driver.post(`/api/v1/trip-stops/${stopA.id}/deliver`, {}).expect(200);

    // Payment at the door waits for the accountant (C-27)
    await driver.post(`/api/v1/trip-stops/${stopA.id}/payments`, { method: 'cash', amount: '100.00' }).expect(409);
    await driver.post(`/api/v1/trip-stops/${stopA.id}/payments`, { method: 'instapay', amount: '10.00' }).expect(400);
    const send = () =>
      driver.agent
        .post(`/api/v1/trip-stops/${stopA.id}/payments`)
        .set('Origin', 'http://localhost:3000')
        .set('Idempotency-Key', 'pay-abcdef-123')
        .send({ method: 'cash', amount: '81.82' });
    await send().expect(201);
    const again = (await send().expect(201)).body;
    expect(again.stops.find((s: { id: string }) => s.id === stopA.id)).toMatchObject({ toCollect: '0.00' });
    expect(again.stops.find((s: { id: string }) => s.id === stopA.id).payments).toHaveLength(1);

    // Failed delivery needs a reason (C-21)
    await driver.post(`/api/v1/trip-stops/${stopB.id}/fail`, { reason: 'other' }).expect(400);
    const finished = (await driver.post(`/api/v1/trip-stops/${stopB.id}/fail`, { reason: 'not_available' }).expect(200)).body;
    expect(finished).toMatchObject({ status: 'finished', cashExpected: '81.82' });

    // The goods come back and the order is ready for another trip (C-61)
    const toReturn = (await keeper.get('/api/v1/trip-stops/goods-to-return')).body.items;
    expect(toReturn).toHaveLength(1);
    await keeper.post(`/api/v1/trip-stops/${stopB.id}/goods-back`).expect(200);
    expect((await keeper.get(`/api/v1/orders/${b.id}`)).body.status).toBe('ready');
    expect(await stock()).toMatchObject({ onHand: 89, reserved: 5 });
    expect((await manager.get('/api/v1/ready-orders')).body.items.map((o: { id: string }) => o.id)).toEqual([b.id]);

    // Signed paper (C-44)
    const missing = (await manager.get('/api/v1/trip-stops/missing-papers')).body.items;
    expect(missing).toHaveLength(1);
    await manager.post(`/api/v1/trip-stops/${stopA.id}/paper-received`).expect(200);
    expect((await manager.get('/api/v1/trip-stops/missing-papers')).body.items).toHaveLength(0);

    // The customer sees the order as delivered
    expect((await pharmacy.get(`/api/v1/orders/${a.id}`)).body.status).toBe('delivered');
  });

  it('refusing everything must be a failed delivery; a cancelled order leaves a planned trip', async () => {
    const o = await readyOrder(2);
    const other = await readyOrder(1);
    const trip = (await manager.post('/api/v1/trips', { deliveryPersonId: driverId, orderIds: [o.id, other.id] }).expect(201)).body;
    await keeper.post(`/api/v1/orders/${other.id}/cancel`, { reason: 'Customer asked' }).expect(200);
    const t2 = (await manager.get(`/api/v1/trips/${trip.id}`)).body;
    expect(t2.stops).toHaveLength(1);
    const started = (await driver.post(`/api/v1/trips/${trip.id}/start`).expect(200)).body;
    const lineId = (await keeper.get(`/api/v1/orders/${o.id}`)).body.lines[0].id;
    await driver.post(`/api/v1/trip-stops/${started.stops[0].id}/deliver`, { refused: [{ orderLineId: lineId, quantity: 2 }], refusedReason: 'No' }).expect(409);
  });
});
