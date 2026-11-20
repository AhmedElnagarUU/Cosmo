'use client';

import { use, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { fromPiasters, toPiasters } from '@cosmo/shared';
import { Link } from '@/i18n/navigation';
import { get, patch, post } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { hasAnyRole, useMe } from '@/lib/me-context';
import { useDateFormat, useName, type Named } from '@/lib/catalog';
import { Badge, Card, ErrorBox, Field, Loading, PageTitle } from '@/components/ui';
import { ProductPicker } from '@/components/product-picker';

interface Line {
  productId: string;
  product: Named;
  trackBatches: boolean;
  batchNumber: string | null;
  expiryDate: string | null;
  quantity: number;
  costPrice: string;
  lineTotal?: string;
}
interface Receipt {
  id: string;
  receiptNumber: string | null;
  status: 'draft' | 'confirmed';
  supplierName: string;
  supplierInvoiceNumber: string | null;
  supplierInvoiceDate: string | null;
  totalAmount: string;
  createdBy: string | null;
  confirmedAt: string | null;
  lines: Line[];
}
interface EditLine {
  productId: string;
  product: Named;
  trackBatches: boolean;
  batchNumber: string;
  expiryDate: string;
  quantity: string;
  costPrice: string;
}

const lineTotal = (l: EditLine) => {
  if (!/^\d+(\.\d{1,2})?$/.test(l.costPrice) || !/^\d+$/.test(l.quantity)) return 0;
  return toPiasters(l.costPrice) * Number(l.quantity);
};

// STK-01, STK-02: one receipt for the goods and the supplier's invoice (C-43)
export default function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('receipts');
  const tApp = useTranslations('app');
  const name = useName();
  const fmt = useDateFormat();
  const { me } = useMe();
  const canEdit = hasAnyRole(me, 'stock_manager');
  const { data, error, setData } = useLoad(() => get<Receipt>(`/receipts/${id}`), [id]);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [lines, setLines] = useState<EditLine[]>([]);
  const [actionError, setActionError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    setInvoiceNumber(data.supplierInvoiceNumber ?? '');
    setInvoiceDate(data.supplierInvoiceDate ?? '');
    setLines(
      data.lines.map((l) => ({
        productId: l.productId,
        product: l.product,
        trackBatches: l.trackBatches,
        batchNumber: l.batchNumber ?? '',
        expiryDate: l.expiryDate ?? '',
        quantity: String(l.quantity),
        costPrice: l.costPrice,
      })),
    );
  }, [data]);

  const body = () => ({
    supplierInvoiceNumber: invoiceNumber || null,
    supplierInvoiceDate: invoiceDate || null,
    lines: lines.map((l) => ({
      productId: l.productId,
      batchNumber: l.trackBatches ? l.batchNumber || null : null,
      expiryDate: l.trackBatches ? l.expiryDate || null : null,
      quantity: Number(l.quantity),
      costPrice: l.costPrice,
    })),
  });

  async function run(fn: () => Promise<Receipt>) {
    setBusy(true);
    setActionError(null);
    setSaved(false);
    try {
      setData(await fn());
      setSaved(true);
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const editable = canEdit && data.status === 'draft';
  const setLine = (i: number, patchLine: Partial<EditLine>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patchLine } : l)));

  return (
    <div className="space-y-4">
      <PageTitle action={<Badge tone={data.status === 'draft' ? 'gray' : 'green'}>{t(data.status)}</Badge>}>
        {data.receiptNumber ?? t('new')} · {data.supplierName}
      </PageTitle>
      <ErrorBox error={actionError} />
      {saved && data.status === 'draft' && <p className="text-sm text-green-700">{t('saved')}</p>}

      <Card className="grid gap-3 md:grid-cols-2">
        <Field label={t('invoiceNumber')} dir="ltr" disabled={!editable} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
        <Field label={t('invoiceDate')} type="date" disabled={!editable} value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
      </Card>

      <Card className="space-y-3">
        <h2 className="font-bold">{t('lines')}</h2>
        {editable && (
          <ProductPicker
            placeholder={t('search')}
            onPick={(p) =>
              setLines([
                ...lines,
                { productId: p.id, product: p, trackBatches: p.trackBatches ?? true, batchNumber: '', expiryDate: '', quantity: '', costPrice: p.costPrice ?? '' },
              ])
            }
          />
        )}
        <div className="space-y-3">
          {lines.map((l, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-[var(--line)] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{name(l.product)}</span>
                {editable && (
                  <button type="button" className="text-sm text-red-700 underline" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                    {t('remove')}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {l.trackBatches ? (
                  <>
                    <Field label={t('batch')} dir="ltr" disabled={!editable} value={l.batchNumber} onChange={(e) => setLine(i, { batchNumber: e.target.value })} />
                    <Field label={t('expiry')} type="date" disabled={!editable} value={l.expiryDate} onChange={(e) => setLine(i, { expiryDate: e.target.value })} />
                  </>
                ) : (
                  <p className="muted col-span-2 self-center text-sm">{t('noBatchNeeded')}</p>
                )}
                <Field label={t('quantity')} type="number" min={1} disabled={!editable} value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                <Field label={t('cost')} dir="ltr" inputMode="decimal" disabled={!editable} value={l.costPrice} onChange={(e) => setLine(i, { costPrice: e.target.value })} />
              </div>
              <div className="muted text-end text-sm">
                {t('lineTotal')}: <span dir="ltr">{fromPiasters(lineTotal(l))}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between border-t border-[var(--line)] pt-2 text-lg font-bold">
          <span>{t('total')}</span>
          <span dir="ltr">{editable ? fromPiasters(lines.reduce((s, l) => s + lineTotal(l), 0)) : data.totalAmount}</span>
        </div>
      </Card>

      {editable ? (
        <Card className="space-y-3">
          <p className="muted text-sm">{t('confirmHelp')}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => run(() => patch<Receipt>(`/receipts/${id}`, body()))}>
              {t('saveDraft')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || lines.length === 0}
              onClick={() =>
                run(async () => {
                  await patch<Receipt>(`/receipts/${id}`, body());
                  return post<Receipt>(`/receipts/${id}/confirm`);
                })
              }
            >
              {t('confirm')}
            </button>
          </div>
        </Card>
      ) : (
        data.confirmedAt && (
          <p className="muted text-sm">
            {t('confirmed')} · {fmt(data.confirmedAt, true)} · {data.createdBy}
          </p>
        )
      )}
      <Link href="/app/receipts" className="btn btn-secondary">
        {tApp('back')}
      </Link>
    </div>
  );
}
