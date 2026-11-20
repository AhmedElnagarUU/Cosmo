import { Router } from 'express';
import { sql } from 'kysely';
import { adjustmentSchema, damageSchema } from '@cosmo/shared';
import { validate } from '../../core/validation';
import { requireRoles } from '../../core/permissions';
import { actorOf, auth } from '../../core/context';
import { withTenant } from '../../core/db';
import { errors } from '../../core/errors';
import { pageOf, param } from '../../core/http';
import { adjustToCount, markDamagedOrLost, todayIn } from './stock.service';

export function stockRoutes(): Router {
  const r = Router();

  r.get('/products/:id/batches', requireRoles('stock_manager'), async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const rows = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const p = await trx.selectFrom('products').select('id').where('id', '=', id).executeTakeFirst();
      if (!p) throw errors.notFound();
      return trx
        .selectFrom('batches')
        .selectAll()
        .where('product_id', '=', id)
        .orderBy(sql`expiry_date nulls last`)
        .execute();
    });
    res.json({
      items: rows.map((b) => ({
        id: b.id,
        batchNumber: b.batch_number,
        expiryDate: b.expiry_date,
        sellable: b.qty_sellable,
        damaged: b.qty_damaged,
        expired: b.qty_expired,
        held: b.qty_held,
        onHand: b.qty_sellable + b.qty_damaged + b.qty_expired + b.qty_held,
      })),
    });
  });

  r.get('/products/:id/movements', requireRoles('stock_manager'), async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const { page, limit, offset } = pageOf(req);
    const rows = await withTenant(res.locals.db, ctx.wholesalerId, (trx) =>
      trx
        .selectFrom('stock_movements as m')
        .leftJoin('batches as b', 'b.id', 'm.batch_id')
        .leftJoin('employees as e', 'e.user_id', 'm.created_by')
        .select(['m.id', 'm.movement_type', 'm.stock_state', 'm.quantity_change', 'm.reserved_change', 'm.reason', 'm.created_at', 'b.batch_number', 'e.name'])
        .where('m.product_id', '=', id)
        .orderBy('m.created_at', 'desc')
        .limit(limit)
        .offset(offset)
        .execute(),
    );
    res.json({
      items: rows.map((m) => ({
        id: m.id,
        type: m.movement_type,
        state: m.stock_state,
        quantityChange: m.quantity_change,
        reservedChange: m.reserved_change,
        reason: m.reason,
        batchNumber: m.batch_number,
        by: m.name,
        at: m.created_at,
      })),
      page,
      limit,
    });
  });

  // STK-14. Also used for opening stock in phase 2, before receiving exists.
  r.post('/stock/adjustments', requireRoles('stock_manager'), async (req, res) => {
    const ctx = auth(req);
    const input = validate(adjustmentSchema, req.body);
    const result = await withTenant(res.locals.db, ctx.wholesalerId, (trx) => adjustToCount(trx, actorOf(ctx), input));
    res.status(201).json(result);
  });

  // STK-15
  r.post('/stock/damaged', requireRoles('stock_manager'), async (req, res) => {
    const ctx = auth(req);
    const input = validate(damageSchema, req.body);
    await withTenant(res.locals.db, ctx.wholesalerId, (trx) => markDamagedOrLost(trx, actorOf(ctx), input));
    res.status(201).json({ ok: true });
  });

  // STK-16: batches that expire within the near-expiry period (C-45), and expired stock
  r.get('/stock/near-expiry', requireRoles('stock_manager'), async (req, res) => {
    const ctx = auth(req);
    const result = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const w = await trx.selectFrom('wholesalers').select('time_zone').where('id', '=', ctx.wholesalerId).executeTakeFirstOrThrow();
      const s = await trx.selectFrom('settings').select('near_expiry_months').executeTakeFirstOrThrow();
      const today = todayIn(w.time_zone);
      const limitDate = new Date(today + 'T00:00:00Z');
      limitDate.setUTCMonth(limitDate.getUTCMonth() + s.near_expiry_months);
      const until = limitDate.toISOString().slice(0, 10);
      const rows = await trx
        .selectFrom('batches as b')
        .innerJoin('products as p', 'p.id', 'b.product_id')
        .select(['b.id', 'b.product_id', 'b.batch_number', 'b.expiry_date', 'b.qty_sellable', 'b.qty_expired', 'p.name_ar', 'p.name_en'])
        .where('b.expiry_date', 'is not', null)
        .where('b.expiry_date', '<=', until)
        .where((eb) => eb.or([eb('b.qty_sellable', '>', 0), eb('b.qty_expired', '>', 0)]))
        .orderBy('b.expiry_date')
        .limit(500)
        .execute();
      return { rows, today, until, months: s.near_expiry_months };
    });
    const out = result.rows.map((b) => ({
      batchId: b.id,
      productId: b.product_id,
      product: { nameAr: b.name_ar, nameEn: b.name_en },
      batchNumber: b.batch_number,
      expiryDate: b.expiry_date,
      sellable: b.qty_sellable,
      expired: b.qty_expired,
    }));
    res.json({
      months: result.months,
      until: result.until,
      nearExpiry: out.filter((b) => b.expiryDate! >= result.today && b.sellable > 0),
      expired: out.filter((b) => b.expiryDate! < result.today),
    });
  });

  return r;
}
