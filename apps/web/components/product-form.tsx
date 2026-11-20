'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { get } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { useName, type ExtraField, type ListItem, type Product } from '@/lib/catalog';
import { ErrorBox, Field, fieldError } from './ui';

// One form for "add product" and "edit product" (C-66, C-71).
// Prices are set only when the product is created. Later, only the owner changes them.

export interface ProductFormValue {
  productType: 'medicine' | 'cosmetic';
  nameAr: string;
  nameEn: string;
  barcode: string;
  brandId: string;
  categoryId: string;
  unit: string;
  packSize: string;
  costPrice: string;
  sellingPrice: string;
  description: string;
  trackBatches: boolean;
  medicine: { activeIngredient: string; strength: string; dosageFormId: string; storage: 'room' | 'fridge'; publicPrice: string; registrationNumber: string; needsPrescription: boolean };
  cosmetic: { shadeName: string; shadeNumber: string; suitableFor: string; periodAfterOpeningMonths: string };
  extraValues: Record<string, string>;
}

export const emptyProduct: ProductFormValue = {
  productType: 'medicine',
  nameAr: '',
  nameEn: '',
  barcode: '',
  brandId: '',
  categoryId: '',
  unit: '',
  packSize: '',
  costPrice: '',
  sellingPrice: '',
  description: '',
  trackBatches: true,
  medicine: { activeIngredient: '', strength: '', dosageFormId: '', storage: 'room', publicPrice: '', registrationNumber: '', needsPrescription: false },
  cosmetic: { shadeName: '', shadeNumber: '', suitableFor: '', periodAfterOpeningMonths: '' },
  extraValues: {},
};

export function fromProduct(p: Product): ProductFormValue {
  return {
    productType: p.productType,
    nameAr: p.nameAr,
    nameEn: p.nameEn,
    barcode: p.barcode ?? '',
    brandId: p.brandId,
    categoryId: p.categoryId,
    unit: p.unit,
    packSize: p.packSize,
    costPrice: p.costPrice ?? '',
    sellingPrice: p.sellingPrice,
    description: p.description ?? '',
    trackBatches: p.trackBatches ?? true,
    medicine: p.medicine
      ? {
          activeIngredient: p.medicine.activeIngredient,
          strength: p.medicine.strength,
          dosageFormId: p.medicine.dosageFormId,
          storage: p.medicine.storage,
          publicPrice: p.medicine.publicPrice ?? '',
          registrationNumber: p.medicine.registrationNumber ?? '',
          needsPrescription: !!p.medicine.needsPrescription,
        }
      : emptyProduct.medicine,
    cosmetic: p.cosmetic
      ? {
          shadeName: p.cosmetic.shadeName ?? '',
          shadeNumber: p.cosmetic.shadeNumber ?? '',
          suitableFor: p.cosmetic.suitableFor ?? '',
          periodAfterOpeningMonths: p.cosmetic.periodAfterOpeningMonths ? String(p.cosmetic.periodAfterOpeningMonths) : '',
        }
      : emptyProduct.cosmetic,
    extraValues: { ...p.extraValues },
  };
}

// The request body. The backend checks everything again.
export function toBody(v: ProductFormValue, mode: 'create' | 'edit') {
  const common = {
    nameAr: v.nameAr,
    nameEn: v.nameEn,
    barcode: v.barcode || null,
    brandId: v.brandId,
    categoryId: v.categoryId,
    unit: v.unit,
    packSize: v.packSize,
    description: v.description || null,
    trackBatches: v.trackBatches,
    extraValues: Object.fromEntries(Object.entries(v.extraValues).filter(([, x]) => x.trim() !== '')),
  };
  const details =
    v.productType === 'medicine'
      ? {
          medicine: {
            ...v.medicine,
            publicPrice: v.medicine.publicPrice || null,
            registrationNumber: v.medicine.registrationNumber || null,
          },
        }
      : {
          cosmetic: {
            shadeName: v.cosmetic.shadeName || null,
            shadeNumber: v.cosmetic.shadeNumber || null,
            suitableFor: v.cosmetic.suitableFor || null,
            periodAfterOpeningMonths: v.cosmetic.periodAfterOpeningMonths ? Number(v.cosmetic.periodAfterOpeningMonths) : null,
          },
        };
  return mode === 'create'
    ? { productType: v.productType, ...common, costPrice: v.costPrice, sellingPrice: v.sellingPrice, ...details }
    : { ...common, ...details };
}

