'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { get, post } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { hasAnyRole, useMe } from '@/lib/me-context';
import { Badge, Card, ErrorBox, Field, Loading, PageTitle } from '@/components/ui';

interface Row {
  id: string;
  name: string;
  phone: string | null;
  balance: string;
  isActive: boolean;
}

export default function SuppliersPage() {
  const t = useTranslations('suppliers');
  const tApp = useTranslations('app');
  const { me } = useMe();
  const canAdd = hasAnyRole(me, 'stock_manager');
  const { data, error, reload } = useLoad(() => get<{ items: Row[] }>('/suppliers?status=all'));
  const [form, setForm] = useState<{ name: string; contactPerson: string; phone: string; address: string } | null>(null);
  const [formError, setFormError] = useState<unknown>(null);

  return (
    <div className="space-y-4">
      <PageTitle
        action={
          canAdd &&
          !form && (
            <button type="button" className="btn btn-primary" onClick={() => setForm({ name: '', contactPerson: '', phone: '', address: '' })}>
              {t('add')}
            </button>
          )
        }
      >
        {t('title')}
      </PageTitle>
      {form && (
        <Card>
          <form
            className="grid gap-3 md:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await post('/suppliers', form);
                setForm(null);
                await reload();
              } catch (err) {
                setFormError(err);
              }
            }}
          >
            <div className="md:col-span-2">
              <ErrorBox error={formError} />
            </div>
            <Field label={t('name')} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Field label={t('contactPerson')} value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
            <Field label={t('phone')} type="tel" dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Field label={t('address')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            <div className="flex gap-2">
              <button className="btn btn-primary">{tApp('save')}</button>
              <button type="button" className="btn btn-secondary" onClick={() => setForm(null)}>
                {tApp('cancel')}
              </button>
            </div>
          </form>
        </Card>
      )}
      <ErrorBox error={error} />
      {!data ? (
        <Loading />
      ) : data.items.length === 0 ? (
        <p className="muted py-6 text-center">{t('none')}</p>
      ) : (
        <div className="space-y-2">
          {data.items.map((s) => (
            <Link key={s.id} href={`/app/suppliers/${s.id}`} className="block">
              <Card className="flex flex-wrap items-center justify-between gap-2 hover:border-teal-500">
                <div>
                  <div className="font-semibold">
                    {s.name} {!s.isActive && <Badge tone="red">{t('off')}</Badge>}
                  </div>
                  {s.phone && (
                    <div className="muted text-sm" dir="ltr">
                      {s.phone}
                    </div>
                  )}
                </div>
                <div className="text-end">
                  <div className="muted text-xs">{t('balance')}</div>
                  <div className="font-bold" dir="ltr">
                    {s.balance}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
