import { Router } from 'express';
import { deliverSchema, doorPaymentSchema, failSchema, stopOrderSchema, tripSchema, updateTripSchema } from '@cosmo/shared';
import { validate } from '../../core/validation';
import { requireRoles } from '../../core/permissions';
import { auth } from '../../core/context';
import { withTenant } from '../../core/db';
import { errors } from '../../core/errors';
import { param } from '../../core/http';
import {
  confirmGoodsBack,
  createTrip,
  deleteTrip,
  deliverStop,
  deliveryPeople,
  failStop,
  loadTrip,
  paperReceived,
  recordDoorPayment,
  reorderStops,
  startTrip,
  updateTrip,
} from './delivery.service';


export function deliveryRoutes(): Router {
  const r = Router();
  const managers = requireRoles('delivery_manager');
  const drivers = requireRoles('delivery');

  r.get('/delivery-people', managers, async (req, res) => {
    const ctx = auth(req);
    res.json({ items: await withTenant(res.locals.db, ctx.wholesalerId, (trx) => deliveryPeople(trx)) });
  });

  // DM-01: ready orders that are not in a trip yet
  r.get('/ready-orders', managers, async (req, res) => {
    const ctx = auth(req);
    const rows = await withTenant(res.locals.db, ctx.wholesalerId, (trx) =>
      trx
        .selectFrom('orders as o')
        .innerJoin('customers as c', 'c.id', 'o.customer_id')
        .select(['o.id', 'o.order_number', 'o.total', 'o.payment_choice', 'o.updated_at', 'c.business_name', 'c.address', 'c.area', 'c.phone'])
        .where('o.status', '=', 'ready')
        .where((eb) => eb.not(eb.exists(eb.selectFrom('trip_stops as s').select('s.id').whereRef('s.order_id', '=', 'o.id').where('s.trip_active', '=', true))))
        .orderBy('o.updated_at')
        .execute(),
    );
    res.json({
      items: rows.map((o) => ({
        id: o.id,
        orderNumber: o.order_number,
        total: o.total,
        paymentChoice: o.payment_choice,
        readySince: o.updated_at,
        customer: { businessName: o.business_name, address: o.address, area: o.area, phone: o.phone },
      })),
    });
  });

  r.get('/trips', requireRoles('delivery_manager', 'accountant'), async (req, res) => {
    const ctx = auth(req);
    const rows = await withTenant(res.locals.db, ctx.wholesalerId, (trx) =>
      trx
        .selectFrom('trips as t')
        .leftJoin('employees as e', 'e.user_id', 't.delivery_person_id')
        .select(['t.id', 't.trip_number', 't.status', 't.created_at', 't.started_at', 'e.name'])
        .select((eb) => eb.selectFrom('trip_stops as s').whereRef('s.trip_id', '=', 't.id').select((e) => e.fn.countAll<string>().as('n')).as('stops'))
        .select((eb) =>
          eb.selectFrom('trip_stops as s').whereRef('s.trip_id', '=', 't.id').where('s.result', '!=', 'waiting').select((e) => e.fn.countAll<string>().as('n')).as('done'),
        )
        .orderBy('t.created_at', 'desc')
        .limit(100)
        .execute(),
    );
    res.json({ items: rows.map((t) => ({ id: t.id, tripNumber: t.trip_number, status: t.status, deliveryPerson: t.name, createdAt: t.created_at, stops: Number(t.stops ?? 0), done: Number(t.done ?? 0) })) });
  });

  // DEL-01: only my own trips
  r.get('/my/trips', drivers, async (req, res) => {
    const ctx = auth(req);
    const rows = await withTenant(res.locals.db, ctx.wholesalerId, (trx) =>
      trx
        .selectFrom('trips as t')
        .select(['t.id', 't.trip_number', 't.status', 't.created_at'])
        .select((eb) => eb.selectFrom('trip_stops as s').whereRef('s.trip_id', '=', 't.id').select((e) => e.fn.countAll<string>().as('n')).as('stops'))
        .where('t.delivery_person_id', '=', ctx.userId)
        .where('t.status', 'in', ['planned', 'in_progress', 'finished'])
        .orderBy('t.created_at', 'desc')
        .execute(),
    );
    res.json({ items: rows.map((t) => ({ id: t.id, tripNumber: t.trip_number, status: t.status, createdAt: t.created_at, stops: Number(t.stops ?? 0) })) });
  });

  r.get('/trips/:id', requireRoles('delivery_manager', 'accountant', 'delivery'), async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const trip = await withTenant(res.locals.db, ctx.wholesalerId, (trx) => loadTrip(trx, id));
    const manager = ctx.roles.some((x) => x === 'owner' || x === 'delivery_manager' || x === 'accountant');
    if (!manager && trip.deliveryPersonId !== ctx.userId) throw errors.notFound();
    res.json(trip);
  });

  r.post('/trips', managers, async (req, res) => {
    const ctx = auth(req);
    const input = validate(tripSchema, req.body);
    res.status(201).json(await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => loadTrip(trx, await createTrip(trx, ctx, input))));
  });

  r.patch('/trips/:id', managers, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const input = validate(updateTripSchema, req.body);
    res.json(await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      await updateTrip(trx, ctx, id, input);
      return loadTrip(trx, id);
    }));
  });

  r.delete('/trips/:id', managers, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    await withTenant(res.locals.db, ctx.wholesalerId, (trx) => deleteTrip(trx, ctx, id));
    res.json({ ok: true });
  });

  r.post('/trips/:id/start', drivers, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    res.json(await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      await startTrip(trx, ctx, id);
      return loadTrip(trx, id);
    }));
  });

  r.patch('/trips/:id/stop-order', drivers, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const input = validate(stopOrderSchema, req.body);
    res.json(await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      await reorderStops(trx, ctx, id, input.stopIds);
      return loadTrip(trx, id);
    }));
  });

  const tripOfStop = async (trx: Parameters<typeof loadTrip>[0], stopId: string) =>
    (await trx.selectFrom('trip_stops').select('trip_id').where('id', '=', stopId).executeTakeFirstOrThrow()).trip_id;

  r.post('/trip-stops/:id/deliver', drivers, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const input = validate(deliverSchema, req.body);
    res.json(await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      await deliverStop(trx, ctx, id, input);
      return loadTrip(trx, await tripOfStop(trx, id));
    }));
  });

  r.post('/trip-stops/:id/fail', drivers, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const input = validate(failSchema, req.body);
    res.json(await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      await failStop(trx, ctx, id, input);
      return loadTrip(trx, await tripOfStop(trx, id));
    }));
  });

  r.post('/trip-stops/:id/payments', drivers, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const input = validate(doorPaymentSchema, req.body);
    const key = req.header('Idempotency-Key');
    const idempotencyKey = key && /^[A-Za-z0-9_-]{8,100}$/.test(key) ? key : null;
    res.status(201).json(await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      await recordDoorPayment(trx, ctx, id, input, idempotencyKey);
      return loadTrip(trx, await tripOfStop(trx, id));
    }));
  });

  r.post('/trip-stops/:id/goods-back', requireRoles('stock_manager'), async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    await withTenant(res.locals.db, ctx.wholesalerId, (trx) => confirmGoodsBack(trx, ctx, id));
    res.json({ ok: true });
  });

  r.post('/trip-stops/:id/paper-received', managers, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    await withTenant(res.locals.db, ctx.wholesalerId, (trx) => paperReceived(trx, ctx, id));
    res.json({ ok: true });
  });

  // DM-06: delivered orders whose signed paper has not come back (C-44)
  r.get('/trip-stops/missing-papers', managers, async (req, res) => {
    const ctx = auth(req);
    const rows = await withTenant(res.locals.db, ctx.wholesalerId, (trx) =>
      trx
        .selectFrom('trip_stops as s')
        .innerJoin('trips as t', 't.id', 's.trip_id')
        .innerJoin('orders as o', 'o.id', 's.order_id')
        .innerJoin('customers as c', 'c.id', 'o.customer_id')
        .leftJoin('employees as e', 'e.user_id', 't.delivery_person_id')
        .select(['s.id', 's.result_at', 'o.order_number', 'c.business_name', 't.trip_number', 'e.name'])
        .where('s.result', '=', 'delivered')
        .where('s.signed_paper_received', '=', false)
        .orderBy('s.result_at')
        .execute(),
    );
    res.json({ items: rows.map((s) => ({ stopId: s.id, deliveredAt: s.result_at, orderNumber: s.order_number, customerName: s.business_name, tripNumber: s.trip_number, deliveryPerson: s.name })) });
  });

  // STK-12: failed stops whose goods must be confirmed back
  r.get('/trip-stops/goods-to-return', requireRoles('stock_manager', 'delivery_manager'), async (req, res) => {
    const ctx = auth(req);
    const rows = await withTenant(res.locals.db, ctx.wholesalerId, (trx) =>
      trx
        .selectFrom('trip_stops as s')
        .innerJoin('orders as o', 'o.id', 's.order_id')
        .innerJoin('customers as c', 'c.id', 'o.customer_id')
        .select(['s.id', 's.failure_reason', 's.failure_note', 's.result_at', 'o.id as order_id', 'o.order_number', 'c.business_name'])
        .where('s.result', '=', 'failed')
        .where('s.goods_back_confirmed', '=', false)
        .orderBy('s.result_at')
        .execute(),
    );
    res.json({ items: rows.map((s) => ({ stopId: s.id, orderId: s.order_id, orderNumber: s.order_number, customerName: s.business_name, reason: s.failure_reason, note: s.failure_note, at: s.result_at })) });
  });

  return r;
}
