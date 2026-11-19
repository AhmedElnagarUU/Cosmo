import { Router } from 'express';
import { sql } from 'kysely';
import { createCustomerSchema, customerCreditSchema, updateCustomerSchema } from '@cosmo/shared';
import { validate } from '../../core/validation';
import { requireCustomer, requireOwner, requireRoles } from '../../core/permissions';
import { actorOf, auth } from '../../core/context';
import { withTenant, type Trx } from '../../core/db';
import { logActivity } from '../../core/activity';
import { errors } from '../../core/errors';
import { pageOf, param } from '../../core/http';
import { deleteSessionsOf } from '../../core/auth';
import { createUser, phoneIsFree, resetToTemporaryPassword } from './people.service';

async function loadCustomer(trx: Trx, id: string) {
  const c = await trx
    .selectFrom('customers as c')
    .innerJoin('users as u', 'u.id', 'c.user_id')
    .select([
      'c.id', 'c.user_id', 'c.business_name', 'c.contact_person', 'c.phone', 'c.address', 'c.area',
      'c.credit_allowed', 'c.credit_days', 'c.is_active', 'c.created_at', 'u.last_login_at', 'u.must_change_password',
    ])
    .where('c.id', '=', id)
    .executeTakeFirst();
  if (!c) throw errors.notFound();
  return {
    id: c.id,
    userId: c.user_id,
    businessName: c.business_name,
    contactPerson: c.contact_person,
    phone: c.phone,
    address: c.address,
    area: c.area,
    creditAllowed: c.credit_allowed,
    creditDays: c.credit_days,
    isActive: c.is_active,
    hasLoggedIn: !c.must_change_password,
    lastLoginAt: c.last_login_at,
    createdAt: c.created_at,
  };
}

async function loginCodeOf(trx: Trx, wholesalerId: string) {
  const w = await trx.selectFrom('wholesalers').select('login_code').where('id', '=', wholesalerId).executeTakeFirstOrThrow();
  return w.login_code;
}

