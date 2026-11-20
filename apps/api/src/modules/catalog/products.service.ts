import { sql } from 'kysely';
import { normalizeSearch, type CreateProductInput, type Role, type UpdateProductInput } from '@cosmo/shared';
import type { Trx } from '../../core/db';
import { errors } from '../../core/errors';
import { logActivity, type Actor } from '../../core/activity';
import { createStockFor, todayIn } from '../stock/stock.service';

// Who sees the cost price: owner, accountant, and stock manager (docs/workflows/10-product-fields.md)
export const seesCost = (roles: Role[]) => roles.some((r) => r === 'owner' || r === 'accountant' || r === 'stock_manager');
export const seesStockNumbers = (roles: Role[]) => roles.some((r) => r === 'owner' || r === 'stock_manager' || r === 'sales');

export interface Viewer {
  kind: 'customer' | 'employee';
  roles: Role[];
}

function searchText(p: { nameAr: string; nameEn: string; barcode: string | null }, activeIngredient?: string | null) {
  return normalizeSearch([p.nameAr, p.nameEn, p.barcode ?? '', activeIngredient ?? ''].join(' '));
}

async function checkLists(trx: Trx, input: { brandId: string; categoryId: string; productType: 'medicine' | 'cosmetic'; dosageFormId?: string }) {
  const brand = await trx.selectFrom('brands').select('id').where('id', '=', input.brandId).where('is_active', '=', true).executeTakeFirst();
  if (!brand) throw errors.rule({ en: 'Choose an active brand', ar: 'اختر علامة تجارية نشطة' }, { field: 'brandId' });
  const cat = await trx.selectFrom('categories').select(['id', 'applies_to']).where('id', '=', input.categoryId).where('is_active', '=', true).executeTakeFirst();
  if (!cat || (cat.applies_to !== 'both' && cat.applies_to !== input.productType)) {
    throw errors.rule({ en: 'Choose a category for this product type', ar: 'اختر فئة مناسبة لنوع المنتج' }, { field: 'categoryId' });
  }
  if (input.dosageFormId) {
    const df = await trx.selectFrom('dosage_forms').select('id').where('id', '=', input.dosageFormId).where('is_active', '=', true).executeTakeFirst();
    if (!df) throw errors.rule({ en: 'Choose an active dosage form', ar: 'اختر شكلاً دوائياً نشطاً' }, { field: 'medicine.dosageFormId' });
  }
}

async function barcodeIsFree(trx: Trx, barcode: string | null, exceptId?: string) {
  if (!barcode) return;
  let q = trx.selectFrom('products').select('id').where('barcode', '=', barcode);
  if (exceptId) q = q.where('id', '!=', exceptId);
  if (await q.executeTakeFirst()) {
    throw errors.rule({ en: 'Another product has this barcode', ar: 'يوجد منتج آخر بنفس الباركود' }, { field: 'barcode' });
  }
}

// C-71: values are checked against each field's type. Required fields must be filled on create and edit.
async function saveExtraValues(
  trx: Trx,
  wholesalerId: string,
  productId: string,
  productType: 'medicine' | 'cosmetic',
  values: Record<string, string>,
) {
  const fields = await trx
    .selectFrom('extra_fields')
    .selectAll()
    .where('is_active', '=', true)
    .where('applies_to', 'in', [productType, 'both'])
    .execute();
  const problems: Record<string, string> = {};
  for (const id of Object.keys(values)) {
    if (!fields.some((f) => f.id === id)) problems[`extraValues.${id}`] = 'unknown_field';
  }
  for (const f of fields) {
    const v = (values[f.id] ?? '').trim();
    const key = `extraValues.${f.id}`;
    if (!v) {
      if (f.is_required) problems[key] = 'required';
      continue;
    }
    if (f.field_type === 'number' && !/^-?\d+(\.\d+)?$/.test(v)) problems[key] = 'invalid_number';
    if (f.field_type === 'yes_no' && v !== 'yes' && v !== 'no') problems[key] = 'invalid_yes_no';
    if (f.field_type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) problems[key] = 'invalid_date';
    if (f.field_type === 'choice' && !(f.choices as string[]).includes(v)) problems[key] = 'invalid_choice';
  }
  if (Object.keys(problems).length > 0) throw errors.validation({ fields: problems });

  await trx.deleteFrom('extra_field_values').where('product_id', '=', productId).execute();
  const rows = fields
    .filter((f) => (values[f.id] ?? '').trim())
    .map((f) => ({ product_id: productId, extra_field_id: f.id, wholesaler_id: wholesalerId, value: values[f.id]!.trim() }));
  if (rows.length) await trx.insertInto('extra_field_values').values(rows).execute();
}

