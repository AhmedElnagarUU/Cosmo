'use client';

import { use, useState } from 'react';
import { useTranslations } from 'next-intl';
import { PAYMENT_METHODS } from '@cosmo/shared';
import { Link } from '@/i18n/navigation';
import { get, patch, post } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { hasAnyRole, useMe } from '@/lib/me-context';
import { useDateFormat } from '@/lib/catalog';
import { Badge, Card, ErrorBox, Field, Loading, PageTitle } from '@/components/ui';

interface Supplier {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
  purchases: string;
  returns: string;
  paid: string;
  balance: string;
  receipts: Array<{ id: string; number: string | null; status: string; supplierInvoiceNumber: string | null; total: string; at: string }>;
  supplierReturns: Array<{ id: string; number: string; status: string; reason: string; total: string; at: string }>;
  payments: Array<{ id: string; amount: string; method: string; paidOn: string; reference: string | null; by: string | null; cancelledAt: string | null; cancelReason: string | null }>;
}

// ACC-09, ACC-10: what we owe the supplier, and the documents behind it
export default function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('suppliers');
  const tR = useTranslations('receipts');
  const tM = useTranslations('methods');
  const tApp = useTranslations('app');
  const fmt = useDateFormat();
  const { me } = useMe();
  const canPay = hasAnyRole(me, 'accountant');
  const canEdit = hasAnyRole(me, 'stock_manager');
  const { data, error, reload } = useLoad(() => get<Supplier>(`/suppliers/${id}`), [id]);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
  const [pay, setPay] = useState({ amount: '', method: 'cash', paidOn: today, reference: '' });
  const [actionError, setActionError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await reload();
      return true;
    } catch (e) {
      setActionError(e);
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;

  return (
    <div className="space-y-4">
      <PageTitle action={!data.isActive && <Badge tone="red">{t('off')}</Badge>}>{data.name}</PageTitle>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {(['purchases', 'returns', 'paid', 'balance'] as const).map((k) => (
          <Card key={k} className="text-center">
            <div className={`text-lg font-bold ${k === 'balance' ? 'text-[var(--color-brand)]' : ''}`} dir="ltr">
              {data[k]}
            </div>
            <div className="muted text-sm">{t(k)}</div>
          </Card>
        ))}
      </div>
      <Card className="text-sm">
        {data.contactPerson && <div>{data.contactPerson}</div>}
        {data.phone && <div dir="ltr">{data.phone}</div>}
        {data.address && <div className="muted">{data.address}</div>}
        {canEdit && (
          <button type="button" className="mt-2 text-sm underline" disabled={busy} onClick={() => run(() => patch(`/suppliers/${id}`, { isActive: !data.isActive }))}>
            {data.isActive ? t('switchOff') : t('switchOn')}
          </button>
        )}
      </Card>
      <ErrorBox error={actionError} />

      {canPay && (
        <Card className="space-y-3">
          <h2 className="font-bold">{t('pay')}</h2>
          <form
            className="grid gap-3 md:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run(() => post('/supplier-payments', { supplierId: id, ...pay, reference: pay.reference || null }));
              if (ok) setPay({ amount: '', method: 'cash', paidOn: today, reference: '' });
            }}
          >
            <Field label={t('amount')} dir="ltr" inputMode="decimal" required value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
            <label className="block space-y-1">
              <span className="text-sm font-medium">{t('method')}</span>
              <select className="field" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {tM(m)}
                  </option>
                ))}
              </select>
            </label>
            <Field label={t('paidOn')} type="date" required value={pay.paidOn} onChange={(e) => setPay({ ...pay, paidOn: e.target.value })} />
            <Field label={t('reference')} dir="ltr" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />
            <div>
              <button className="btn btn-primary" disabled={busy}>
                {tApp('save')}
              </button>
            </div>
          </form>
        </Card>
      )}

      <Card className="space-y-2">
        <h2 className="font-bold">{t('payments')}</h2>
        <ul className="divide-y divide-[var(--line)] text-sm">
          {data.payments.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className={p.cancelledAt ? 'muted line-through' : ''}>
                <span dir="ltr" className="font-semibold">
                  {p.amount}
                </span>{' '}
                · {tM(p.method)} · {fmt(p.paidOn)}
                {p.reference && <span dir="ltr"> · {p.reference}</span>}
              </span>
              {p.cancelledAt ? (
                <Badge tone="red">
                  {t('cancelled')}: {p.cancelReason}
                </Badge>
              ) : (
                canPay && (
                  <button
                    type="button"
                    className="text-red-700 underline"
                    disabled={busy}
                    onClick={() => {
                      const reason = prompt(t('cancelReason'));
                      if (reason) void run(() => post(`/supplier-payments/${p.id}/cancel`, { reason }));
                    }}
                  >
                    {t('cancelPayment')}
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="space-y-2">
        <h2 className="font-bold">{t('receipts')}</h2>
        <ul className="divide-y divide-[var(--line)] text-sm">
          {data.receipts.map((r) => (
            <li key={r.id}>
              <Link href={`/app/receipts/${r.id}`} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  <span dir="ltr">{r.number ?? tR('draft')}</span>
                  {r.supplierInvoiceNumber && <span className="muted" dir="ltr"> · {r.supplierInvoiceNumber}</span>}
                </span>
                <span>
                  <span dir="ltr" className="font-semibold">
                    {r.total}
                  </span>{' '}
                  · {fmt(r.at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="space-y-2">
        <h2 className="font-bold">{t('returns')}</h2>
        <ul className="divide-y divide-[var(--line)] text-sm">
          {data.supplierReturns.map((r) => (
            <li key={r.id}>
              <Link href={`/app/supplier-returns/${r.id}`} className="flex flex-wrap justify-between gap-2 py-2">
                <span dir="ltr">{r.number}</span>
                <span>
                  <span dir="ltr" className="font-semibold">
                    {r.total}
                  </span>{' '}
                  · {fmt(r.at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <Link href="/app/suppliers" className="btn btn-secondary">
        {tApp('back')}
      </Link>
    </div>
  );
}
