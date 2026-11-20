'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { RETURN_REASONS } from '@cosmo/shared';
import { useRouter } from '@/i18n/navigation';
import { get, post } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { useName, type Named } from '@/lib/catalog';
import { Card, ErrorBox, Loading, PageTitle } from '@/components/ui';

interface Order {
  id: string;
  orderNumber: string;
  customer: { businessName: string };
  lines: Array<{ id: string; product: Named; currentQty: number; bonusQty: number }>;
}

// SAL-05: an employee starts a return from the delivered order (C-19, C-62)
export default function NewReturnPage() {
  const t = useTranslations('returns');
  const name = useName();
  const router = useRouter();
  const orderId = useSearchParams().get('orderId') ?? '';
  const { data, error } = useLoad(() => get<Order>(`/orders/${orderId}`), [orderId]);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<(typeof RETURN_REASONS)[number]>('damaged');
  const [note, setNote] = useState('');
  const [actionError, setActionError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const lines = Object.entries(qty).filter(([, v]) => Number(v) > 0).map(([orderLineId, v]) => ({ orderLineId, quantity: Number(v) }));
  return (
    <div className="space-y-4">
      <PageTitle>
        {t('new')} · <span dir="ltr">{data.orderNumber}</span>
      </PageTitle>
      <ErrorBox error={actionError} />
      <Card className="space-y-2">
        <div className="font-semibold">{data.customer.businessName}</div>
        {data.lines
          .filter((l) => l.currentQty > 0)
          .map((l) => (
            <label key={l.id} className="flex items-center justify-between gap-2">
              <span>
                {name(l.product)} <span className="muted text-xs">({t('max', { n: l.currentQty + l.bonusQty })})</span>
              </span>
              <input className="field w-24 text-center" type="number" min={0} max={l.currentQty + l.bonusQty} placeholder="0" value={qty[l.id] ?? ''} onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })} />
            </label>
          ))}
      </Card>
      <Card className="space-y-2">
        <label className="block space-y-1">
          <span className="text-sm font-medium">{t('reason')}</span>
          <select className="field" value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
            {RETURN_REASONS.map((r) => (
              <option key={r} value={r}>
                {t(`reason_${r}`)}
              </option>
            ))}
          </select>
        </label>
        <input className="field" placeholder={t('note')} required={reason === 'other'} value={note} onChange={(e) => setNote(e.target.value)} />
      </Card>
      <button
        type="button"
        className="btn btn-primary w-full"
        disabled={busy || lines.length === 0}
        onClick={async () => {
          setBusy(true);
          setActionError(null);
          try {
            const r = await post<{ id: string }>('/returns', { orderId, reason, note: note || null, lines });
            router.replace(`/app/returns/${r.id}`);
          } catch (e) {
            setActionError(e);
            setBusy(false);
          }
        }}
      >
        {t('create')}
      </button>
    </div>
  );
}