export async function createProduct(trx: Trx, actor: Actor, input: CreateProductInput) {
  await checkLists(trx, {
    brandId: input.brandId,
    categoryId: input.categoryId,
    productType: input.productType,
    dosageFormId: input.productType === 'medicine' ? input.medicine.dosageFormId : undefined,
  });
  await barcodeIsFree(trx, input.barcode);
  const activeIngredient = input.productType === 'medicine' ? input.medicine.activeIngredient : null;
  const product = await trx
    .insertInto('products')
    .values({
      wholesaler_id: actor.wholesalerId,
      product_type: input.productType,
      name_ar: input.nameAr,
      name_en: input.nameEn,
      barcode: input.barcode,
      brand_id: input.brandId,
      category_id: input.categoryId,
      unit: input.unit,
      pack_size: input.packSize,
      cost_price: input.costPrice,
      selling_price: input.sellingPrice,
      description: input.description,
      track_batches: input.trackBatches,
      search_text: searchText(input, activeIngredient),
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  if (input.productType === 'medicine') {
    const m = input.medicine;
    await trx
      .insertInto('medicine_details')
      .values({
        product_id: product.id,
        wholesaler_id: actor.wholesalerId,
        active_ingredient: m.activeIngredient,
        strength: m.strength,
        dosage_form_id: m.dosageFormId,
        storage: m.storage,
        public_price: m.publicPrice,
        registration_number: m.registrationNumber,
        needs_prescription: m.needsPrescription,
      })
      .execute();
  } else {
    const c = input.cosmetic;
    await trx
      .insertInto('cosmetic_details')
      .values({
        product_id: product.id,
        wholesaler_id: actor.wholesalerId,
        shade_name: c.shadeName,
        shade_number: c.shadeNumber,
        suitable_for: c.suitableFor,
        period_after_opening_months: c.periodAfterOpeningMonths,
      })
      .execute();
  }
  await saveExtraValues(trx, actor.wholesalerId, product.id, input.productType, input.extraValues);
  await trx
    .insertInto('price_history')
    .values([
      { wholesaler_id: actor.wholesalerId, product_id: product.id, price_type: 'selling', old_price: null, new_price: input.sellingPrice, changed_by: actor.userId },
      { wholesaler_id: actor.wholesalerId, product_id: product.id, price_type: 'cost', old_price: null, new_price: input.costPrice, changed_by: actor.userId },
    ])
    .execute();
  await createStockFor(trx, actor.wholesalerId, product.id, input.trackBatches);
  await logActivity(trx, actor, { action: 'product_created', entityType: 'product', entityId: product.id, details: { nameEn: input.nameEn } });
  return product.id;
}

export async function updateProduct(trx: Trx, actor: Actor, id: string, input: UpdateProductInput) {
  const before = await trx.selectFrom('products').selectAll().where('id', '=', id).executeTakeFirst();
  if (!before) throw errors.notFound();
  if (before.product_type === 'medicine' && !input.medicine) throw errors.validation({ fields: { medicine: 'required' } });
  await checkLists(trx, {
    brandId: input.brandId,
    categoryId: input.categoryId,
    productType: before.product_type,
    dosageFormId: input.medicine?.dosageFormId,
  });
  await barcodeIsFree(trx, input.barcode, id);

  // Batch tracking can change only while the product has no stock
  if (input.trackBatches !== undefined && input.trackBatches !== before.track_batches) {
    const has = await trx
      .selectFrom('batches')
      .select('id')
      .where('product_id', '=', id)
      .where((eb) => eb.or([eb('qty_sellable', '>', 0), eb('qty_damaged', '>', 0), eb('qty_expired', '>', 0), eb('qty_held', '>', 0)]))
      .executeTakeFirst();
    if (has) {
      throw errors.rule({ en: 'Batch tracking can change only while the product has no stock', ar: 'لا يمكن تغيير تتبع التشغيلات إلا والمنتج بدون مخزون' }, { field: 'trackBatches' });
    }
    const def = await trx.selectFrom('batches').select('id').where('product_id', '=', id).where('batch_number', 'is', null).executeTakeFirst();
    if (!input.trackBatches && !def) {
      await trx.insertInto('batches').values({ wholesaler_id: actor.wholesalerId, product_id: id }).execute();
    }
  }

  const activeIngredient = before.product_type === 'medicine' ? input.medicine!.activeIngredient : null;
  await trx
    .updateTable('products')
    .set({
      name_ar: input.nameAr,
      name_en: input.nameEn,
      barcode: input.barcode,
      brand_id: input.brandId,
      category_id: input.categoryId,
      unit: input.unit,
      pack_size: input.packSize,
      description: input.description,
      ...(input.trackBatches !== undefined && { track_batches: input.trackBatches }),
      search_text: searchText(input, activeIngredient),
      updated_at: new Date(),
    })
    .where('id', '=', id)
    .execute();

  if (before.product_type === 'medicine') {
    const m = input.medicine!;
    await trx
      .updateTable('medicine_details')
      .set({
        active_ingredient: m.activeIngredient,
        strength: m.strength,
        dosage_form_id: m.dosageFormId,
        storage: m.storage,
        public_price: m.publicPrice,
        registration_number: m.registrationNumber,
        needs_prescription: m.needsPrescription,
      })
      .where('product_id', '=', id)
      .execute();
  } else if (input.cosmetic) {
    const c = input.cosmetic;
    await trx
      .updateTable('cosmetic_details')
      .set({
        shade_name: c.shadeName,
        shade_number: c.shadeNumber,
        suitable_for: c.suitableFor,
        period_after_opening_months: c.periodAfterOpeningMonths,
      })
      .where('product_id', '=', id)
      .execute();
  }
  await saveExtraValues(trx, actor.wholesalerId, id, before.product_type, input.extraValues);
  await logActivity(trx, actor, { action: 'product_changed', entityType: 'product', entityId: id, details: { nameEn: input.nameEn } });
}

// OWN-07: only the owner. New orders use the new price. Old orders keep theirs.
export async function changePrices(trx: Trx, actor: Actor, id: string, input: { sellingPrice?: string; costPrice?: string }) {
  const p = await trx.selectFrom('products').select(['selling_price', 'cost_price', 'name_en', 'name_ar']).where('id', '=', id).executeTakeFirst();
  if (!p) throw errors.notFound();
  const changes: Array<{ type: 'selling' | 'cost'; old: string; next: string }> = [];
  if (input.sellingPrice !== undefined && Number(input.sellingPrice) !== Number(p.selling_price)) changes.push({ type: 'selling', old: p.selling_price, next: input.sellingPrice });
  if (input.costPrice !== undefined && Number(input.costPrice) !== Number(p.cost_price)) changes.push({ type: 'cost', old: p.cost_price, next: input.costPrice });
  if (!changes.length) return;
  await trx
    .updateTable('products')
    .set({
      ...(changes.some((c) => c.type === 'selling') && { selling_price: input.sellingPrice }),
      ...(changes.some((c) => c.type === 'cost') && { cost_price: input.costPrice }),
      updated_at: new Date(),
    })
    .where('id', '=', id)
    .execute();
  await trx
    .insertInto('price_history')
    .values(changes.map((c) => ({ wholesaler_id: actor.wholesalerId, product_id: id, price_type: c.type, old_price: c.old, new_price: c.next, changed_by: actor.userId })))
    .execute();
  await logActivity(trx, actor, {
    action: 'price_changed',
    entityType: 'product',
    entityId: id,
    details: Object.fromEntries(changes.map((c) => [c.type, { before: c.old, after: c.next }])),
  });
}

// The offer that applies today: active, started, and not ended
export function offerIsCurrent(o: { is_active: boolean; starts_on: string | null; ends_on: string | null }, today: string) {
  return o.is_active && (!o.starts_on || o.starts_on <= today) && (!o.ends_on || o.ends_on >= today);
}

function offerOut(o: { id: string; offer_type: 'discount' | 'bonus'; discount_percent: string | null; buy_quantity: number | null; free_quantity: number | null; starts_on: string | null; ends_on: string | null }) {
  return {
    id: o.id,
    offerType: o.offer_type,
    discountPercent: o.discount_percent,
    buyQuantity: o.buy_quantity,
    freeQuantity: o.free_quantity,
    startsOn: o.starts_on,
    endsOn: o.ends_on,
  };
}

export async function listProducts(
  trx: Trx,
  wholesalerId: string,
  viewer: Viewer,
  q: { search?: string; type?: string; categoryId?: string; brandId?: string; status?: string; limit: number; offset: number },
) {
  const w = await trx.selectFrom('wholesalers').select('time_zone').where('id', '=', wholesalerId).executeTakeFirstOrThrow();
  const today = todayIn(w.time_zone);
  let base = trx
    .selectFrom('products as p')
    .innerJoin('brands as b', 'b.id', 'p.brand_id')
    .innerJoin('categories as c', 'c.id', 'p.category_id')
    .innerJoin('product_stock as s', 's.product_id', 'p.id')
    .leftJoin('medicine_details as m', 'm.product_id', 'p.id');
  // Customers see only active products (C-56)
  if (viewer.kind === 'customer' || q.status !== 'all') base = base.where('p.is_active', '=', viewer.kind === 'customer' || q.status !== 'inactive');
  if (q.type === 'medicine' || q.type === 'cosmetic') base = base.where('p.product_type', '=', q.type);
  if (q.categoryId) base = base.where('p.category_id', '=', q.categoryId);
  if (q.brandId) base = base.where('p.brand_id', '=', q.brandId);
  if (q.search) {
    const term = normalizeSearch(q.search);
    if (term) base = base.where('p.search_text', 'like', `%${term.replace(/[%_\\]/g, (m) => '\\' + m)}%`);
  }

  const rows = await base
    .select([
      'p.id', 'p.product_type', 'p.name_ar', 'p.name_en', 'p.barcode', 'p.unit', 'p.pack_size', 'p.cost_price',
      'p.selling_price', 'p.is_active', 'p.track_batches', 'b.name_ar as brand_ar', 'b.name_en as brand_en',
      'c.name_ar as category_ar', 'c.name_en as category_en', 's.on_hand_sellable', 's.reserved', 'm.strength',
      'm.storage', 'm.public_price', 'm.active_ingredient',
    ])
    .orderBy(sql`lower(p.name_en)`)
    .limit(q.limit)
    .offset(q.offset)
    .execute();
  const total = await base.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow();

  const ids = rows.map((r) => r.id);
  const offers = ids.length ? await trx.selectFrom('offers').selectAll().where('product_id', 'in', ids).where('is_active', '=', true).execute() : [];

  const showCost = viewer.kind === 'employee' && seesCost(viewer.roles);
  const showNumbers = viewer.kind === 'employee' && seesStockNumbers(viewer.roles);
  return {
    total: Number(total.n),
    items: rows.map((r) => {
      const available = r.on_hand_sellable - r.reserved;
      const offer = offers.find((o) => o.product_id === r.id && offerIsCurrent(o, today));
      return {
        id: r.id,
        productType: r.product_type,
        nameAr: r.name_ar,
        nameEn: r.name_en,
        barcode: r.barcode,
        brand: { nameAr: r.brand_ar, nameEn: r.brand_en },
        category: { nameAr: r.category_ar, nameEn: r.category_en },
        unit: r.unit,
        packSize: r.pack_size,
        strength: r.strength,
        activeIngredient: r.active_ingredient,
        sellingPrice: r.selling_price,
        publicPrice: r.public_price,
        keepCold: r.storage === 'fridge',
        ...(showCost && { costPrice: r.cost_price }),
        ...(viewer.kind === 'employee' && { isActive: r.is_active, trackBatches: r.track_batches }),
        // Customers see only "in stock" or "out of stock" (C-56)
        inStock: available > 0,
        ...(showNumbers && { stock: { onHand: r.on_hand_sellable, reserved: r.reserved, available } }),
        offer: offer ? offerOut(offer) : null,
      };
    }),
  };
}

export async function getProduct(trx: Trx, wholesalerId: string, viewer: Viewer, id: string) {
  const p = await trx
    .selectFrom('products as p')
    .innerJoin('brands as b', 'b.id', 'p.brand_id')
    .innerJoin('categories as c', 'c.id', 'p.category_id')
    .innerJoin('product_stock as s', 's.product_id', 'p.id')
    .selectAll('p')
    .select(['b.name_ar as brand_ar', 'b.name_en as brand_en', 'c.name_ar as category_ar', 'c.name_en as category_en', 's.on_hand_sellable', 's.reserved', 's.held'])
    .where('p.id', '=', id)
    .executeTakeFirst();
  if (!p || (viewer.kind === 'customer' && !p.is_active)) throw errors.notFound();

  const medicine =
    p.product_type === 'medicine'
      ? await trx
          .selectFrom('medicine_details as m')
          .innerJoin('dosage_forms as d', 'd.id', 'm.dosage_form_id')
          .selectAll('m')
          .select(['d.name_ar as form_ar', 'd.name_en as form_en'])
          .where('m.product_id', '=', id)
          .executeTakeFirst()
      : undefined;
  const cosmetic = p.product_type === 'cosmetic' ? await trx.selectFrom('cosmetic_details').selectAll().where('product_id', '=', id).executeTakeFirst() : undefined;

  let extraQ = trx
    .selectFrom('extra_field_values as v')
    .innerJoin('extra_fields as f', 'f.id', 'v.extra_field_id')
    .select(['f.id', 'f.name_ar', 'f.name_en', 'f.field_type', 'v.value'])
    .where('v.product_id', '=', id)
    .where('f.is_active', '=', true)
    .orderBy('f.sort_order');
  if (viewer.kind === 'customer') extraQ = extraQ.where('f.shown_to_customers', '=', true);
  const extras = await extraQ.execute();

  const w = await trx.selectFrom('wholesalers').select('time_zone').where('id', '=', wholesalerId).executeTakeFirstOrThrow();
  const today = todayIn(w.time_zone);
  const offers = await trx.selectFrom('offers').selectAll().where('product_id', '=', id).orderBy('created_at', 'desc').limit(10).execute();
  const current = offers.find((o) => offerIsCurrent(o, today));

  const showCost = viewer.kind === 'employee' && seesCost(viewer.roles);
  const showNumbers = viewer.kind === 'employee' && seesStockNumbers(viewer.roles);
  const available = p.on_hand_sellable - p.reserved;
  return {
    id: p.id,
    productType: p.product_type,
    nameAr: p.name_ar,
    nameEn: p.name_en,
    barcode: p.barcode,
    brandId: p.brand_id,
    categoryId: p.category_id,
    brand: { nameAr: p.brand_ar, nameEn: p.brand_en },
    category: { nameAr: p.category_ar, nameEn: p.category_en },
    unit: p.unit,
    packSize: p.pack_size,
    sellingPrice: p.selling_price,
    ...(showCost && { costPrice: p.cost_price }),
    description: p.description,
    ...(viewer.kind === 'employee' && { trackBatches: p.track_batches, isActive: p.is_active }),
    keepCold: medicine?.storage === 'fridge',
    medicine: medicine
      ? {
          activeIngredient: medicine.active_ingredient,
          strength: medicine.strength,
          dosageFormId: medicine.dosage_form_id,
          dosageForm: { nameAr: medicine.form_ar, nameEn: medicine.form_en },
          storage: medicine.storage,
          publicPrice: medicine.public_price,
          registrationNumber: viewer.kind === 'employee' ? medicine.registration_number : undefined,
          needsPrescription: medicine.needs_prescription,
        }
      : null,
    cosmetic: cosmetic
      ? {
          shadeName: cosmetic.shade_name,
          shadeNumber: cosmetic.shade_number,
          suitableFor: cosmetic.suitable_for,
          periodAfterOpeningMonths: cosmetic.period_after_opening_months,
        }
      : null,
    extraValues: Object.fromEntries(extras.map((e) => [e.id, e.value])),
    extraFields: extras.map((e) => ({ id: e.id, nameAr: e.name_ar, nameEn: e.name_en, fieldType: e.field_type, value: e.value })),
    inStock: available > 0,
    ...(showNumbers && { stock: { onHand: p.on_hand_sellable, reserved: p.reserved, held: p.held, available } }),
    offer: current ? offerOut(current) : null,
    ...(viewer.kind === 'employee' && {
      offers: offers.map((o) => ({ ...offerOut(o), isActive: o.is_active, isCurrent: offerIsCurrent(o, today), stoppedAt: o.stopped_at })),
    }),
  };
}
