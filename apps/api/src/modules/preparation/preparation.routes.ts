import { Router } from 'express';
import { picksSchema, reduceSchema } from '@cosmo/shared';
import { validate } from '../../core/validation';
import { requireRoles } from '../../core/permissions';
import { auth } from '../../core/context';
import { withTenant } from '../../core/db';
import { param } from '../../core/http';
import { confirmPreparation, preparationView, reduceInPreparation, releasePreparing, savePicks, startPreparing } from './preparation.service';

// The stock manager prepares orders (C-34). The owner can do it too.
export function preparationRoutes(): Router {
  const r = Router();
  const keeper = requireRoles('stock_manager');

  r.post('/orders/:id/start-preparing', keeper, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    res.json(await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      await startPreparing(trx, ctx, id);
      return preparationView(trx, ctx, id);
    }));
  });

  r.get('/orders/:id/preparation', keeper, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    res.json(await withTenant(res.locals.db, ctx.wholesalerId, (trx) => preparationView(trx, ctx, id)));
  });

  r.put('/orders/:id/lines/:lineId/picks', keeper, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const lineId = param(req, 'lineId');
    const input = validate(picksSchema, req.body);
    res.json(await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      await savePicks(trx, ctx, id, lineId, input.picks);
      return preparationView(trx, ctx, id);
    }));
  });

  r.post('/orders/:id/lines/:lineId/reduce', keeper, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const lineId = param(req, 'lineId');
    const input = validate(reduceSchema, req.body);
    res.json(await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      await reduceInPreparation(trx, ctx, id, lineId, input);
      return preparationView(trx, ctx, id);
    }));
  });

  r.post('/orders/:id/confirm-preparation', keeper, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    await withTenant(res.locals.db, ctx.wholesalerId, (trx) => confirmPreparation(trx, ctx, id));
    res.json({ ok: true });
  });

  r.post('/orders/:id/release-preparing', keeper, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    await withTenant(res.locals.db, ctx.wholesalerId, (trx) => releasePreparing(trx, ctx, id));
    res.json({ ok: true });
  });

  return r;
}
