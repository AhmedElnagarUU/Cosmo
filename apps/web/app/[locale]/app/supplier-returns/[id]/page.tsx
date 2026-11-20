'use client';

import { use, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { get, post } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { isOwner, useMe } from '@/lib/me-context';
import { useDateFormat, useName, type Named } from '@/lib/catalog';
import { Badge, Card, ErrorBox, Loading, PageTitle } from '@/components/ui';

interface SupplierReturn {
  id: string;
  returnNumber: string;
  status: 'waiting_for_owner' | 'confirmed' | 'rejected';
  supplierName: string;
  reason: string;
  note: string | null;
  totalValue: string;
  createdBy: string | null;
  createdAt: string;
  decidedBy: string | null;
  rejectionReason: string | null;
  lines: Array<{ id: string; product: Named; batchNumber: string | null; expiryDate: string | null; stockState: string; quantity: number; costPrice: string }>;
}

const tone = { waiting_for_owner: 'teal', confirmed: 'green', rejected: 'red' } as const;

// OWN-14: the owner approves or rejects when approval is switched on (C-65)
export default function SupplierReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('supplierReturns');
  const tApp = useTranslations('app');
  const name = useName();
  const fmt = useDateFormat();
  const { me } = useMe();
  const { data, error, setData } = useLoad(() => get<SupplierReturn>(`/supplier-returns/${id}`), [id]);
  const [actionError, setActionError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function decide(path: string, body?: object) {
    setBusy(true);
    setActionError(null);
    try {
      setData(await post<SupplierReturn>(`/supplier-returns/${id}/${path}`, body));
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  return (
    <div className="space-y-4">
      <PageTitle action={<Badge tone={tone[data.status]}>{t(data.status)}</Badge>}>
        <span dir="ltr">{data.returnNumber}</span> · {data.supplierName}
      </PageTitle>
      <ErrorBox error={actionError} />
      <Card className="space-y-1 text-sm">
        <div>
          {t('reason')}: {t(data.reason)}
          {data.note && ` · ${data.note}`}
        </div>
        <div className="muted">
          {data.createdBy} · {fmt(data.createdAt, true)}
        </div>
        {data.rejectionReason && (
          <div className="text-red-700">
            {t('rejected')}: {data.rejectionReason} ({data.decidedBy})
          </div>
        )}
      </Card>
      <Card className="space-y-2">
        <ul className="divide-y divide-[var(--line)] text-sm">
          {data.lines.map((l) => (
            <li key={l.id} className="flex flex-wrap justify-between gap-2 py-2">
              <span>
                <span className="font-medium">{name(l.product)}</span>
                <span className="muted" dir="ltr">
                  {' '}
                  · {l.batchNumber ?? '—'}
                </span>
                <span className="muted"> · {t(l.stockState)}</span>
              </span>
              <span>
                {l.quantity} × <span dir="ltr">{l.costPrice}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t border-[var(--line)] pt-2 font-bold">
          <span>{t('value')}</span>
          <span dir="ltr">{data.totalValue}</span>
        </div>
      </Card>
      {data.status === 'waiting_for_owner' && isOwner(me) && (
        <Card className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => decide('approve')}>
            {t('approve')}
          </button>
          <button
            type="button"
            className="btn btn-secondary text-red-700"
            disabled={busy}
            onClick={() => {
              const reason = prompt(t('rejectReason'));
              if (reason) void decide('reject', { reason });
            }}
          >
            {t('reject')}
          </button>
        </Card>
      )}
      <Link href="/app/supplier-returns" className="btn btn-secondary">
        {tApp('back')}
      </Link>
    </div>
  );
}
