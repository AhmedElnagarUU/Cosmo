'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { EXTRA_FIELD_TYPES } from '@cosmo/shared';
import { get, patch, post } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { useName, type ExtraField } from '@/lib/catalog';
import { Badge, Card, ErrorBox, Field, Loading, PageTitle } from '@/components/ui';

// C-71, OWN-15: the owner adds product fields, up to the limit in the settings
export default function ExtraFieldsPage() {
  const t = useTranslations('extraFields');
  const tL = useTranslations('lists');
  const tP = useTranslations('products');
  const name = useName();
  const { data, reload } = useLoad(() => get<{ items: ExtraField[]; max: number }>('/extra-fields'));
  const empty = { nameAr: '', nameEn: '', fieldType: 'text' as ExtraField['fieldType'], choices: '', appliesTo: 'both' as ExtraField['appliesTo'], isRequired: false, shownToCustomers: false };
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <Loading />;
  return (
    <div className="space-y-4">
      <PageTitle>{t('title')}</PageTitle>
      <p className="muted text-sm">{t('help', { max: data.max })}</p>
      <Card className="space-y-3">
        <h2 className="font-bold">{t('add')}</h2>
        <ErrorBox error={error} />
        <form
          className="grid gap-3 md:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() =>
              post('/extra-fields', {
                ...form,
                choices: form.fieldType === 'choice' ? form.choices.split('\n').map((c) => c.trim()).filter(Boolean) : [],
              }),
            );
            if (ok) setForm(empty);
          }}
        >
          <Field label={tP('nameAr')} required value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} />
          <Field label={tP('nameEn')} required dir="ltr" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('fieldType')}</span>
            <select className="field" value={form.fieldType} onChange={(e) => setForm({ ...form, fieldType: e.target.value as ExtraField['fieldType'] })}>
              {EXTRA_FIELD_TYPES.map((k) => (
                <option key={k} value={k}>
                  {t(k)}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">{tL('appliesTo')}</span>
            <select className="field" value={form.appliesTo} onChange={(e) => setForm({ ...form, appliesTo: e.target.value as ExtraField['appliesTo'] })}>
              <option value="both">{tL('both')}</option>
              <option value="medicine">{tP('medicine')}</option>
              <option value="cosmetic">{tP('cosmetic')}</option>
            </select>
          </label>
          {form.fieldType === 'choice' && (
            <label className="block space-y-1 md:col-span-2">
              <span className="text-sm font-medium">{t('choices')}</span>
              <textarea className="field min-h-24" required value={form.choices} onChange={(e) => setForm({ ...form, choices: e.target.value })} />
            </label>
          )}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.isRequired} onChange={(e) => setForm({ ...form, isRequired: e.target.checked })} />
            {t('required')}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.shownToCustomers} onChange={(e) => setForm({ ...form, shownToCustomers: e.target.checked })} />
            {t('shown')}
          </label>
          <div>
            <button className="btn btn-primary" disabled={busy}>
              {t('add')}
            </button>
          </div>
        </form>
      </Card>
      <div className="space-y-2">
        {data.items.map((f) => (
          <Card key={f.id} className="flex flex-wrap items-center justify-between gap-2">
            <div className={f.isActive ? '' : 'muted'}>
              <div className="font-semibold">{name(f)}</div>
              <div className="flex flex-wrap gap-1 text-sm">
                <Badge>{t(f.fieldType)}</Badge>
                {f.appliesTo !== 'both' && <Badge>{tP(f.appliesTo)}</Badge>}
                {f.isRequired && <Badge tone="teal">{t('required')}</Badge>}
                {f.shownToCustomers && <Badge tone="green">{t('shown')}</Badge>}
                {!f.isActive && <Badge tone="red">{t('off')}</Badge>}
              </div>
              {f.fieldType === 'choice' && <div className="muted text-xs">{f.choices.join(' · ')}</div>}
            </div>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => run(() => patch(`/extra-fields/${f.id}`, { isActive: !f.isActive }))}>
              {f.isActive ? t('switchOff') : t('switchOn')}
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}
