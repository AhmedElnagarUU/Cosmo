import { Router } from 'express';
import { checkReturnSchema, createReturnSchema, leftOverSchema, refundSchema } from '@cosmo/shared';
import { validate } from '../../core/validation';
import { requireLogin, requireRoles } from '../../core/permissions';
import { auth } from '../../core/context';
import { withTenant } from '../../core/db';
import { errors } from '../../core/errors';
import { param } from '../../core/http';
import { cancelReturn, checkReturn, chooseLeftOver, createReturn, loadReturn, recordRefund } from './returns.service';

export function returnRoutes(): Router {
  const r = Router();

  r.get('/returns', requireLogin, async (req, res) => {
    const ctx = auth(req);
    if (ctx.userType === 'employee' && !ctx.roles.some((x) => ['owner', 'sales', 'stock_manager', 'accountant'].includes(x))) throw errors.notAllowed();
    const rows = await withTenant(res.locals.db, ctx.wholesalerId, (trx) => {
      let q = trx
        .selectFrom('customer_returns as r')
        .innerJoin('customers as c', 'c.id', 'r.customer_id')
        .innerJoin('orders as o', 'o.id', 'r.order_id')
        .select(['r.id', 'r.return_number', 'r.status', 'r.source', 'r.credit_amount', 'r.left_over', 'r.left_over_choice', 'r.created_at', 'c.business_name', 'o.order_number']);
      if (ctx.userType === 'customer') q = q.where('r.customer_id', '=', ctx.customerId!);
      const st = req.query.status;
      if (st === 'requested' || st === 'completed' || st === 'cancelled') q = q.where('r.status', '=', st);
      return q.orderBy('r.created_at', 'desc').limit(200).execute();
    });
    res.json({
      items: rows.map((x) => ({ id: x.id, returnNumber: x.return_number, status: x.status, source: x.source, creditAmount: x.credit_amount, leftOver: x.left_over, leftOverChoice: x.left_over_choice, createdAt: x.created_at, customerName: x.business_name, orderNumber: x.order_number })),
    });
  });

  r.get('/returns/:id', requireLogin, async (req, res) => {
    const ctx = auth(req);
    if (ctx.userType === 'employee' && !ctx.roles.some((x) => ['owner', 'sales', 'stock_manager', 'accountant'].includes(x))) throw errors.notAllowed();
    const id = param(req, 'id');
    res.json(await withTenant(res.locals.db, ctx.wholesalerId, (trx) => loadReturn(trx, ctx, id)));
  });

  // C-62: only employees create returns
  r.post('/returns', requireRoles('sales', 'stock_manager'), async (req, res) => {
    const ctx = auth(req);
    const input = validate(createReturnSchema, req.body);
    res.status(201).json(await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => loadReturn(trx, ctx, await createReturn(trx, ctx, input))));
  });

  r.post('/returns/:id/check', requireRoles('stock_manager'), async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const input = validate(checkReturnSchema, req.body);
    res.json(await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      await checkReturn(trx, ctx, id, input.lines);
      return loadReturn(trx, ctx, id);
    }));
  });

  r.post('/returns/:id/cancel', requireRoles('stock_manager', 'sales'), async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    res.json(await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      await cancelReturn(trx, ctx, id);
      return loadReturn(trx, ctx, id);
    }));
  });

  r.post('/returns/:id/left-over', requireRoles('accountant'), async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const input = validate(leftOverSchema, req.body);
    res.json(await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      await chooseLeftOver(trx, ctx, id, input.choice);
      return loadReturn(trx, ctx, id);
    }));
  });

  r.post('/returns/:id/refund', requireRoles('accountant'), async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const input = validate(refundSchema, req.body);
    res.json(await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      await recordRefund(trx, ctx, id, input);
      return loadReturn(trx, ctx, id);
    }));
  });

  return r;
}
