'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { get, patch, post } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { useName, type ListItem } from '@/lib/catalog';
import { Badge, Card, ErrorBox, Field, PageTitle } from '@/components/ui';

// C-74: categories, brands, and dosage forms, managed by the owner and the stock manager
function ListEditor({ path, title, withAppliesTo }: { path: string; title: string; withAppliesTo?: boolean }) {
  const t = useTranslations('lists');
  const tP = useTranslations('products');
  const name = useName();
  const { data, reload } = useLoad(() => get<{ items: ListItem[] }>(`/${path}?status=all`), [path]);
  const [form, setForm] = useState({ nameAr: '', nameEn: '', appliesTo: 'both' });
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

  return (
    <Card className="space-y-3">
      <h2 className="font-bold">{title}</h2>
      <ErrorBox error={error} />
      <form
        className="grid gap-2 md:grid-cols-4 md:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run(() => post(`/${path}`, withAppliesTo ? form : { nameAr: form.nameAr, nameEn: form.nameEn }));
          if (ok) setForm({ nameAr: '', nameEn: '', appliesTo: form.appliesTo });
        }}
      >
        <Field label={tP('nameAr')} required value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} />
        <Field label={tP('nameEn')} required dir="ltr" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
        {withAppliesTo && (
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('appliesTo')}</span>
            <select className="field" value={form.appliesTo} onChange={(e) => setForm({ ...form, appliesTo: e.target.value })}>
              <option value="both">{t('both')}</option>
              <option value="medicine">{tP('medicine')}</option>
              <option value="cosmetic">{tP('cosmetic')}</option>
            </select>
          </label>
        )}
        <button className="btn btn-primary" disabled={busy}>
          {t('add')}
        </button>
      </form>
      <ul className="divide-y divide-[var(--line)]">
        {data?.items.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-2 py-2">
            <span className={i.isActive ? '' : 'muted line-through'}>
              {name(i)}
              {withAppliesTo && i.appliesTo !== 'both' && (
                <span className="ms-2">
                  <Badge>{tP(i.appliesTo as 'medicine')}</Badge>
                </span>
              )}
            </span>
            <button type="button" className="text-sm underline" disabled={busy} onClick={() => run(() => patch(`/${path}/${i.id}`, { isActive: !i.isActive }))}>
              {i.isActive ? t('hide') : t('show')}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function ListsPage() {
  const t = useTranslations('lists');
  return (
    <div className="space-y-4">
      <PageTitle>{t('title')}</PageTitle>
      <ListEditor path="categories" title={t('categories')} withAppliesTo />
      <ListEditor path="brands" title={t('brands')} />
      <ListEditor path="dosage-forms" title={t('dosageForms')} />
    </div>
  );
}
