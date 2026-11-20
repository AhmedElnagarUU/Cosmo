'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { get, post } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { useDateFormat } from '@/lib/catalog';
import { Badge, Card, ErrorBox, Loading, PageTitle } from '@/components/ui';

interface Row {
  id: string;
  amount: string;
  method: string;
  reference: string | null;
  paidOn: string;
  status: string;
  rejectionReason: string | null;
  customerName: string;
  recordedBy: string | null;
  invoiceNumber: string | null;
  tripNumber: string | null;
  tripId: string | null;
}

// ACC-02, ACC-03: confirm or reject what the delivery people collected (C-27)
export default function PaymentsPage() {
  const t = useTranslations('billing');
  const tM = useTranslations('methods');
  const fmt = useDateFormat();
  const tabs = ['waiting', 'confirmed', 'rejected'] as const;
  const [tab, setTab] = useState(0);
  const { data, error, reload } = useLoad(() => get<{ items: Row[] }>(`/payments?status=${tabs[tab]}`), [tab]);
  const [actionError, setActionError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageTitle>{t('payments')}</PageTitle>
      <div className="flex flex-wrap gap-2">
        {tabs.map((x, i) => (
          <button key={x} type="button" className={`btn ${tab === i ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab(i)}>
            {t(x)}
          </button>
        ))}
      </div>
      <ErrorBox error={error ?? actionError} />
      {!data ? (
        <Loading />
      ) : data.items.length === 0 ? (
        <p className="muted py-6 text-center">{t('none')}</p>
      ) : (
        data.items.map((p) => (
          <Card key={p.id} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{p.customerName}</span>
              <span className="text-lg font-bold" dir="ltr">
                {p.amount}
              </span>
            </div>
            <div className="muted flex flex-wrap gap-x-3 text-sm">
              <span>{tM(p.method)}</span>
              {p.reference && <span dir="ltr">{p.reference}</span>}
              <span>{fmt(p.paidOn)}</span>
              {p.recordedBy && <span>{t('collectedBy', { name: p.recordedBy })}</span>}
              {p.invoiceNumber && <span dir="ltr">{p.invoiceNumber}</span>}
              {p.tripId && (
                <Link href={`/app/trips/${p.tripId}`} className="underline" dir="ltr">
                  {p.tripNumber}
                </Link>
              )}
            </div>
            {p.rejectionReason && <p className="text-sm text-red-700">{p.rejectionReason}</p>}
            {p.status === 'waiting' && (
              <div className="flex gap-2">
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => post(`/payments/${p.id}/confirm`))}>
                  ✓ {t('confirm')}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary text-red-700"
                  disabled={busy}
                  onClick={() => {
                    const reason = prompt(t('rejectReason'));
                    if (reason) void run(() => post(`/payments/${p.id}/reject`, { reason }));
                  }}
                >
                  {t('reject')}
                </button>
              </div>
            )}
            {p.status !== 'waiting' && <Badge tone={p.status === 'confirmed' ? 'green' : 'red'}>{t(p.status as 'confirmed')}</Badge>}
          </Card>
        ))
      )}
    </div>
  );
}
