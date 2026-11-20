import { Router } from 'express';
import { cashHandoverSchema, officePaymentSchema, reasonSchema } from '@cosmo/shared';
import { validate } from '../../core/validation';
import { requireCustomer, requireLogin, requireRoles } from '../../core/permissions';
import { auth, actorOf } from '../../core/context';
import { withTenant, type Trx } from '../../core/db';
import { errors } from '../../core/errors';
import { pageOf, param } from '../../core/http';
import type { AuthContext } from '../../core/context';
import { todayIn } from '../stock/stock.service';
import { balances, cancelPayment, cashHandover, decidePayment, recordOfficePayment, statement } from './billing.service';

async function today(trx: Trx, wholesalerId: string) {
  const w = await trx.selectFrom('wholesalers').select('time_zone').where('id', '=', wholesalerId).executeTakeFirstOrThrow();
  return todayIn(w.time_zone);
}

async function loadInvoice(trx: Trx, ctx: AuthContext, id: string) {
  const inv = await trx
    .selectFrom('invoices as i')
    .innerJoin('customers as c', 'c.id', 'i.customer_id')
    .innerJoin('orders as o', 'o.id', 'i.order_id')
    .innerJoin('wholesalers as w', 'w.id', 'i.wholesaler_id')
    .selectAll('i')
    .select(['c.business_name', 'c.address', 'c.phone', 'o.order_number', 'w.name as wholesaler_name', 'w.phone as wholesaler_phone', 'w.address as wholesaler_address'])
    .where('i.id', '=', id)
    .executeTakeFirst();
  if (!inv) throw errors.notFound();
  if (ctx.userType === 'customer' && inv.customer_id !== ctx.customerId) throw errors.notFound();
  const lines = await trx.selectFrom('invoice_lines').selectAll().where('invoice_id', '=', id).orderBy('line_order').execute();
  const payments = await trx
    .selectFrom('payments')
    .select(['id', 'amount', 'method', 'reference', 'paid_on', 'status', 'rejection_reason', 'cancel_reason'])
    .where('invoice_id', '=', id)
    .orderBy('created_at')
    .execute();
  const returns = await trx.selectFrom('customer_returns').select(['id', 'return_number', 'applied_to_invoice', 'source', 'status']).where('invoice_id', '=', id).execute();
  const t = await today(trx, ctx.wholesalerId);
  const left = (Number(inv.total) * 100 - Number(inv.confirmed_paid) * 100 - Number(inv.return_credit) * 100) / 100;
  return {
    id: inv.id,
    invoiceNumber: inv.invoice_number,
    orderId: inv.order_id,
    orderNumber: inv.order_number,
    status: inv.status,
    invoiceDate: inv.invoice_date,
    dueDate: inv.due_date,
    paymentChoice: inv.payment_choice,
    overdue: inv.payment_choice === 'credit' && inv.due_date < t && left > 0 && inv.status !== 'cancelled',
    wholesaler: { name: inv.wholesaler_name, phone: inv.wholesaler_phone, address: inv.wholesaler_address },
    customer: { id: inv.customer_id, businessName: inv.business_name, address: inv.address, phone: inv.phone },
    subtotal: inv.subtotal,
    discountTotal: inv.discount_total,
    total: inv.total,
    confirmedPaid: inv.confirmed_paid,
    returnCredit: inv.return_credit,
    remaining: left.toFixed(2),
    lines: lines.map((l) => ({ id: l.id, product: { nameAr: l.product_name_ar, nameEn: l.product_name_en }, quantity: l.quantity, isBonus: l.is_bonus, unitPrice: l.unit_price, discountPercent: l.discount_percent, lineTotal: l.line_total })),
    payments: payments.map((p) => ({ id: p.id, amount: p.amount, method: p.method, reference: p.reference, paidOn: p.paid_on, status: p.status, rejectionReason: p.rejection_reason, cancelReason: p.cancel_reason })),
    returns: returns.map((r) => ({ id: r.id, number: r.return_number, credit: r.applied_to_invoice, source: r.source, status: r.status })),
  };
}

