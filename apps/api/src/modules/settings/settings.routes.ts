import { Router } from 'express';
import { closedDaySchema, updateSettingsSchema, workingHoursSchema } from '@cosmo/shared';
import { validate } from '../../core/validation';
import { requireLogin, requireOwner } from '../../core/permissions';
import { actorOf, auth } from '../../core/context';
import { withTenant } from '../../core/db';
import { logActivity } from '../../core/activity';
import { errors } from '../../core/errors';
import { param } from '../../core/http';
import { currentOpenStatus } from './open-status';

function toSettings(row: {
  default_credit_days: number;
  invoice_timing: string;
  near_expiry_months: number;
  supplier_return_approval: boolean;
  minimum_order_value: string | null;
  max_extra_fields: number;
}) {
  return {
    defaultCreditDays: row.default_credit_days,
    invoiceTiming: row.invoice_timing,
    nearExpiryMonths: row.near_expiry_months,
    supplierReturnApproval: row.supplier_return_approval,
    minimumOrderValue: row.minimum_order_value,
    maxExtraFields: row.max_extra_fields,
  };
}

export function settingsRoutes(): Router {
  const r = Router();

  r.get('/settings', requireOwner, async (req, res) => {
    const ctx = auth(req);
    const row = await withTenant(res.locals.db, ctx.wholesalerId, (trx) =>
      trx.selectFrom('settings').selectAll().executeTakeFirstOrThrow(),
    );
    res.json(toSettings(row));
  });

  // C-40: a changed setting applies to new orders only (OWN-02)
  r.patch('/settings', requireOwner, async (req, res) => {
    const ctx = auth(req);
    const input = validate(updateSettingsSchema, req.body);
    const row = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const before = await trx.selectFrom('settings').selectAll().executeTakeFirstOrThrow();
      const after = await trx
        .updateTable('settings')
        .set({
          ...(input.defaultCreditDays !== undefined && { default_credit_days: input.defaultCreditDays }),
          ...(input.invoiceTiming !== undefined && { invoice_timing: input.invoiceTiming }),
          ...(input.nearExpiryMonths !== undefined && { near_expiry_months: input.nearExpiryMonths }),
          ...(input.supplierReturnApproval !== undefined && { supplier_return_approval: input.supplierReturnApproval }),
          ...(input.minimumOrderValue !== undefined && { minimum_order_value: input.minimumOrderValue }),
          updated_at: new Date(),
        })
        .where('wholesaler_id', '=', ctx.wholesalerId)
        .returningAll()
        .executeTakeFirstOrThrow();
      await logActivity(trx, actorOf(ctx), {
        action: 'settings_changed',
        entityType: 'settings',
        details: { before: toSettings(before), after: toSettings(after) },
      });
      return after;
    });
    res.json(toSettings(row));
  });

  r.get('/settings/working-hours', requireLogin, async (req, res) => {
    const ctx = auth(req);
    const days = await withTenant(res.locals.db, ctx.wholesalerId, (trx) =>
      trx.selectFrom('working_hours').select(['day_of_week', 'opens_at', 'closes_at']).orderBy('day_of_week').execute(),
    );
    res.json({
      days: days.map((d) => ({ dayOfWeek: d.day_of_week, opensAt: d.opens_at.slice(0, 5), closesAt: d.closes_at.slice(0, 5) })),
    });
  });

  // C-37: the whole week is saved at once. A missing day is a closed day.
  r.put('/settings/working-hours', requireOwner, async (req, res) => {
    const ctx = auth(req);
    const input = validate(workingHoursSchema, req.body);
    await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      await trx.deleteFrom('working_hours').execute();
      if (input.days.length > 0) {
        await trx
          .insertInto('working_hours')
          .values(input.days.map((d) => ({ wholesaler_id: ctx.wholesalerId, day_of_week: d.dayOfWeek, opens_at: d.opensAt, closes_at: d.closesAt })))
          .execute();
      }
      await logActivity(trx, actorOf(ctx), { action: 'working_hours_changed', entityType: 'settings', details: { days: input.days } });
    });
    res.json({ days: input.days.sort((a, b) => a.dayOfWeek - b.dayOfWeek) });
  });

  r.get('/settings/closed-days', requireOwner, async (req, res) => {
    const ctx = auth(req);
    const rows = await withTenant(res.locals.db, ctx.wholesalerId, (trx) =>
      trx.selectFrom('closed_days').select(['id', 'closed_on', 'note']).orderBy('closed_on', 'desc').limit(100).execute(),
    );
    res.json({ items: rows.map((r) => ({ id: r.id, closedOn: r.closed_on, note: r.note })) });
  });

  r.post('/settings/closed-days', requireOwner, async (req, res) => {
    const ctx = auth(req);
    const input = validate(closedDaySchema, req.body);
    const row = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const exists = await trx.selectFrom('closed_days').select('id').where('closed_on', '=', input.closedOn).executeTakeFirst();
      if (exists) throw errors.rule({ en: 'This day is already marked as closed', ar: 'هذا اليوم مسجل كيوم إغلاق بالفعل' });
      const created = await trx
        .insertInto('closed_days')
        .values({ wholesaler_id: ctx.wholesalerId, closed_on: input.closedOn, note: input.note ?? null })
        .returning(['id', 'closed_on', 'note'])
        .executeTakeFirstOrThrow();
      await logActivity(trx, actorOf(ctx), { action: 'closed_day_added', entityType: 'settings', entityId: created.id, details: { closedOn: input.closedOn } });
      return created;
    });
    res.status(201).json({ id: row.id, closedOn: row.closed_on, note: row.note });
  });

  r.delete('/settings/closed-days/:id', requireOwner, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const deleted = await trx.deleteFrom('closed_days').where('id', '=', id).returning('closed_on').executeTakeFirst();
      if (!deleted) throw errors.notFound();
      await logActivity(trx, actorOf(ctx), { action: 'closed_day_removed', entityType: 'settings', entityId: id, details: { closedOn: deleted.closed_on } });
    });
    res.json({ ok: true });
  });

  r.get('/open-status', requireLogin, async (req, res) => {
    const ctx = auth(req);
    res.json(await withTenant(res.locals.db, ctx.wholesalerId, (trx) => currentOpenStatus(trx, ctx.wholesalerId)));
  });

  return r;
}
