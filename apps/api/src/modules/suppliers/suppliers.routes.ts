import { Router } from 'express';
import { sql } from 'kysely';
import {
  createReceiptSchema,
  reasonSchema,
  supplierPaymentSchema,
  supplierReturnSchema,
  supplierSchema,
  updateReceiptSchema,
  updateSupplierSchema,
} from '@cosmo/shared';
import { validate } from '../../core/validation';
import { requireOwner, requireRoles } from '../../core/permissions';
import { actorOf, auth } from '../../core/context';
import { withTenant } from '../../core/db';
import { logActivity } from '../../core/activity';
import { errors } from '../../core/errors';
import { pageOf, param } from '../../core/http';
import {
  confirmReceipt,
  createReceipt,
  createSupplierReturn,
  decideSupplierReturn,
  loadReceipt,
  loadSupplierReturn,
  supplierBalances,
  updateReceipt,
} from './suppliers.service';

export function supplierRoutes(): Router {
  const r = Router();
  const readers = requireRoles('stock_manager', 'accountant');
  const writers = requireRoles('stock_manager');
  const money = requireRoles('accountant');

  // ---------- Suppliers (C-03) ----------
  r.get('/suppliers', readers, async (req, res) => {
    const ctx = auth(req);
    const result = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      let q = trx.selectFrom('suppliers').selectAll();
      if (req.query.status !== 'all') q = q.where('is_active', '=', true);
      const rows = await q.orderBy(sql`lower(name)`).execute();
      const balances = await supplierBalances(trx, rows.map((x) => x.id));
      return rows.map((s) => ({
        id: s.id,
        name: s.name,
        contactPerson: s.contact_person,
        phone: s.phone,
        address: s.address,
        isActive: s.is_active,
        ...balances.get(s.id),
      }));
    });
    res.json({ items: result });
  });

  r.post('/suppliers', writers, async (req, res) => {
    const ctx = auth(req);
    const input = validate(supplierSchema, req.body);
    const row = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const exists = await trx.selectFrom('suppliers').select('id').where(sql`lower(name)`, '=', input.name.toLowerCase()).executeTakeFirst();
      if (exists) throw errors.rule({ en: 'A supplier with this name exists', ar: 'يوجد مورد بنفس الاسم' }, { field: 'name' });
      const created = await trx
        .insertInto('suppliers')
        .values({ wholesaler_id: ctx.wholesalerId, name: input.name, contact_person: input.contactPerson, phone: input.phone, address: input.address })
        .returning('id')
        .executeTakeFirstOrThrow();
      await logActivity(trx, actorOf(ctx), { action: 'supplier_created', entityType: 'supplier', entityId: created.id, details: { name: input.name } });
      return created;
    });
    res.status(201).json({ id: row.id });
  });

  r.get('/suppliers/:id', readers, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const out = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const s = await trx.selectFrom('suppliers').selectAll().where('id', '=', id).executeTakeFirst();
      if (!s) throw errors.notFound();
      const balance = (await supplierBalances(trx, [id])).get(id);
      const receipts = await trx
        .selectFrom('receipts')
        .select(['id', 'receipt_number', 'status', 'supplier_invoice_number', 'total_amount', 'created_at', 'confirmed_at'])
        .where('supplier_id', '=', id)
        .orderBy('created_at', 'desc')
        .limit(50)
        .execute();
      const returns = await trx
        .selectFrom('supplier_returns')
        .select(['id', 'return_number', 'status', 'reason', 'total_value', 'created_at'])
        .where('supplier_id', '=', id)
        .orderBy('created_at', 'desc')
        .limit(50)
        .execute();
      const payments = await trx
        .selectFrom('supplier_payments as p')
        .leftJoin('employees as e', 'e.user_id', 'p.recorded_by')
        .select(['p.id', 'p.amount', 'p.method', 'p.paid_on', 'p.reference', 'p.cancelled_at', 'p.cancel_reason', 'e.name'])
        .where('p.supplier_id', '=', id)
        .orderBy('p.paid_on', 'desc')
        .limit(50)
        .execute();
      return {
        id: s.id,
        name: s.name,
        contactPerson: s.contact_person,
        phone: s.phone,
        address: s.address,
        isActive: s.is_active,
        ...balance,
        receipts: receipts.map((x) => ({ id: x.id, number: x.receipt_number, status: x.status, supplierInvoiceNumber: x.supplier_invoice_number, total: x.total_amount, at: x.confirmed_at ?? x.created_at })),
        supplierReturns: returns.map((x) => ({ id: x.id, number: x.return_number, status: x.status, reason: x.reason, total: x.total_value, at: x.created_at })),
        payments: payments.map((x) => ({ id: x.id, amount: x.amount, method: x.method, paidOn: x.paid_on, reference: x.reference, by: x.name, cancelledAt: x.cancelled_at, cancelReason: x.cancel_reason })),
      };
    });
    res.json(out);
  });

  r.patch('/suppliers/:id', writers, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const input = validate(updateSupplierSchema, req.body);
    await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const row = await trx
        .updateTable('suppliers')
        .set({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.contactPerson !== undefined && { contact_person: input.contactPerson }),
          ...(input.phone !== undefined && { phone: input.phone }),
          ...(input.address !== undefined && { address: input.address }),
          ...(input.isActive !== undefined && { is_active: input.isActive }),
        })
        .where('id', '=', id)
        .returning('id')
        .executeTakeFirst();
      if (!row) throw errors.notFound();
      await logActivity(trx, actorOf(ctx), { action: 'supplier_changed', entityType: 'supplier', entityId: id, details: input });
    });
    res.json({ ok: true });
  });

  // ---------- Receipts ----------
  r.get('/receipts', readers, async (req, res) => {
    const ctx = auth(req);
    const { page, limit, offset } = pageOf(req);
    const rows = await withTenant(res.locals.db, ctx.wholesalerId, (trx) => {
      let q = trx
        .selectFrom('receipts as r')
        .innerJoin('suppliers as s', 's.id', 'r.supplier_id')
        .select(['r.id', 'r.receipt_number', 'r.status', 'r.supplier_invoice_number', 'r.total_amount', 'r.created_at', 'r.confirmed_at', 's.name']);
      if (req.query.status === 'draft' || req.query.status === 'confirmed') q = q.where('r.status', '=', req.query.status);
      return q.orderBy('r.created_at', 'desc').limit(limit).offset(offset).execute();
    });
    res.json({
      items: rows.map((x) => ({ id: x.id, number: x.receipt_number, status: x.status, supplierName: x.name, supplierInvoiceNumber: x.supplier_invoice_number, total: x.total_amount, at: x.confirmed_at ?? x.created_at })),
      page,
      limit,
    });
  });

  r.post('/receipts', writers, async (req, res) => {
    const ctx = auth(req);
    const input = validate(createReceiptSchema, req.body);
    const out = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => loadReceipt(trx, await createReceipt(trx, actorOf(ctx), input.supplierId)));
    res.status(201).json(out);
  });

  r.get('/receipts/:id', readers, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    res.json(await withTenant(res.locals.db, ctx.wholesalerId, (trx) => loadReceipt(trx, id)));
  });

  r.patch('/receipts/:id', writers, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const input = validate(updateReceiptSchema, req.body);
    const out = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      await updateReceipt(trx, actorOf(ctx), id, input);
      return loadReceipt(trx, id);
    });
    res.json(out);
  });

  r.post('/receipts/:id/confirm', writers, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const out = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      await confirmReceipt(trx, actorOf(ctx), id);
      return loadReceipt(trx, id);
    });
    res.json(out);
  });

  // ---------- Supplier returns ----------
  r.get('/supplier-returns', readers, async (req, res) => {
    const ctx = auth(req);
    const rows = await withTenant(res.locals.db, ctx.wholesalerId, (trx) => {
      let q = trx
        .selectFrom('supplier_returns as x')
        .innerJoin('suppliers as s', 's.id', 'x.supplier_id')
        .select(['x.id', 'x.return_number', 'x.status', 'x.reason', 'x.total_value', 'x.created_at', 's.name']);
      const st = req.query.status;
      if (st === 'waiting_for_owner' || st === 'confirmed' || st === 'rejected') q = q.where('x.status', '=', st);
      return q.orderBy('x.created_at', 'desc').limit(100).execute();
    });
    res.json({ items: rows.map((x) => ({ id: x.id, number: x.return_number, status: x.status, reason: x.reason, total: x.total_value, supplierName: x.name, at: x.created_at })) });
  });

  r.post('/supplier-returns', writers, async (req, res) => {
    const ctx = auth(req);
    const input = validate(supplierReturnSchema, req.body);
    const out = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => loadSupplierReturn(trx, await createSupplierReturn(trx, actorOf(ctx), input)));
    res.status(201).json(out);
  });

  r.get('/supplier-returns/:id', readers, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    res.json(await withTenant(res.locals.db, ctx.wholesalerId, (trx) => loadSupplierReturn(trx, id)));
  });

  r.post('/supplier-returns/:id/approve', requireOwner, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const out = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      await decideSupplierReturn(trx, actorOf(ctx), id, { approve: true });
      return loadSupplierReturn(trx, id);
    });
    res.json(out);
  });

  r.post('/supplier-returns/:id/reject', requireOwner, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const input = validate(reasonSchema, req.body);
    const out = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      await decideSupplierReturn(trx, actorOf(ctx), id, { approve: false, reason: input.reason });
      return loadSupplierReturn(trx, id);
    });
    res.json(out);
  });

  // ---------- Supplier payments (ACC-09) ----------
  r.post('/supplier-payments', money, async (req, res) => {
    const ctx = auth(req);
    const input = validate(supplierPaymentSchema, req.body);
    const row = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const s = await trx.selectFrom('suppliers').select('id').where('id', '=', input.supplierId).executeTakeFirst();
      if (!s) throw errors.notFound();
      const created = await trx
        .insertInto('supplier_payments')
        .values({
          wholesaler_id: ctx.wholesalerId,
          supplier_id: input.supplierId,
          amount: input.amount,
          method: input.method,
          paid_on: input.paidOn,
          reference: input.reference,
          recorded_by: ctx.userId,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await logActivity(trx, actorOf(ctx), { action: 'supplier_payment_recorded', entityType: 'supplier', entityId: input.supplierId, details: { amount: input.amount, method: input.method } });
      return created;
    });
    res.status(201).json({ id: row.id });
  });

  // A saved payment is never edited. A wrong one is cancelled with a reason (C-10)
  r.post('/supplier-payments/:id/cancel', money, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const input = validate(reasonSchema, req.body);
    await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const row = await trx
        .updateTable('supplier_payments')
        .set({ cancelled_at: new Date(), cancelled_by: ctx.userId, cancel_reason: input.reason })
        .where('id', '=', id)
        .where('cancelled_at', 'is', null)
        .returning(['supplier_id', 'amount'])
        .executeTakeFirst();
      if (!row) throw errors.notFound();
      await logActivity(trx, actorOf(ctx), {
        action: 'supplier_payment_cancelled',
        entityType: 'supplier',
        entityId: row.supplier_id,
        reason: input.reason,
        details: { paymentId: id, amount: row.amount },
        important: true,
      });
    });
    res.json({ ok: true });
  });

  return r;
}
