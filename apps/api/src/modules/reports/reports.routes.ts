import { Router } from 'express';
import { sql } from 'kysely';
import { fromPiasters, toPiasters } from '@cosmo/shared';
import { requireOwner, requireRoles } from '../../core/permissions';
import { auth } from '../../core/context';
import { withTenant, type Trx } from '../../core/db';
import { pageOf } from '../../core/http';
import { todayIn } from '../stock/stock.service';
import { supplierBalances } from '../suppliers/suppliers.service';

async function n(trx: Trx, build: (t: Trx) => { executeTakeFirst: () => Promise<{ n: string | number | bigint } | undefined> }) {
  return Number((await build(trx).executeTakeFirst())?.n ?? 0);
}

const dateParam = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export function reportRoutes(): Router {
  const r = Router();

  // OWN-09: what needs attention today. Each role gets the numbers of its work.
  r.get('/dashboard', requireRoles('sales', 'stock_manager', 'delivery_manager', 'accountant', 'delivery'), async (req, res) => {
    const ctx = auth(req);
    const has = (...roles: string[]) => ctx.roles.includes('owner') || ctx.roles.some((x) => roles.includes(x));
    const out = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const w = await trx.selectFrom('wholesalers').select('time_zone').where('id', '=', ctx.wholesalerId).executeTakeFirstOrThrow();
      const today = todayIn(w.time_zone);
      const s = await trx.selectFrom('settings').select('near_expiry_months').executeTakeFirstOrThrow();
      const near = new Date(today + 'T00:00:00Z');
      near.setUTCMonth(near.getUTCMonth() + s.near_expiry_months);
      const nearDate = near.toISOString().slice(0, 10);
      const orders = (status: string) => n(trx, (t) => t.selectFrom('orders').select((eb) => eb.fn.countAll<string>().as('n')).where('status', '=', status as never));
      const d: Record<string, unknown> = {};

      if (has('stock_manager', 'sales')) {
        d.ordersToAccept = await orders('placed');
        d.ordersWaitingCustomer = await orders('waiting_for_customer');
        d.ordersWaitingLong = await n(trx, (t) => t.selectFrom('orders').select((eb) => eb.fn.countAll<string>().as('n')).where('status', 'in', ['placed', 'waiting_for_customer']).where('reported_to_owner', '=', true));
      }
      if (has('stock_manager')) {
        d.ordersToPrepare = await n(trx, (t) => t.selectFrom('orders').select((eb) => eb.fn.countAll<string>().as('n')).where('status', 'in', ['accepted', 'preparing']));
        d.goodsToReturn = await n(trx, (t) => t.selectFrom('trip_stops').select((eb) => eb.fn.countAll<string>().as('n')).where('result', '=', 'failed').where('goods_back_confirmed', '=', false));
        d.returnsToCheck = await n(trx, (t) => t.selectFrom('customer_returns').select((eb) => eb.fn.countAll<string>().as('n')).where('status', '=', 'requested'));
        d.outOfStock = await n(trx, (t) =>
          t.selectFrom('products as p').innerJoin('product_stock as s', 's.product_id', 'p.id').select((eb) => eb.fn.countAll<string>().as('n')).where('p.is_active', '=', true).whereRef('s.on_hand_sellable', '<=', 's.reserved'),
        );
        d.nearExpiry = await n(trx, (t) => t.selectFrom('batches').select((eb) => eb.fn.countAll<string>().as('n')).where('qty_sellable', '>', 0).where('expiry_date', '>=', today).where('expiry_date', '<=', nearDate));
        d.expired = await n(trx, (t) => t.selectFrom('batches').select((eb) => eb.fn.countAll<string>().as('n')).where('qty_expired', '>', 0));
      }
      if (has('delivery_manager')) {
        d.ordersReady = await n(trx, (t) =>
          t
            .selectFrom('orders as o')
            .select((eb) => eb.fn.countAll<string>().as('n'))
            .where('o.status', '=', 'ready')
            .where((eb) => eb.not(eb.exists(eb.selectFrom('trip_stops as s').select('s.id').whereRef('s.order_id', '=', 'o.id').where('s.trip_active', '=', true)))),
        );
        d.tripsInProgress = await n(trx, (t) => t.selectFrom('trips').select((eb) => eb.fn.countAll<string>().as('n')).where('status', '=', 'in_progress'));
        d.failedDeliveries = await n(trx, (t) => t.selectFrom('trip_stops').select((eb) => eb.fn.countAll<string>().as('n')).where('result', '=', 'failed').where('goods_back_confirmed', '=', false));
        d.missingPapers = await n(trx, (t) => t.selectFrom('trip_stops').select((eb) => eb.fn.countAll<string>().as('n')).where('result', '=', 'delivered').where('signed_paper_received', '=', false));
      }
      if (has('accountant')) {
        d.paymentsWaiting = await n(trx, (t) => t.selectFrom('payments').select((eb) => eb.fn.countAll<string>().as('n')).where('status', '=', 'waiting'));
        const inv = await trx.selectFrom('invoices').select(['total', 'confirmed_paid', 'return_credit', 'due_date', 'payment_choice']).where('status', 'in', ['unpaid', 'partially_paid']).execute();
        let unpaid = 0;
        let overdue = 0;
        let overdueCount = 0;
        for (const i of inv) {
          const left = toPiasters(i.total) - toPiasters(i.confirmed_paid) - toPiasters(i.return_credit);
          unpaid += left;
          if (i.payment_choice === 'credit' && i.due_date < today && left > 0) {
            overdue += left;
            overdueCount++;
          }
        }
        d.unpaidTotal = fromPiasters(unpaid);
        d.overdueTotal = fromPiasters(overdue);
        d.overdueInvoices = overdueCount;
        const balances = await supplierBalances(trx);
        d.owedToSuppliers = fromPiasters([...balances.values()].reduce((sum, b) => sum + toPiasters(b.balance), 0));
        d.tripsToClose = await n(trx, (t) => t.selectFrom('trips').select((eb) => eb.fn.countAll<string>().as('n')).where('status', '=', 'finished'));
        d.leftOverReturns = await n(trx, (t) =>
          t.selectFrom('customer_returns').select((eb) => eb.fn.countAll<string>().as('n')).where('status', '=', 'completed').where('left_over', '>', '0').where('left_over_choice', 'is', null),
        );
      }
      if (ctx.roles.includes('owner')) {
        d.supplierReturnsWaiting = await n(trx, (t) => t.selectFrom('supplier_returns').select((eb) => eb.fn.countAll<string>().as('n')).where('status', '=', 'waiting_for_owner'));
      }
      if (has('sales')) {
        d.passwordRequests = await n(trx, (t) => t.selectFrom('password_reset_requests').select((eb) => eb.fn.countAll<string>().as('n')).where('status', '=', 'waiting'));
      }
      if (ctx.roles.includes('delivery')) {
        d.myTrips = await n(trx, (t) => t.selectFrom('trips').select((eb) => eb.fn.countAll<string>().as('n')).where('delivery_person_id', '=', ctx.userId).where('status', 'in', ['planned', 'in_progress']));
      }
      return d;
    });
    res.json(out);
  });

  // OWN-10: who did what and when (C-30)
  r.get('/activity', requireOwner, async (req, res) => {
    const ctx = auth(req);
    const { page, limit, offset } = pageOf(req);
    const rows = await withTenant(res.locals.db, ctx.wholesalerId, (trx) => {
      let q = trx
        .selectFrom('activity_log as a')
        .leftJoin('employees as e', 'e.user_id', 'a.user_id')
        .leftJoin('customers as c', 'c.user_id', 'a.user_id')
        .select(['a.id', 'a.action', 'a.entity_type', 'a.entity_id', 'a.reason', 'a.details', 'a.is_important', 'a.created_at', 'a.user_id', 'e.name as employee_name', 'c.business_name']);
      if (typeof req.query.userId === 'string' && /^[0-9a-f-]{36}$/i.test(req.query.userId)) q = q.where('a.user_id', '=', req.query.userId);
      if (typeof req.query.type === 'string' && /^[a-z_]{1,40}$/.test(req.query.type)) q = q.where('a.entity_type', '=', req.query.type);
      if (req.query.important === '1') q = q.where('a.is_important', '=', true);
      const from = dateParam(req.query.from);
      const to = dateParam(req.query.to);
      if (from) q = q.where(sql`a.created_at::date`, '>=', from);
      if (to) q = q.where(sql`a.created_at::date`, '<=', to);
      return q.orderBy('a.created_at', 'desc').limit(limit).offset(offset).execute();
    });
    res.json({
      items: rows.map((a) => ({
        id: a.id,
        action: a.action,
        entityType: a.entity_type,
        entityId: a.entity_id,
        reason: a.reason,
        details: a.details,
        important: a.is_important,
        at: a.created_at,
        userId: a.user_id,
        by: a.employee_name ?? a.business_name ?? null,
      })),
      page,
      limit,
    });
  });

  // OWN-12: sales by period, product, or customer, from invoices
  r.get('/reports/sales', requireOwner, async (req, res) => {
    const ctx = auth(req);
    const by = req.query.by === 'product' || req.query.by === 'customer' ? req.query.by : 'day';
    const out = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const today = todayIn((await trx.selectFrom('wholesalers').select('time_zone').where('id', '=', ctx.wholesalerId).executeTakeFirstOrThrow()).time_zone);
      const from = dateParam(req.query.from) ?? today.slice(0, 8) + '01';
      const to = dateParam(req.query.to) ?? today;
      let rows: Array<{ key: string; label: string; labelEn?: string; amount: string; quantity?: number; invoices?: number }>;
      if (by === 'product') {
        const r1 = await trx
          .selectFrom('invoice_lines as l')
          .innerJoin('invoices as i', 'i.id', 'l.invoice_id')
          .select(['l.product_id', 'l.product_name_ar', 'l.product_name_en', sql<string>`sum(l.line_total)::text`.as('amount'), sql<string>`sum(l.quantity)::text`.as('qty')])
          .where('i.status', '<>', 'cancelled')
          .where('l.is_bonus', '=', false)
          .where('i.invoice_date', '>=', from)
          .where('i.invoice_date', '<=', to)
          .groupBy(['l.product_id', 'l.product_name_ar', 'l.product_name_en'])
          .orderBy(sql`sum(l.line_total)`, 'desc')
          .limit(200)
          .execute();
        rows = r1.map((x) => ({ key: x.product_id, label: x.product_name_ar, labelEn: x.product_name_en, amount: fromPiasters(toPiasters(x.amount)), quantity: Number(x.qty) }));
      } else if (by === 'customer') {
        const r1 = await trx
          .selectFrom('invoices as i')
          .innerJoin('customers as c', 'c.id', 'i.customer_id')
          .select(['c.id', 'c.business_name', sql<string>`sum(i.total)::text`.as('amount'), sql<string>`count(*)::text`.as('invoices')])
          .where('i.status', '<>', 'cancelled')
          .where('i.invoice_date', '>=', from)
          .where('i.invoice_date', '<=', to)
          .groupBy(['c.id', 'c.business_name'])
          .orderBy(sql`sum(i.total)`, 'desc')
          .limit(200)
          .execute();
        rows = r1.map((x) => ({ key: x.id, label: x.business_name, amount: fromPiasters(toPiasters(x.amount)), invoices: Number(x.invoices) }));
      } else {
        const r1 = await trx
          .selectFrom('invoices')
          .select(['invoice_date', sql<string>`sum(total)::text`.as('amount'), sql<string>`count(*)::text`.as('invoices')])
          .where('status', '<>', 'cancelled')
          .where('invoice_date', '>=', from)
          .where('invoice_date', '<=', to)
          .groupBy('invoice_date')
          .orderBy('invoice_date')
          .execute();
        rows = r1.map((x) => ({ key: x.invoice_date, label: x.invoice_date, amount: fromPiasters(toPiasters(x.amount)), invoices: Number(x.invoices) }));
      }
      const returns = await trx
        .selectFrom('customer_returns')
        .select(sql<string>`coalesce(sum(credit_amount), 0)::text`.as('n'))
        .where('status', '=', 'completed')
        .where(sql`completed_at::date`, '>=', from)
        .where(sql`completed_at::date`, '<=', to)
        .executeTakeFirst();
      const total = rows.reduce((s, x) => s + toPiasters(x.amount), 0);
      return { by, from, to, rows, total: fromPiasters(total), returns: fromPiasters(toPiasters(returns?.n ?? '0')), net: fromPiasters(total - toPiasters(returns?.n ?? '0')) };
    });
    res.json(out);
  });

  // OWN-12: what the sellable stock is worth at cost
  r.get('/reports/stock-value', requireRoles('stock_manager'), async (req, res) => {
    const ctx = auth(req);
    const rows = await withTenant(res.locals.db, ctx.wholesalerId, (trx) =>
      trx
        .selectFrom('products as p')
        .innerJoin('product_stock as s', 's.product_id', 'p.id')
        .select(['p.id', 'p.name_ar', 'p.name_en', 'p.cost_price', 'p.selling_price', 's.on_hand_sellable'])
        .where('s.on_hand_sellable', '>', 0)
        .orderBy(sql`p.cost_price * s.on_hand_sellable`, 'desc')
        .execute(),
    );
    let cost = 0;
    let selling = 0;
    const items = rows.map((p) => {
      const c = toPiasters(p.cost_price) * p.on_hand_sellable;
      const s = toPiasters(p.selling_price) * p.on_hand_sellable;
      cost += c;
      selling += s;
      return { id: p.id, nameAr: p.name_ar, nameEn: p.name_en, quantity: p.on_hand_sellable, costValue: fromPiasters(c), sellingValue: fromPiasters(s) };
    });
    res.json({ items, costValue: fromPiasters(cost), sellingValue: fromPiasters(selling) });
  });

  return r;
}
