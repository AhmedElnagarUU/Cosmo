'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { get, post } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { hasAnyRole, useMe } from '@/lib/me-context';
import { useDateFormat } from '@/lib/catalog';
import { Badge, Card, ErrorBox, Loading, PageTitle } from '@/components/ui';

interface Row {
  id: string;
  number: string | null;
  status: 'draft' | 'confirmed';
  supplierName: string;
  supplierInvoiceNumber: string | null;
  total: string;
  at: string;
}

// STK-01: goods and the supplier's invoice, recorded together (C-43)
export default function ReceiptsPage() {
  const t = useTranslations('receipts');
  const fmt = useDateFormat();
  const router = useRouter();
  const { me } = useMe();
  const canCreate = hasAnyRole(me, 'stock_manager');
  const { data, error } = useLoad(() => get<{ items: Row[] }>('/receipts?limit=100'));
  const suppliers = useLoad(() => (canCreate ? get<{ items: Array<{ id: string; name: string }> }>('/suppliers') : Promise.resolve({ items: [] })));
  const [supplierId, setSupplierId] = useState('');
  const [createError, setCreateError] = useState<unknown>(null);

  return (
    <div className="space-y-4">
      <PageTitle>{t('title')}</PageTitle>
      {canCreate && (
        <Card>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const r = await post<{ id: string }>('/receipts', { supplierId });
                router.push(`/app/receipts/${r.id}`);
              } catch (err) {
                setCreateError(err);
              }
            }}
          >
            <label className="block flex-1 space-y-1">
              <span className="text-sm font-medium">{t('supplier')}</span>
              <select className="field" required value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">…</option>
                {suppliers.data?.items.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn btn-primary">{t('new')}</button>
          </form>
          <ErrorBox error={createError} />
        </Card>
      )}
      <ErrorBox error={error} />
      {!data ? (
        <Loading />
      ) : data.items.length === 0 ? (
        <p className="muted py-6 text-center">{t('none')}</p>
      ) : (
        <div className="space-y-2">
          {data.items.map((r) => (
            <Link key={r.id} href={`/app/receipts/${r.id}`} className="block">
              <Card className="flex flex-wrap items-center justify-between gap-2 hover:border-teal-500">
                <div>
                  <div className="font-semibold">{r.supplierName}</div>
                  <div className="muted text-sm">
                    <span dir="ltr">{r.number ?? ''}</span>
                    {r.supplierInvoiceNumber && <span dir="ltr"> · {r.supplierInvoiceNumber}</span>} · {fmt(r.at)}
                  </div>
                </div>
                <div className="text-end">
                  <Badge tone={r.status === 'draft' ? 'gray' : 'green'}>{t(r.status)}</Badge>
                  <div className="font-bold" dir="ltr">
                    {r.total}
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
