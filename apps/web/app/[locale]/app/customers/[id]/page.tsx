'use client';

import { use, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { get, patch, post, type FirstLogin } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { hasAnyRole, isOwner, useMe } from '@/lib/me-context';
import { Badge, Card, ErrorBox, Field, Loading, PageTitle } from '@/components/ui';
import { CustomerForm, type CustomerFields } from '@/components/customer-form';
import { FirstLoginCard } from '@/components/first-login-card';

interface Customer extends CustomerFields {
  id: string;
  area: string;
  creditAllowed: boolean;
  creditDays: number;
  isActive: boolean;
}

export default function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('customers');
  const tApp = useTranslations('app');
  const tB = useTranslations('billing');
  const { me } = useMe();
  const owner = isOwner(me);
  const canEdit = hasAnyRole(me, 'sales');
  const { data, error: loadError, setData } = useLoad(() => get<Customer>(`/customers/${id}`), [id]);
  const [value, setValue] = useState<CustomerFields | null>(null);
  const [creditAllowed, setCreditAllowed] = useState(false);
  const [creditDays, setCreditDays] = useState('30');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const [reset, setReset] = useState<FirstLogin | null>(null);

  useEffect(() => {
    if (!data) return;
    setValue({ businessName: data.businessName, contactPerson: data.contactPerson, phone: data.phone, address: data.address, area: data.area ?? '' });
    setCreditAllowed(data.creditAllowed);
    setCreditDays(String(data.creditDays));
  }, [data]);

  async function run(fn: () => Promise<Customer | void>) {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const r = await fn();
      if (r) setData(r);
      setSaved(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <ErrorBox error={loadError} />;
  if (!data || !value) return <Loading />;

  return (
    <div className="space-y-4">
      <PageTitle action={!data.isActive && <Badge tone="red">{t('deactivate')}</Badge>}>{data.businessName}</PageTitle>
      <ErrorBox error={error} />
      {saved && <p role="status" className="text-sm text-green-700">{tApp('saved')}</p>}

      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => patch<Customer>(`/customers/${id}`, { ...value, area: value.area || null }));
          }}
          className="space-y-4"
        >
          <CustomerForm value={value} onChange={setValue} error={error} disabled={!canEdit || busy} />
          {canEdit && (
            <button className="btn btn-primary" disabled={busy}>
              {tApp('save')}
            </button>
          )}
        </form>
      </Card>

      {/* C-26: only the owner changes credit */}
      <Card className="space-y-3">
        <h2 className="font-bold">{t('credit')}</h2>
        {owner ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => patch<Customer>(`/customers/${id}/credit`, { creditAllowed, creditDays: Number(creditDays) }));
            }}
            className="space-y-3"
          >
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={creditAllowed} onChange={(e) => setCreditAllowed(e.target.checked)} />
              {t('creditAllowed')}
            </label>
            <Field label={t('creditDays')} type="number" min={1} max={365} required value={creditDays} onChange={(e) => setCreditDays(e.target.value)} />
            <button className="btn btn-primary" disabled={busy}>
              {tApp('save')}
            </button>
          </form>
        ) : (
          <>
            <p>{data.creditAllowed ? `${t('creditAllowed')} · ${t('creditDays')}: ${data.creditDays}` : t('noCredit')}</p>
            <p className="muted text-sm">{t('creditOnlyOwner')}</p>
          </>
        )}
      </Card>

      {reset && <FirstLoginCard details={reset} wholesalerName={me.wholesaler.name} />}

      {(canEdit || owner) && (
        <Card className="flex flex-wrap gap-2">
          {canEdit && data.isActive && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const r = await post<{ firstLogin: FirstLogin }>(`/customers/${id}/reset-password`);
                  setReset(r.firstLogin);
                })
              }
            >
              {t('resetPassword')}
            </button>
          )}
          {owner &&
            (data.isActive ? (
              <button
                type="button"
                className="btn btn-secondary text-red-700"
                disabled={busy}
                onClick={() => confirm(t('confirmDeactivate')) && run(() => post<Customer>(`/customers/${id}/deactivate`))}
              >
                {t('deactivate')}
              </button>
            ) : (
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => run(() => post<Customer>(`/customers/${id}/activate`))}>
                {t('activate')}
              </button>
            ))}
        </Card>
      )}
      <Link href={`/app/statement?customerId=${id}`} className="btn btn-secondary">
        {tB('statement')}
      </Link>
      <Link href="/app/customers" className="btn btn-secondary">
        {tApp('back')}
      </Link>
    </div>
  );
}