export function billingRoutes(): Router {
  const r = Router();
  const money = requireRoles('accountant');

  // ACC-01, ACC-08, CUS-11
  r.get('/invoices', requireLogin, async (req, res) => {
    const ctx = auth(req);
    if (ctx.userType === 'employee' && !ctx.roles.some((x) => ['owner', 'accountant', 'sales'].includes(x))) throw errors.notAllowed();
    const { page, limit, offset } = pageOf(req);
    const out = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const t = await today(trx, ctx.wholesalerId);
      let q = trx.selectFrom('invoices as i').innerJoin('customers as c', 'c.id', 'i.customer_id');
      if (ctx.userType === 'customer') q = q.where('i.customer_id', '=', ctx.customerId!);
      else if (typeof req.query.customerId === 'string' && /^[0-9a-f-]{36}$/i.test(req.query.customerId)) q = q.where('i.customer_id', '=', req.query.customerId);
      if (req.query.status === 'open') q = q.where('i.status', 'in', ['unpaid', 'partially_paid']);
      if (req.query.overdue === '1') q = q.where('i.payment_choice', '=', 'credit').where('i.due_date', '<', t).where('i.status', 'in', ['unpaid', 'partially_paid']);
      const rows = await q
        .select(['i.id', 'i.invoice_number', 'i.invoice_date', 'i.due_date', 'i.total', 'i.confirmed_paid', 'i.return_credit', 'i.status', 'i.payment_choice', 'c.business_name'])
        .orderBy('i.invoice_date', 'desc')
        .orderBy('i.invoice_number', 'desc')
        .limit(limit)
        .offset(offset)
        .execute();
      return rows.map((i) => {
        const left = (Math.round(Number(i.total) * 100) - Math.round(Number(i.confirmed_paid) * 100) - Math.round(Number(i.return_credit) * 100)) / 100;
        return {
          id: i.id,
          invoiceNumber: i.invoice_number,
          invoiceDate: i.invoice_date,
          dueDate: i.due_date,
          total: i.total,
          remaining: left.toFixed(2),
          status: i.status,
          paymentChoice: i.payment_choice,
          customerName: i.business_name,
          overdue: i.payment_choice === 'credit' && i.due_date < t && left > 0 && i.status !== 'cancelled',
          daysLate: i.payment_choice === 'credit' && i.due_date < t && left > 0 ? Math.round((Date.parse(t) - Date.parse(i.due_date)) / 86_400_000) : 0,
        };
      });
    });
    res.json({ items: out, page, limit });
  });

  r.get('/invoices/:id', requireLogin, async (req, res) => {
    const ctx = auth(req);
    if (ctx.userType === 'employee' && !ctx.roles.some((x) => ['owner', 'accountant', 'sales'].includes(x))) throw errors.notAllowed();
    const id = param(req, 'id');
    res.json(await withTenant(res.locals.db, ctx.wholesalerId, (trx) => loadInvoice(trx, ctx, id)));
  });

  // ACC-02: payments waiting for the accountant, with who collected them
  r.get('/payments', requireLogin, async (req, res) => {
    const ctx = auth(req);
    if (ctx.userType === 'employee' && !ctx.roles.some((x) => x === 'owner' || x === 'accountant')) throw errors.notAllowed();
    const rows = await withTenant(res.locals.db, ctx.wholesalerId, (trx) => {
      let q = trx
        .selectFrom('payments as p')
        .innerJoin('customers as c', 'c.id', 'p.customer_id')
        .leftJoin('employees as e', 'e.user_id', 'p.recorded_by')
        .leftJoin('invoices as i', 'i.id', 'p.invoice_id')
        .leftJoin('trip_stops as s', 's.id', 'p.trip_stop_id')
        .leftJoin('trips as t', 't.id', 's.trip_id')
        .select(['p.id', 'p.amount', 'p.method', 'p.reference', 'p.paid_on', 'p.status', 'p.rejection_reason', 'c.business_name', 'e.name', 'i.invoice_number', 't.trip_number', 't.id as trip_id']);
      if (ctx.userType === 'customer') q = q.where('p.customer_id', '=', ctx.customerId!);
      const st = req.query.status;
      if (st === 'waiting' || st === 'confirmed' || st === 'rejected' || st === 'cancelled') q = q.where('p.status', '=', st);
      return q.orderBy('p.created_at', 'desc').limit(200).execute();
    });
    res.json({
      items: rows.map((p) => ({
        id: p.id,
        amount: p.amount,
        method: p.method,
        reference: p.reference,
        paidOn: p.paid_on,
        status: p.status,
        rejectionReason: p.rejection_reason,
        customerName: p.business_name,
        recordedBy: p.name,
        invoiceNumber: p.invoice_number,
        tripNumber: p.trip_number,
        tripId: p.trip_id,
      })),
    });
  });

  r.post('/payments', money, async (req, res) => {
    const ctx = auth(req);
    const input = validate(officePaymentSchema, req.body);
    const id = await withTenant(res.locals.db, ctx.wholesalerId, (trx) => recordOfficePayment(trx, actorOf(ctx), input));
    res.status(201).json({ id });
  });

  r.post('/payments/:id/confirm', money, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    await withTenant(res.locals.db, ctx.wholesalerId, (trx) => decidePayment(trx, actorOf(ctx), id, { confirm: true }));
    res.json({ ok: true });
  });

  r.post('/payments/:id/reject', money, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const input = validate(reasonSchema, req.body);
    await withTenant(res.locals.db, ctx.wholesalerId, (trx) => decidePayment(trx, actorOf(ctx), id, { confirm: false, reason: input.reason }));
    res.json({ ok: true });
  });

  r.post('/payments/:id/cancel', money, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const input = validate(reasonSchema, req.body);
    await withTenant(res.locals.db, ctx.wholesalerId, (trx) => cancelPayment(trx, actorOf(ctx), id, input.reason));
    res.json({ ok: true });
  });

  r.post('/trips/:id/cash-handover', money, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const input = validate(cashHandoverSchema, req.body);
    await withTenant(res.locals.db, ctx.wholesalerId, (trx) => cashHandover(trx, actorOf(ctx), id, input));
    res.json({ ok: true });
  });

  r.get('/customers/:id/statement', requireRoles('sales', 'accountant'), async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    res.json(await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const c = await trx.selectFrom('customers').select(['id', 'business_name']).where('id', '=', id).executeTakeFirst();
      if (!c) throw errors.notFound();
      const b = (await balances(trx, [id], await today(trx, ctx.wholesalerId))).get(id);
      return { customer: { id: c.id, businessName: c.business_name }, overdue: b?.overdue ?? '0.00', ...(await statement(trx, id)) };
    }));
  });

  r.get('/my/statement', requireCustomer, async (req, res) => {
    const ctx = auth(req);
    res.json(await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const b = (await balances(trx, [ctx.customerId!], await today(trx, ctx.wholesalerId))).get(ctx.customerId!);
      return { overdue: b?.overdue ?? '0.00', ...(await statement(trx, ctx.customerId!)) };
    }));
  });

  // Customer balances with overdue amounts (C-33)
  r.get('/customer-balances', requireRoles('accountant', 'sales'), async (req, res) => {
    const ctx = auth(req);
    const out = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const customers = await trx.selectFrom('customers').select(['id', 'business_name']).orderBy('business_name').execute();
      const b = await balances(trx, customers.map((c) => c.id), await today(trx, ctx.wholesalerId));
      return customers.map((c) => ({ id: c.id, businessName: c.business_name, balance: b.get(c.id)?.balance ?? '0.00', overdue: b.get(c.id)?.overdue ?? '0.00' })).filter((c) => c.balance !== '0.00');
    });
    res.json({ items: out });
  });

  return r;
}