export function customerRoutes(): Router {
  const r = Router();

  // The delivery manager sees only name, address, and phone (C-64)
  r.get('/customers', requireRoles('sales', 'accountant', 'delivery_manager'), async (req, res) => {
    const ctx = auth(req);
    const { page, limit, offset } = pageOf(req);
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    const status = req.query.status === 'inactive' ? false : req.query.status === 'all' ? null : true;
    const limited = !ctx.roles.some((role) => ['owner', 'sales', 'accountant'].includes(role));

    const result = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      let base = trx.selectFrom('customers');
      if (status !== null) base = base.where('is_active', '=', status);
      if (q) {
        const like = `%${q.replace(/[%_\\]/g, (m) => '\\' + m)}%`;
        base = base.where((eb) =>
          eb.or([eb('business_name', 'ilike', like), eb('contact_person', 'ilike', like), eb('phone', 'like', like), eb('area', 'ilike', like)]),
        );
      }
      const items = await base
        .select(['id', 'business_name', 'contact_person', 'phone', 'address', 'area', 'credit_allowed', 'credit_days', 'is_active'])
        .orderBy(sql`lower(business_name)`)
        .limit(limit)
        .offset(offset)
        .execute();
      const total = await base.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow();
      return { items, total: Number(total.n) };
    });

    res.json({
      items: result.items.map((c) =>
        limited
          ? { id: c.id, businessName: c.business_name, phone: c.phone, address: c.address, area: c.area }
          : {
              id: c.id,
              businessName: c.business_name,
              contactPerson: c.contact_person,
              phone: c.phone,
              address: c.address,
              area: c.area,
              creditAllowed: c.credit_allowed,
              creditDays: c.credit_days,
              isActive: c.is_active,
            },
      ),
      page,
      limit,
      total: result.total,
    });
  });

  r.get('/customers/:id', requireRoles('sales', 'accountant'), async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    res.json(await withTenant(res.locals.db, ctx.wholesalerId, (trx) => loadCustomer(trx, id)));
  });

  // OWN-03, SAL-01. The answer has the first-login details to send by WhatsApp (C-73).
  r.post('/customers', requireRoles('sales'), async (req, res) => {
    const ctx = auth(req);
    const input = validate(createCustomerSchema, req.body);
    const result = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const settings = await trx.selectFrom('settings').select('default_credit_days').executeTakeFirstOrThrow();
      const { userId, temporaryPassword } = await createUser(trx, ctx.wholesalerId, input.phone, 'customer');
      const created = await trx
        .insertInto('customers')
        .values({
          wholesaler_id: ctx.wholesalerId,
          user_id: userId,
          business_name: input.businessName,
          contact_person: input.contactPerson,
          phone: input.phone,
          address: input.address,
          area: input.area ?? null,
          credit_allowed: false,
          credit_days: settings.default_credit_days,
          created_by: ctx.userId,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await logActivity(trx, actorOf(ctx), {
        action: 'customer_created',
        entityType: 'customer',
        entityId: created.id,
        details: { businessName: input.businessName },
      });
      return {
        customer: await loadCustomer(trx, created.id),
        firstLogin: { loginCode: await loginCodeOf(trx, ctx.wholesalerId), phone: input.phone, temporaryPassword },
      };
    });
    res.status(201).json(result);
  });

  r.patch('/customers/:id', requireRoles('sales'), async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const input = validate(updateCustomerSchema, req.body);
    const result = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const before = await loadCustomer(trx, id);
      if (input.phone !== undefined && input.phone !== before.phone) {
        // The phone is also the login, so both change together
        await phoneIsFree(trx, input.phone, before.userId);
        await trx.updateTable('users').set({ phone: input.phone }).where('id', '=', before.userId).execute();
      }
      await trx
        .updateTable('customers')
        .set({
          ...(input.businessName !== undefined && { business_name: input.businessName }),
          ...(input.contactPerson !== undefined && { contact_person: input.contactPerson }),
          ...(input.phone !== undefined && { phone: input.phone }),
          ...(input.address !== undefined && { address: input.address }),
          ...(input.area !== undefined && { area: input.area }),
        })
        .where('id', '=', id)
        .execute();
      const after = await loadCustomer(trx, id);
      await logActivity(trx, actorOf(ctx), {
        action: 'customer_changed',
        entityType: 'customer',
        entityId: id,
        details: { before, after },
      });
      return after;
    });
    res.json(result);
  });

  // C-26: only the owner changes credit. Applies to new orders only (OWN-04).
  r.patch('/customers/:id/credit', requireOwner, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const input = validate(customerCreditSchema, req.body);
    const result = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const before = await loadCustomer(trx, id);
      await trx
        .updateTable('customers')
        .set({ credit_allowed: input.creditAllowed, credit_days: input.creditDays })
        .where('id', '=', id)
        .execute();
      await logActivity(trx, actorOf(ctx), {
        action: 'customer_credit_changed',
        entityType: 'customer',
        entityId: id,
        details: {
          before: { creditAllowed: before.creditAllowed, creditDays: before.creditDays },
          after: input,
        },
      });
      return loadCustomer(trx, id);
    });
    res.json(result);
  });

  // OWN-05: a deactivated customer cannot log in. Their history stays.
  r.post('/customers/:id/deactivate', requireOwner, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const result = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const c = await loadCustomer(trx, id);
      await trx.updateTable('customers').set({ is_active: false }).where('id', '=', id).execute();
      await trx.updateTable('users').set({ is_active: false }).where('id', '=', c.userId).execute();
      await deleteSessionsOf(trx, c.userId);
      await logActivity(trx, actorOf(ctx), { action: 'customer_deactivated', entityType: 'customer', entityId: id, details: { businessName: c.businessName } });
      return loadCustomer(trx, id);
    });
    res.json(result);
  });

  r.post('/customers/:id/activate', requireOwner, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const result = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const c = await loadCustomer(trx, id);
      await trx.updateTable('customers').set({ is_active: true }).where('id', '=', id).execute();
      await trx.updateTable('users').set({ is_active: true }).where('id', '=', c.userId).execute();
      await logActivity(trx, actorOf(ctx), { action: 'customer_activated', entityType: 'customer', entityId: id, details: { businessName: c.businessName } });
      return loadCustomer(trx, id);
    });
    res.json(result);
  });

  // C-87: owner or sales sets a temporary password, to send by WhatsApp
  r.post('/customers/:id/reset-password', requireRoles('sales'), async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const result = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const c = await loadCustomer(trx, id);
      if (!c.isActive) throw errors.rule({ en: 'This customer is deactivated', ar: 'هذا العميل موقوف' });
      const temporaryPassword = await resetToTemporaryPassword(trx, c.userId, ctx.userId);
      await logActivity(trx, actorOf(ctx), { action: 'customer_password_reset', entityType: 'customer', entityId: id, details: { businessName: c.businessName } });
      return {
        customerId: c.id,
        businessName: c.businessName,
        firstLogin: { loginCode: await loginCodeOf(trx, ctx.wholesalerId), phone: c.phone, temporaryPassword },
      };
    });
    res.json(result);
  });

  // Waiting "forgot password" requests. Sales sees only customers.
  r.get('/password-reset-requests', requireRoles('sales'), async (req, res) => {
    const ctx = auth(req);
    const isOwner = ctx.roles.includes('owner');
    const rows = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      let q = trx
        .selectFrom('password_reset_requests as p')
        .innerJoin('users as u', 'u.id', 'p.user_id')
        .leftJoin('customers as c', 'c.user_id', 'u.id')
        .leftJoin('employees as e', 'e.user_id', 'u.id')
        .select(['p.id', 'p.requested_at', 'u.user_type', 'u.phone', 'c.id as customer_id', 'c.business_name', 'e.id as employee_id', 'e.name as employee_name'])
        .where('p.status', '=', 'waiting')
        .orderBy('p.requested_at');
      if (!isOwner) q = q.where('u.user_type', '=', 'customer');
      return q.execute();
    });
    res.json({
      items: rows.map((r) => ({
        id: r.id,
        requestedAt: r.requested_at,
        userType: r.user_type,
        phone: r.phone,
        customerId: r.customer_id,
        employeeId: r.employee_id,
        name: r.business_name ?? r.employee_name,
      })),
    });
  });

  r.get('/my/profile', requireCustomer, async (req, res) => {
    const ctx = auth(req);
    const c = await withTenant(res.locals.db, ctx.wholesalerId, (trx) => loadCustomer(trx, ctx.customerId!));
    res.json({
      businessName: c.businessName,
      contactPerson: c.contactPerson,
      phone: c.phone,
      address: c.address,
      area: c.area,
      creditAllowed: c.creditAllowed,
      creditDays: c.creditDays,
    });
  });

  return r;
}
