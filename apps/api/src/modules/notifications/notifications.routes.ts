import { Router } from 'express';
import { requireLogin } from '../../core/permissions';
import { auth } from '../../core/context';
import { withTenant } from '../../core/db';
import { errors } from '../../core/errors';
import { pageOf, param } from '../../core/http';

export function notificationRoutes(): Router {
  const r = Router();

  r.get('/notifications', requireLogin, async (req, res) => {
    const ctx = auth(req);
    const { page, limit, offset } = pageOf(req);
    const result = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const base = trx.selectFrom('notifications').where('recipient_user_id', '=', ctx.userId);
      const items = await base.selectAll().orderBy('created_at', 'desc').limit(limit).offset(offset).execute();
      const total = await base.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow();
      const unread = await base.where('read_at', 'is', null).select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow();
      return { items, total: Number(total.n), unread: Number(unread.n) };
    });
    res.json({
      items: result.items.map((n) => ({
        id: n.id,
        type: n.type,
        title: req.lang === 'en' ? n.title_en : n.title_ar,
        body: req.lang === 'en' ? n.body_en : n.body_ar,
        entityType: n.entity_type,
        entityId: n.entity_id,
        readAt: n.read_at,
        createdAt: n.created_at,
      })),
      page,
      limit,
      total: result.total,
      unread: result.unread,
    });
  });

  r.post('/notifications/read-all', requireLogin, async (req, res) => {
    const ctx = auth(req);
    await withTenant(res.locals.db, ctx.wholesalerId, (trx) =>
      trx.updateTable('notifications').set({ read_at: new Date() }).where('recipient_user_id', '=', ctx.userId).where('read_at', 'is', null).execute(),
    );
    res.json({ ok: true });
  });

  r.post('/notifications/:id/read', requireLogin, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const row = await trx
        .updateTable('notifications')
        .set({ read_at: new Date() })
        .where('id', '=', id)
        .where('recipient_user_id', '=', ctx.userId)
        .returning('id')
        .executeTakeFirst();
      if (!row) throw errors.notFound();
    });
    res.json({ ok: true });
  });

  return r;
}