function Select({ label, value, onChange, children, error }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode; error?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <select className="field" value={value} onChange={(e) => onChange(e.target.value)} required>
        {children}
      </select>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </label>
  );
}

export function ProductForm({
  value,
  onChange,
  mode,
  error,
}: {
  value: ProductFormValue;
  onChange: (v: ProductFormValue) => void;
  mode: 'create' | 'edit';
  error: unknown;
}) {
  const t = useTranslations('products');
  const tErr = useTranslations('errors');
  const tX = useTranslations('extraFields');
  const name = useName();
  const lists = useLoad(async () => {
    const [b, c, d] = await Promise.all([
      get<{ items: ListItem[] }>('/brands'),
      get<{ items: ListItem[] }>('/categories'),
      get<{ items: ListItem[] }>('/dosage-forms'),
    ]);
    return { brands: b.items, categories: c.items, forms: d.items };
  });
  const extra = useLoad(() => get<{ items: ExtraField[] }>('/extra-fields'));
  const [showErrors] = useState(true);
  const err = (k: string) => (showErrors ? fieldError(error, k, tErr) : undefined);
  const set = (patch: Partial<ProductFormValue>) => onChange({ ...value, ...patch });
  const setMed = (patch: Partial<ProductFormValue['medicine']>) => onChange({ ...value, medicine: { ...value.medicine, ...patch } });
  const setCos = (patch: Partial<ProductFormValue['cosmetic']>) => onChange({ ...value, cosmetic: { ...value.cosmetic, ...patch } });

  const categories = (lists.data?.categories ?? []).filter((c) => c.appliesTo === 'both' || c.appliesTo === value.productType);
  const fields = (extra.data?.items ?? []).filter((f) => f.isActive && (f.appliesTo === 'both' || f.appliesTo === value.productType));

  return (
    <div className="space-y-4">
      <ErrorBox error={error} />
      {mode === 'create' && (
        <div className="flex gap-2">
          {(['medicine', 'cosmetic'] as const).map((k) => (
            <button key={k} type="button" className={`btn flex-1 ${value.productType === k ? 'btn-primary' : 'btn-secondary'}`} onClick={() => set({ productType: k, categoryId: '' })}>
              {t(k)}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t('nameAr')} required value={value.nameAr} onChange={(e) => set({ nameAr: e.target.value })} error={err('nameAr')} />
        <Field label={t('nameEn')} required dir="ltr" value={value.nameEn} onChange={(e) => set({ nameEn: e.target.value })} error={err('nameEn')} />
        <Select label={t('brand')} value={value.brandId} onChange={(v) => set({ brandId: v })} error={err('brandId')}>
          <option value="">{t('choose')}</option>
          {lists.data?.brands.map((b) => (
            <option key={b.id} value={b.id}>
              {name(b)}
            </option>
          ))}
        </Select>
        <Select label={t('category')} value={value.categoryId} onChange={(v) => set({ categoryId: v })} error={err('categoryId')}>
          <option value="">{t('choose')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {name(c)}
            </option>
          ))}
        </Select>
        <Field label={t('unit')} required value={value.unit} onChange={(e) => set({ unit: e.target.value })} error={err('unit')} />
        <Field label={t('packSize')} required value={value.packSize} onChange={(e) => set({ packSize: e.target.value })} error={err('packSize')} />
        <Field label={t('barcode')} dir="ltr" inputMode="numeric" value={value.barcode} onChange={(e) => set({ barcode: e.target.value })} error={err('barcode')} />
        {mode === 'create' && (
          <>
            <Field label={t('costPrice')} required dir="ltr" inputMode="decimal" value={value.costPrice} onChange={(e) => set({ costPrice: e.target.value })} error={err('costPrice')} />
            <Field label={t('sellingPrice')} required dir="ltr" inputMode="decimal" value={value.sellingPrice} onChange={(e) => set({ sellingPrice: e.target.value })} error={err('sellingPrice')} />
          </>
        )}
      </div>

      {value.productType === 'medicine' ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t('activeIngredient')} required dir="ltr" value={value.medicine.activeIngredient} onChange={(e) => setMed({ activeIngredient: e.target.value })} error={err('medicine.activeIngredient')} />
          <Field label={t('strength')} required dir="ltr" value={value.medicine.strength} onChange={(e) => setMed({ strength: e.target.value })} error={err('medicine.strength')} />
          <Select label={t('dosageForm')} value={value.medicine.dosageFormId} onChange={(v) => setMed({ dosageFormId: v })} error={err('medicine.dosageFormId')}>
            <option value="">{t('choose')}</option>
            {lists.data?.forms.map((f) => (
              <option key={f.id} value={f.id}>
                {name(f)}
              </option>
            ))}
          </Select>
          <Select label={t('storage')} value={value.medicine.storage} onChange={(v) => setMed({ storage: v as 'room' | 'fridge' })}>
            <option value="room">{t('room')}</option>
            <option value="fridge">{t('fridge')}</option>
          </Select>
          <Field label={t('publicPrice')} dir="ltr" inputMode="decimal" value={value.medicine.publicPrice} onChange={(e) => setMed({ publicPrice: e.target.value })} error={err('medicine.publicPrice')} />
          <Field label={t('registrationNumber')} dir="ltr" value={value.medicine.registrationNumber} onChange={(e) => setMed({ registrationNumber: e.target.value })} />
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={value.medicine.needsPrescription} onChange={(e) => setMed({ needsPrescription: e.target.checked })} />
            {t('needsPrescription')}
          </label>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t('shadeName')} value={value.cosmetic.shadeName} onChange={(e) => setCos({ shadeName: e.target.value })} />
          <Field label={t('shadeNumber')} dir="ltr" value={value.cosmetic.shadeNumber} onChange={(e) => setCos({ shadeNumber: e.target.value })} />
          <Field label={t('suitableFor')} value={value.cosmetic.suitableFor} onChange={(e) => setCos({ suitableFor: e.target.value })} />
          <Field label={t('periodAfterOpening')} type="number" min={1} max={120} value={value.cosmetic.periodAfterOpeningMonths} onChange={(e) => setCos({ periodAfterOpeningMonths: e.target.value })} />
        </div>
      )}

      {fields.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold">{t('extra')}</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {fields.map((f) => {
              const v = value.extraValues[f.id] ?? '';
              const setV = (x: string) => set({ extraValues: { ...value.extraValues, [f.id]: x } });
              const label = name(f) + (f.isRequired ? ' *' : '');
              const e = err(`extraValues.${f.id}`);
              if (f.fieldType === 'choice' || f.fieldType === 'yes_no') {
                const options = f.fieldType === 'choice' ? f.choices.map((c) => [c, c]) : [['yes', '✓'], ['no', '✗']];
                return (
                  <label key={f.id} className="block space-y-1">
                    <span className="text-sm font-medium">{label}</span>
                    <select className="field" value={v} onChange={(ev) => setV(ev.target.value)} required={f.isRequired}>
                      <option value="">{t('choose')}</option>
                      {options.map(([val, text]) => (
                        <option key={val} value={val}>
                          {f.fieldType === 'yes_no' ? (val === 'yes' ? '✓ ' : '✗ ') + tX(f.fieldType) : text}
                        </option>
                      ))}
                    </select>
                    {e && <span className="text-sm text-red-600">{e}</span>}
                  </label>
                );
              }
              return (
                <Field
                  key={f.id}
                  label={label}
                  type={f.fieldType === 'date' ? 'date' : f.fieldType === 'number' ? 'number' : 'text'}
                  required={f.isRequired}
                  value={v}
                  onChange={(ev) => setV(ev.target.value)}
                  error={e}
                />
              );
            })}
          </div>
        </div>
      )}

      <label className="block space-y-1">
        <span className="text-sm font-medium">{t('description')}</span>
        <textarea className="field min-h-24" value={value.description} onChange={(e) => set({ description: e.target.value })} />
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={value.trackBatches} onChange={(e) => set({ trackBatches: e.target.checked })} />
        {t('trackBatches')}
      </label>
    </div>
  );
}
