import { Router } from 'express';
import { createEmployeeSchema, updateEmployeeSchema, type Role } from '@cosmo/shared';
import { validate } from '../../core/validation';
import { requireOwner } from '../../core/permissions';
import { actorOf, auth } from '../../core/context';
import { withTenant, type Trx } from '../../core/db';
import { logActivity } from '../../core/activity';
import { errors } from '../../core/errors';
import { param } from '../../core/http';
import { deleteSessionsOf } from '../../core/auth';
import { activeOwnerCount, createUser, lastOwnerError, resetToTemporaryPassword, sortRoles } from './people.service';

async function loadEmployee(trx: Trx, id: string) {
  const e = await trx
    .selectFrom('employees as e')
    .innerJoin('users as u', 'u.id', 'e.user_id')
    .select(['e.id', 'e.name', 'e.user_id', 'u.phone', 'u.is_active', 'u.last_login_at', 'u.must_change_password', 'e.created_at'])
    .where('e.id', '=', id)
    .executeTakeFirst();
  if (!e) throw errors.notFound();
  const roles = (await trx.selectFrom('employee_roles').select('role').where('employee_id', '=', id).execute()).map((r) => r.role);
  return {
    id: e.id,
    userId: e.user_id,
    name: e.name,
    phone: e.phone,
    roles: sortRoles(roles),
    isActive: e.is_active,
    mustChangePassword: e.must_change_password,
    lastLoginAt: e.last_login_at,
    createdAt: e.created_at,
  };
}

export function employeeRoutes(): Router {
  const r = Router();

  r.get('/employees', requireOwner, async (req, res) => {
    const ctx = auth(req);
    const items = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const rows = await trx
        .selectFrom('employees as e')
        .innerJoin('users as u', 'u.id', 'e.user_id')
        .select(['e.id', 'e.name', 'u.phone', 'u.is_active', 'u.last_login_at'])
        .orderBy('u.is_active', 'desc')
        .orderBy('e.name')
        .execute();
      const roles = await trx.selectFrom('employee_roles').select(['employee_id', 'role']).execute();
      return rows.map((e) => ({
        id: e.id,
        name: e.name,
        phone: e.phone,
        isActive: e.is_active,
        lastLoginAt: e.last_login_at,
        roles: sortRoles(roles.filter((x) => x.employee_id === e.id).map((x) => x.role)),
      }));
    });
    res.json({ items, page: 1, limit: items.length, total: items.length });
  });

  r.get('/employees/:id', requireOwner, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    res.json(await withTenant(res.locals.db, ctx.wholesalerId, (trx) => loadEmployee(trx, id)));
  });

  // OWN-01: name, phone, and roles. The answer holds the temporary password, shown once.
  r.post('/employees', requireOwner, async (req, res) => {
    const ctx = auth(req);
    const input = validate(createEmployeeSchema, req.body);
    const result = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const { userId, temporaryPassword } = await createUser(trx, ctx.wholesalerId, input.phone, 'employee');
      const employee = await trx
        .insertInto('employees')
        .values({ wholesaler_id: ctx.wholesalerId, user_id: userId, name: input.name })
        .returning('id')
        .executeTakeFirstOrThrow();
      const roles = sortRoles(input.roles);
      await trx
        .insertInto('employee_roles')
        .values(roles.map((role) => ({ employee_id: employee.id, role, wholesaler_id: ctx.wholesalerId })))
        .execute();
      await logActivity(trx, actorOf(ctx), {
        action: 'employee_created',
        entityType: 'employee',
        entityId: employee.id,
        details: { name: input.name, roles },
      });
      return { employee: await loadEmployee(trx, employee.id), temporaryPassword };
    });
    res.status(201).json(result);
  });

  r.patch('/employees/:id', requireOwner, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const input = validate(updateEmployeeSchema, req.body);
    const result = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const before = await loadEmployee(trx, id);
      if (input.name !== undefined) {
        await trx.updateTable('employees').set({ name: input.name }).where('id', '=', id).execute();
      }
      if (input.roles !== undefined) {
        const roles = sortRoles(input.roles);
        const losesOwner = before.roles.includes('owner') && !roles.includes('owner');
        if (losesOwner && before.isActive && (await activeOwnerCount(trx, id)) === 0) throw lastOwnerError();
        await trx.deleteFrom('employee_roles').where('employee_id', '=', id).execute();
        await trx
          .insertInto('employee_roles')
          .values(roles.map((role: Role) => ({ employee_id: id, role, wholesaler_id: ctx.wholesalerId })))
          .execute();
        // New roles take effect on the next request, because roles are read with each session
      }
      const after = await loadEmployee(trx, id);
      await logActivity(trx, actorOf(ctx), {
        action: 'employee_changed',
        entityType: 'employee',
        entityId: id,
        details: { before: { name: before.name, roles: before.roles }, after: { name: after.name, roles: after.roles } },
      });
      return after;
    });
    res.json(result);
  });

  // A deactivated employee cannot log in, and is logged out at once (OWN-01, C-90)
  r.post('/employees/:id/deactivate', requireOwner, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const result = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const e = await loadEmployee(trx, id);
      if (e.id === ctx.employeeId) {
        throw errors.rule({ en: 'You cannot deactivate your own account', ar: 'لا يمكنك إيقاف حسابك' });
      }
      if (e.roles.includes('owner') && e.isActive && (await activeOwnerCount(trx, id)) === 0) throw lastOwnerError();
      await trx.updateTable('users').set({ is_active: false }).where('id', '=', e.userId).execute();
      await deleteSessionsOf(trx, e.userId);
      await logActivity(trx, actorOf(ctx), { action: 'employee_deactivated', entityType: 'employee', entityId: id, details: { name: e.name } });
      return loadEmployee(trx, id);
    });
    res.json(result);
  });

  r.post('/employees/:id/activate', requireOwner, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const result = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const e = await loadEmployee(trx, id);
      await trx.updateTable('users').set({ is_active: true }).where('id', '=', e.userId).execute();
      await logActivity(trx, actorOf(ctx), { action: 'employee_activated', entityType: 'employee', entityId: id, details: { name: e.name } });
      return loadEmployee(trx, id);
    });
    res.json(result);
  });

  r.post('/employees/:id/reset-password', requireOwner, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const result = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const e = await loadEmployee(trx, id);
      if (e.id === ctx.employeeId) {
        throw errors.rule({ en: 'Use "change password" for your own account', ar: 'استخدم "تغيير كلمة المرور" لحسابك' });
      }
      const temporaryPassword = await resetToTemporaryPassword(trx, e.userId, ctx.userId);
      await logActivity(trx, actorOf(ctx), { action: 'employee_password_reset', entityType: 'employee', entityId: id, details: { name: e.name } });
      return { temporaryPassword, phone: e.phone, name: e.name };
    });
    res.json(result);
  });

  return r;
}
