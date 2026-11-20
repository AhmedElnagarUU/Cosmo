'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SUPPLIER_RETURN_REASONS } from '@cosmo/shared';
import { Link, useRouter } from '@/i18n/navigation';
import { get, post } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { useName, type Named } from '@/lib/catalog';
import { Card, ErrorBox, Field, PageTitle } from '@/components/ui';
import { ProductPicker } from '@/components/product-picker';

interface Batch {
  id: string;
  batchNumber: string | null;
  expiryDate: string | null;
  sellable: number;
  damaged: number;
  expired: number;
}
interface Line {
  productId: string;
  product: Named;
  batches: Batch[];
  batchId: string;
  stockState: 'sellable' | 'damaged' | 'expired';
  quantity: string;
}

// STK-19: goods sent back to a supplier, with a reason (C-42)
export default function NewSupplierReturnPage() {
  const t = useTranslations('supplierReturns');
  const tR = useTranslations('receipts');
  const tApp = useTranslations('app');
  const name = useName();
  const router = useRouter();
  const suppliers = useLoad(() => get<{ items: Array<{ id: string; name: string }> }>('/suppliers'));
  const [supplierId, setSupplierId] = useState('');
  const [reason, setReason] = useState<(typeof SUPPLIER_RETURN_REASONS)[number]>('damaged');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const setLine = (i: number, p: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...p } : l)));

  return (
    <div className="space-y-4">
      <PageTitle>{t('new')}</PageTitle>
      <ErrorBox error={error} />
      <Card className="grid gap-3 md:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm font-medium">{tR('supplier')}</span>
          <select className="field" required value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">…</option>
            {suppliers.data?.items.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">{t('reason')}</span>
          <select className="field" value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
            {SUPPLIER_RETURN_REASONS.map((r) => (
              <option key={r} value={r}>
                {t(r)}
              </option>
            ))}
          </select>
        </label>
        <div className="md:col-span-2">
          <Field label={t('note')} required={reason === 'other'} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </Card>
      <Card className="space-y-3">
        <ProductPicker
          placeholder={tR('search')}
          onPick={async (p) => {
            const b = await get<{ items: Batch[] }>(`/products/${p.id}/batches`);
            const usable = b.items.filter((x) => x.sellable + x.damaged + x.expired > 0);
            setLines([...lines, { productId: p.id, product: p, batches: usable, batchId: usable[0]?.id ?? '', stockState: 'sellable', quantity: '' }]);
          }}
        />
        {lines.map((l, i) => {
          const batch = l.batches.find((b) => b.id === l.batchId);
          return (
            <div key={i} className="space-y-2 rounded-lg border border-[var(--line)] p-3">
              <div className="flex justify-between">
                <span className="font-semibold">{name(l.product)}</span>
                <button type="button" className="text-sm text-red-700 underline" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                  {tR('remove')}
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <label className="block space-y-1">
                  <span className="text-sm font-medium">{tR('batch')}</span>
                  <select className="field" value={l.batchId} onChange={(e) => setLine(i, { batchId: e.target.value })}>
                    {l.batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {(b.batchNumber ?? '—') + (b.expiryDate ? ` · ${b.expiryDate}` : '')}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">{t('state')}</span>
                  <select className="field" value={l.stockState} onChange={(e) => setLine(i, { stockState: e.target.value as Line['stockState'] })}>
                    {(['sellable', 'damaged', 'expired'] as const).map((s) => (
                      <option key={s} value={s}>
                        {t(s)} ({batch ? batch[s] : 0})
                      </option>
                    ))}
                  </select>
                </label>
                <Field label={tR('quantity')} type="number" min={1} max={batch ? batch[l.stockState] : undefined} value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
              </div>
            </div>
          );
        })}
      </Card>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !supplierId || lines.length === 0}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const r = await post<{ id: string }>('/supplier-returns', {
                supplierId,
                reason,
                note: note || null,
                lines: lines.map((l) => ({ productId: l.productId, batchId: l.batchId, stockState: l.stockState, quantity: Number(l.quantity) })),
              });
              router.replace(`/app/supplier-returns/${r.id}`);
            } catch (e) {
              setError(e);
              setBusy(false);
            }
          }}
        >
          {t('submit')}
        </button>
        <Link href="/app/supplier-returns" className="btn btn-secondary">
          {tApp('cancel')}
        </Link>
      </div>
    </div>
  );
}
