import { Router } from 'express';
import { acceptSchema, answerSchema, cancelSchema, cartSchema, ORDER_STATUSES, rejectSchema } from '@cosmo/shared';
import { validate } from '../../core/validation';
import { requireCustomer, requireLogin, requireRoles } from '../../core/permissions';
import { auth } from '../../core/context';
import { withTenant } from '../../core/db';
import { errors } from '../../core/errors';
import { pageOf, param } from '../../core/http';
import { acceptOrder, answerChange, cancelOrder, loadOrder, placeOrder, priceCart, rejectOrder } from './orders.service';

export function orderRoutes(): Router {
  const r = Router();
  const orderReaders = requireRoles('sales', 'stock_manager', 'delivery_manager', 'accountant');

  // The customer, or a sales employee for a customer (C-32)
  function requirePlacer(...args: Parameters<typeof requireLogin>) {
    const [req] = args;
    if (req.auth?.userType === 'customer') return requireCustomer(...args);
    return requireRoles('sales')(...args);
  }

  r.post('/orders/preview', requirePlacer, async (req, res) => {
    const ctx = auth(req);
    const input = validate(cartSchema, req.body);
    const out = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const p = await priceCart(trx, ctx, input);
      return {
        lines: p.lines,
        subtotal: p.subtotal,
        discountTotal: p.discountTotal,
        total: p.total,
        minimumOrderValue: p.minimumOrderValue,
        belowMinimum: p.belowMinimum,
        shortages: p.shortages,
        creditAllowed: p.customer.credit_allowed,
        creditDays: p.customer.credit_days,
      };
    });
    res.json(out);
  });

  r.post('/orders', requirePlacer, async (req, res) => {
    const ctx = auth(req);
    const input = validate(cartSchema, req.body);
    const key = req.header('Idempotency-Key');
    const idempotencyKey = key && /^[A-Za-z0-9_-]{8,100}$/.test(key) ? key : null;
    try {
      const out = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => loadOrder(trx, await placeOrder(trx, ctx, input, idempotencyKey), ctx));
      res.status(201).json(out);
    } catch (e) {
      // Two identical requests at the same moment: the second one waits, then finds the first order
      if (idempotencyKey && e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === '23505') {
        const out = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
          const o = await trx.selectFrom('orders').select('id').where('idempotency_key', '=', idempotencyKey).executeTakeFirstOrThrow();
          return loadOrder(trx, o.id, ctx);
        });
        res.status(201).json(out);
        return;
      }
      throw e;
    }
  });

  r.get('/orders', requireLogin, async (req, res) => {
    const ctx = auth(req);
    if (ctx.userType === 'employee' && !ctx.roles.some((x) => ['owner', 'sales', 'stock_manager', 'delivery_manager', 'accountant'].includes(x))) {
      throw errors.notAllowed();
    }
    const { page, limit, offset } = pageOf(req);
    const statuses = typeof req.query.status === 'string' ? req.query.status.split(',').filter((s) => (ORDER_STATUSES as readonly string[]).includes(s)) : [];
    const customerId = typeof req.query.customerId === 'string' && /^[0-9a-f-]{36}$/i.test(req.query.customerId) ? req.query.customerId : null;
    const result = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      let q = trx.selectFrom('orders as o').innerJoin('customers as c', 'c.id', 'o.customer_id');
      if (ctx.userType === 'customer') q = q.where('o.customer_id', '=', ctx.customerId!);
      else if (customerId) q = q.where('o.customer_id', '=', customerId);
      if (statuses.length) q = q.where('o.status', 'in', statuses as never[]);
      const oldestFirst = req.query.sort === 'oldest';
      const items = await q
        .select(['o.id', 'o.order_number', 'o.status', 'o.total', 'o.payment_choice', 'o.placed_at', 'o.placed_while_closed', 'o.waiting_since', 'o.reported_to_owner', 'c.business_name'])
        .select((eb) => eb.selectFrom('order_lines as l').whereRef('l.order_id', '=', 'o.id').where('l.current_qty', '>', 0).select((e) => e.fn.countAll<string>().as('n')).as('lines'))
        .orderBy('o.placed_at', oldestFirst ? 'asc' : 'desc')
        .limit(limit)
        .offset(offset)
        .execute();
      const total = await q.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow();
      return { items, total: Number(total.n) };
    });
    res.json({
      items: result.items.map((o) => ({
        id: o.id,
        orderNumber: o.order_number,
        status: o.status,
        total: o.total,
        paymentChoice: o.payment_choice,
        placedAt: o.placed_at,
        placedWhileClosed: o.placed_while_closed,
        customerName: o.business_name,
        lines: Number(o.lines ?? 0),
        ...(ctx.userType === 'employee' && { waitingSince: o.waiting_since, reportedToOwner: o.reported_to_owner }),
      })),
      page,
      limit,
      total: result.total,
    });
  });

  r.get('/orders/:id', requireLogin, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    if (ctx.userType === 'employee' && ctx.roles.length === 1 && ctx.roles[0] === 'delivery') throw errors.notAllowed();
    res.json(await withTenant(res.locals.db, ctx.wholesalerId, (trx) => loadOrder(trx, id, ctx)));
  });

  // C-24, C-38, C-39
  r.post('/orders/:id/accept', requireRoles('stock_manager'), async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const input = validate(acceptSchema, req.body);
    const out = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      await acceptOrder(trx, ctx, id, input.changes);
      return loadOrder(trx, id, ctx);
    });
    res.json(out);
  });

  r.post('/orders/:id/reject', requireRoles('stock_manager'), async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const input = validate(rejectSchema, req.body);
    const out = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      await rejectOrder(trx, ctx, id, input.reason);
      return loadOrder(trx, id, ctx);
    });
    res.json(out);
  });

  r.post('/orders/:id/answer', requireCustomer, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const input = validate(answerSchema, req.body);
    const out = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      await answerChange(trx, ctx, id, input.answer);
      return loadOrder(trx, id, ctx);
    });
    res.json(out);
  });

  // The customer, the stock manager, or the owner (C-57). Sales cannot cancel (C-64).
  r.post('/orders/:id/cancel', requireLogin, async (req, res) => {
    const ctx = auth(req);
    if (ctx.userType === 'employee' && !ctx.roles.some((x) => x === 'owner' || x === 'stock_manager')) throw errors.notAllowed();
    const id = param(req, 'id');
    const input = validate(cancelSchema, req.body);
    const out = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      await cancelOrder(trx, ctx, id, input.reason ?? null);
      return loadOrder(trx, id, ctx);
    });
    res.json(out);
  });

  return r;
}
