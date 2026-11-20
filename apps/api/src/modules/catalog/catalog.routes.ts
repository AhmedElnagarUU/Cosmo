import { Router, type Request } from 'express';
import { sql } from 'kysely';
import {
  createProductSchema,
  extraFieldSchema,
  listItemSchema,
  offerSchema,
  priceChangeSchema,
  updateExtraFieldSchema,
  updateListItemSchema,
  updateProductSchema,
} from '@cosmo/shared';
import { validate } from '../../core/validation';
import { requireLogin, requireOwner, requireRoles } from '../../core/permissions';
import { actorOf, auth } from '../../core/context';
import { withTenant } from '../../core/db';
import { logActivity } from '../../core/activity';
import { errors } from '../../core/errors';
import { pageOf, param } from '../../core/http';
import { changePrices, createProduct, getProduct, listProducts, updateProduct, type Viewer } from './products.service';
import { todayIn } from '../stock/stock.service';

const LISTS = {
  categories: 'categories',
  brands: 'brands',
  'dosage-forms': 'dosage_forms',
} as const;

function viewerOf(req: Request): Viewer {
  const a = auth(req);
  return { kind: a.userType, roles: a.roles };
}

export function catalogRoutes(): Router {
  const r = Router();

  // Lists: categories, brands, dosage forms (C-74)
  for (const [path, table] of Object.entries(LISTS)) {
    r.get(`/${path}`, requireLogin, async (req, res) => {
      const ctx = auth(req);
      const includeInactive = ctx.userType === 'employee' && req.query.status === 'all';
      const rows = await withTenant(res.locals.db, ctx.wholesalerId, (trx) => {
        let q = trx.selectFrom(table).selectAll();
        if (!includeInactive) q = q.where('is_active', '=', true);
        return q.orderBy(sql`lower(name_en)`).execute();
      });
      res.json({
        items: rows.map((x) => ({
          id: x.id,
          nameAr: x.name_ar,
          nameEn: x.name_en,
          isActive: x.is_active,
          ...('applies_to' in x ? { appliesTo: x.applies_to } : {}),
        })),
      });
    });

    r.post(`/${path}`, requireRoles('stock_manager'), async (req, res) => {
      const ctx = auth(req);
      const input = validate(listItemSchema, req.body);
      const row = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
        const created = await trx
          .insertInto(table)
          .values({
            wholesaler_id: ctx.wholesalerId,
            name_ar: input.nameAr,
            name_en: input.nameEn,
            ...(table === 'categories' && input.appliesTo ? { applies_to: input.appliesTo } : {}),
          })
          .returning(['id'])
          .executeTakeFirstOrThrow();
        await logActivity(trx, actorOf(ctx), { action: `${table}_added`, entityType: table, entityId: created.id, details: input });
        return created;
      });
      res.status(201).json({ id: row.id, ...input });
    });

    r.patch(`/${path}/:id`, requireRoles('stock_manager'), async (req, res) => {
      const ctx = auth(req);
      const id = param(req, 'id');
      const input = validate(updateListItemSchema, req.body);
      await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
        const updated = await trx
          .updateTable(table)
          .set({
            ...(input.nameAr !== undefined && { name_ar: input.nameAr }),
            ...(input.nameEn !== undefined && { name_en: input.nameEn }),
            ...(input.isActive !== undefined && { is_active: input.isActive }),
            ...(table === 'categories' && input.appliesTo ? { applies_to: input.appliesTo } : {}),
          })
          .where('id', '=', id)
          .returning('id')
          .executeTakeFirst();
        if (!updated) throw errors.notFound();
        await logActivity(trx, actorOf(ctx), { action: `${table}_changed`, entityType: table, entityId: id, details: input });
      });
      res.json({ ok: true });
    });
  }

  // Products (OWN-06). Customers see a limited view (C-56).
  r.get('/products', requireLogin, async (req, res) => {
    const ctx = auth(req);
    const { page, limit, offset } = pageOf(req);
    const str = (k: string) => (typeof req.query[k] === 'string' ? (req.query[k] as string).trim() : undefined);
    const uuid = (k: string) => {
      const v = str(k);
      return v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined;
    };
    const result = await withTenant(res.locals.db, ctx.wholesalerId, (trx) =>
      listProducts(trx, ctx.wholesalerId, viewerOf(req), {
        search: str('q')?.slice(0, 100),
        type: str('type'),
        categoryId: uuid('categoryId'),
        brandId: uuid('brandId'),
        status: str('status'),
        limit,
        offset,
      }),
    );
    res.json({ items: result.items, page, limit, total: result.total });
  });

  r.get('/products/:id', requireLogin, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    res.json(await withTenant(res.locals.db, ctx.wholesalerId, (trx) => getProduct(trx, ctx.wholesalerId, viewerOf(req), id)));
  });

  r.post('/products', requireRoles('stock_manager'), async (req, res) => {
    const ctx = auth(req);
    const input = validate(createProductSchema, req.body);
    const product = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const id = await createProduct(trx, actorOf(ctx), input);
      return getProduct(trx, ctx.wholesalerId, viewerOf(req), id);
    });
    res.status(201).json(product);
  });

  // Prices are not changed here (C-64)
  r.patch('/products/:id', requireRoles('stock_manager'), async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const input = validate(updateProductSchema, req.body);
    const product = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      await updateProduct(trx, actorOf(ctx), id, input);
      return getProduct(trx, ctx.wholesalerId, viewerOf(req), id);
    });
    res.json(product);
  });

  r.patch('/products/:id/price', requireOwner, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const input = validate(priceChangeSchema, req.body);
    const product = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      await changePrices(trx, actorOf(ctx), id, input);
      return getProduct(trx, ctx.wholesalerId, viewerOf(req), id);
    });
    res.json(product);
  });

  r.get('/products/:id/price-history', requireRoles('stock_manager', 'accountant'), async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const rows = await withTenant(res.locals.db, ctx.wholesalerId, (trx) =>
      trx
        .selectFrom('price_history as h')
        .leftJoin('employees as e', 'e.user_id', 'h.changed_by')
        .select(['h.price_type', 'h.old_price', 'h.new_price', 'h.changed_at', 'e.name'])
        .where('h.product_id', '=', id)
        .orderBy('h.changed_at', 'desc')
        .limit(50)
        .execute(),
    );
    res.json({ items: rows.map((h) => ({ priceType: h.price_type, oldPrice: h.old_price, newPrice: h.new_price, changedAt: h.changed_at, changedBy: h.name })) });
  });

  for (const [action, active] of [['deactivate', false], ['activate', true]] as const) {
    r.post(`/products/:id/${action}`, requireRoles('stock_manager'), async (req, res) => {
      const ctx = auth(req);
      const id = param(req, 'id');
      const product = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
        const row = await trx.updateTable('products').set({ is_active: active, updated_at: new Date() }).where('id', '=', id).returning('name_en').executeTakeFirst();
        if (!row) throw errors.notFound();
        await logActivity(trx, actorOf(ctx), { action: `product_${action}d`, entityType: 'product', entityId: id, details: { nameEn: row.name_en } });
        return getProduct(trx, ctx.wholesalerId, viewerOf(req), id);
      });
      res.json(product);
    });
  }

  // Extra fields (C-71, OWN-15)
  const extraOut = (f: { id: string; name_ar: string; name_en: string; field_type: string; choices: string[]; applies_to: string; is_required: boolean; shown_to_customers: boolean; is_active: boolean; sort_order: number }) => ({
    id: f.id,
    nameAr: f.name_ar,
    nameEn: f.name_en,
    fieldType: f.field_type,
    choices: f.choices,
    appliesTo: f.applies_to,
    isRequired: f.is_required,
    shownToCustomers: f.shown_to_customers,
    isActive: f.is_active,
    sortOrder: f.sort_order,
  });

  r.get('/extra-fields', requireRoles('stock_manager'), async (req, res) => {
    const ctx = auth(req);
    const rows = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const fields = await trx.selectFrom('extra_fields').selectAll().orderBy('sort_order').orderBy('created_at').execute();
      const s = await trx.selectFrom('settings').select('max_extra_fields').executeTakeFirstOrThrow();
      return { fields, max: s.max_extra_fields };
    });
    res.json({ items: rows.fields.map(extraOut), max: rows.max });
  });

  r.post('/extra-fields', requireOwner, async (req, res) => {
    const ctx = auth(req);
    const input = validate(extraFieldSchema, req.body);
    const row = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const s = await trx.selectFrom('settings').select('max_extra_fields').executeTakeFirstOrThrow();
      const count = await trx.selectFrom('extra_fields').select((eb) => eb.fn.countAll<string>().as('n')).where('is_active', '=', true).executeTakeFirstOrThrow();
      if (Number(count.n) >= s.max_extra_fields) {
        throw errors.rule({ en: `You can have up to ${s.max_extra_fields} extra fields`, ar: `يمكنك إضافة حتى ${s.max_extra_fields} حقلاً إضافياً` });
      }
      const created = await trx
        .insertInto('extra_fields')
        .values({
          wholesaler_id: ctx.wholesalerId,
          name_ar: input.nameAr,
          name_en: input.nameEn,
          field_type: input.fieldType,
          choices: JSON.stringify(input.fieldType === 'choice' ? input.choices : []),
          applies_to: input.appliesTo,
          is_required: input.isRequired,
          shown_to_customers: input.shownToCustomers,
          sort_order: Number(count.n),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await logActivity(trx, actorOf(ctx), { action: 'extra_field_added', entityType: 'extra_field', entityId: created.id, details: { nameEn: input.nameEn } });
      return created;
    });
    res.status(201).json(extraOut(row));
  });

  // A field is never deleted, only switched off. Old values stay (C-71).
  r.patch('/extra-fields/:id', requireOwner, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    const input = validate(updateExtraFieldSchema, req.body);
    const row = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const before = await trx.selectFrom('extra_fields').selectAll().where('id', '=', id).executeTakeFirst();
      if (!before) throw errors.notFound();
      if (input.isActive === true && !before.is_active) {
        const s = await trx.selectFrom('settings').select('max_extra_fields').executeTakeFirstOrThrow();
        const count = await trx.selectFrom('extra_fields').select((eb) => eb.fn.countAll<string>().as('n')).where('is_active', '=', true).executeTakeFirstOrThrow();
        if (Number(count.n) >= s.max_extra_fields) throw errors.rule({ en: 'The limit of extra fields is reached', ar: 'تم الوصول للحد الأقصى من الحقول الإضافية' });
      }
      if (input.choices && before.field_type === 'choice' && input.choices.length < 2) throw errors.validation({ fields: { choices: 'choices_needed' } });
      const updated = await trx
        .updateTable('extra_fields')
        .set({
          ...(input.nameAr !== undefined && { name_ar: input.nameAr }),
          ...(input.nameEn !== undefined && { name_en: input.nameEn }),
          ...(input.choices !== undefined && before.field_type === 'choice' && { choices: JSON.stringify(input.choices) }),
          ...(input.isRequired !== undefined && { is_required: input.isRequired }),
          ...(input.shownToCustomers !== undefined && { shown_to_customers: input.shownToCustomers }),
          ...(input.isActive !== undefined && { is_active: input.isActive }),
          ...(input.sortOrder !== undefined && { sort_order: input.sortOrder }),
        })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();
      await logActivity(trx, actorOf(ctx), { action: 'extra_field_changed', entityType: 'extra_field', entityId: id, details: input });
      return updated;
    });
    res.json(extraOut(row));
  });

  // Offers (C-41, OWN-13)
  r.get('/offers', requireLogin, async (req, res) => {
    const ctx = auth(req);
    const rows = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const w = await trx.selectFrom('wholesalers').select('time_zone').where('id', '=', ctx.wholesalerId).executeTakeFirstOrThrow();
      const today = todayIn(w.time_zone);
      let q = trx
        .selectFrom('offers as o')
        .innerJoin('products as p', 'p.id', 'o.product_id')
        .select(['o.id', 'o.product_id', 'o.offer_type', 'o.discount_percent', 'o.buy_quantity', 'o.free_quantity', 'o.starts_on', 'o.ends_on', 'p.name_ar', 'p.name_en'])
        .where('o.is_active', '=', true)
        .where('p.is_active', '=', true);
      // Customers see only offers that apply today
      if (ctx.userType === 'customer') {
        q = q
          .where((eb) => eb.or([eb('o.starts_on', 'is', null), eb('o.starts_on', '<=', today)]))
          .where((eb) => eb.or([eb('o.ends_on', 'is', null), eb('o.ends_on', '>=', today)]));
      }
      return q.orderBy('o.created_at', 'desc').limit(200).execute();
    });
    res.json({
      items: rows.map((o) => ({
        id: o.id,
        productId: o.product_id,
        product: { nameAr: o.name_ar, nameEn: o.name_en },
        offerType: o.offer_type,
        discountPercent: o.discount_percent,
        buyQuantity: o.buy_quantity,
        freeQuantity: o.free_quantity,
        startsOn: o.starts_on,
        endsOn: o.ends_on,
      })),
    });
  });

  r.post('/offers', requireOwner, async (req, res) => {
    const ctx = auth(req);
    const input = validate(offerSchema, req.body);
    const created = await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const product = await trx.selectFrom('products').select(['id', 'name_en']).where('id', '=', input.productId).executeTakeFirst();
      if (!product) throw errors.notFound();
      // One offer per product at a time (C-41). Ended offers are switched off first.
      const w = await trx.selectFrom('wholesalers').select('time_zone').where('id', '=', ctx.wholesalerId).executeTakeFirstOrThrow();
      const today = todayIn(w.time_zone);
      await trx
        .updateTable('offers')
        .set({ is_active: false, stopped_at: new Date() })
        .where('product_id', '=', product.id)
        .where('is_active', '=', true)
        .where('ends_on', '<', today)
        .execute();
      const existing = await trx.selectFrom('offers').select('id').where('product_id', '=', product.id).where('is_active', '=', true).executeTakeFirst();
      if (existing) {
        throw errors.rule({ en: 'This product already has an offer. Stop it first', ar: 'هذا المنتج عليه عرض بالفعل. أوقفه أولاً' });
      }
      const row = await trx
        .insertInto('offers')
        .values({
          wholesaler_id: ctx.wholesalerId,
          product_id: product.id,
          offer_type: input.offerType,
          discount_percent: input.offerType === 'discount' ? input.discountPercent : null,
          buy_quantity: input.offerType === 'bonus' ? input.buyQuantity : null,
          free_quantity: input.offerType === 'bonus' ? input.freeQuantity : null,
          starts_on: input.startsOn ?? null,
          ends_on: input.endsOn ?? null,
          created_by: ctx.userId,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await logActivity(trx, actorOf(ctx), { action: 'offer_created', entityType: 'product', entityId: product.id, details: { ...input } });
      return row;
    });
    res.status(201).json({ id: created.id });
  });

  r.post('/offers/:id/stop', requireOwner, async (req, res) => {
    const ctx = auth(req);
    const id = param(req, 'id');
    await withTenant(res.locals.db, ctx.wholesalerId, async (trx) => {
      const row = await trx
        .updateTable('offers')
        .set({ is_active: false, stopped_at: new Date() })
        .where('id', '=', id)
        .where('is_active', '=', true)
        .returning('product_id')
        .executeTakeFirst();
      if (!row) throw errors.notFound();
      await logActivity(trx, actorOf(ctx), { action: 'offer_stopped', entityType: 'product', entityId: row.product_id, details: { offerId: id } });
    });
    res.json({ ok: true });
  });

  return r;
}
