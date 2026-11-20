'use client';

import { use, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { REDUCE_REASONS } from '@cosmo/shared';
import { Link, useRouter } from '@/i18n/navigation';
import { post, put } from '@/lib/api';
import { useName, type Named } from '@/lib/catalog';
import { Badge, Card, ErrorBox, Loading, PageTitle } from '@/components/ui';

interface BatchOption {
  batchId: string;
  batchNumber: string | null;
  expiryDate: string | null;
  available: number;
  nearExpiry: boolean;
}
interface PrepLine {
  orderLineId: string;
  product: Named;
  barcode: string | null;
  keepCold: boolean;
  mustHave: boolean;
  quantity: number;
  bonusQty: number;
  need: number;
  batches: BatchOption[];
  recommended: Array<{ batchId: string; quantity: number }>;
  picks: Array<{ batchId: string; quantity: number }>;
  picked: number;
}
interface View {
  status: string;
  preparingByMe: boolean;
  lines: PrepLine[];
}

// STK-07 to STK-11: pick each product from real batches, soonest expiry first (C-14)
export default function PreparePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('prepare');
  const tO = useTranslations('orders');
  const tR = useTranslations('reduceReason');
  const tApp = useTranslations('app');
  const name = useName();
  const router = useRouter();
  const [view, setView] = useState<View | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [reduce, setReduce] = useState<Record<string, { qty: string; reason: string; note: string }>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  function load(v: View) {
    setView(v);
    const d: Record<string, Record<string, string>> = {};
    for (const l of v.lines) {
      d[l.orderLineId] = Object.fromEntries(l.picks.map((p) => [p.batchId, String(p.quantity)]));
    }
    setDrafts(d);
  }

  useEffect(() => {
    // Opening the page starts preparation, or continues it (C-77)
    post<View>(`/orders/${id}/start-preparing`).then(load).catch(setError);
  }, [id]);

  async function run(fn: () => Promise<View | void>) {
    setBusy(true);
    setError(null);
    try {
      const v = await fn();
      if (v) load(v);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  if (!view) return error ? <ErrorBox error={error} /> : <Loading />;
  const allPicked = view.lines.every((l) => l.picked === l.need);

  return (
    <div className="space-y-4">
      <PageTitle>{t('title')}</PageTitle>
      <ErrorBox error={error} />
      {view.lines.map((l) => {
        const d = drafts[l.orderLineId] ?? {};
        const sum = Object.values(d).reduce((s, v) => s + (Number(v) || 0), 0);
        const r = reduce[l.orderLineId];
        return (
          <Card key={l.orderLineId} className={`space-y-3 ${l.picked === l.need ? 'border-green-500' : ''}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-lg font-semibold">{name(l.product)}</div>
                {l.barcode && (
                  <div className="muted text-xs" dir="ltr">
                    {l.barcode}
                  </div>
                )}
              </div>
              <div className="text-end">
                <div className="text-xl font-bold">{t('need', { n: l.need })}</div>
                {l.bonusQty > 0 && <div className="muted text-xs">{t('free', { n: l.bonusQty })}</div>}
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {l.mustHave && <Badge tone="teal">{tO('mustHave')}</Badge>}
              {l.keepCold && <Badge tone="teal">❄ {tO('keepCold')}</Badge>}
              <Badge tone={l.picked === l.need ? 'green' : 'gray'}>{t('picked', { n: l.picked, need: l.need })}</Badge>
            </div>
            {l.batches.length === 0 ? (
              <p className="text-sm text-red-700">{t('noBatches')}</p>
            ) : (
              <div className="space-y-2">
                {l.batches.map((b) => {
                  const rec = l.recommended.find((x) => x.batchId === b.batchId);
                  return (
                    <div key={b.batchId} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--line)] p-2">
                      <div className="text-sm">
                        <div dir="ltr" className="font-medium">
                          {b.batchNumber ?? '—'} {b.expiryDate && `· ${b.expiryDate}`}
                        </div>
                        <div className="muted">
                          {b.available} {rec && <Badge tone="green">★ {rec.quantity}</Badge>} {b.nearExpiry && <Badge tone="red">{t('nearExpiry')}</Badge>}
                        </div>
                      </div>
                      <input
                        className="field w-24 text-center"
                        type="number"
                        min={0}
                        max={b.available}
                        value={d[b.batchId] ?? ''}
                        onChange={(e) => setDrafts({ ...drafts, [l.orderLineId]: { ...d, [b.batchId]: e.target.value } })}
                      />
                    </div>
                  );
                })}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setDrafts({ ...drafts, [l.orderLineId]: Object.fromEntries(l.recommended.map((x) => [x.batchId, String(x.quantity)])) })}
                  >
                    {t('useRecommended')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy || sum > l.need}
                    onClick={() =>
                      run(() =>
                        put<View>(`/orders/${id}/lines/${l.orderLineId}/picks`, {
                          picks: Object.entries(d)
                            .filter(([, v]) => Number(v) > 0)
                            .map(([batchId, v]) => ({ batchId, quantity: Number(v) })),
                        }),
                      )
                    }
                  >
                    {t('savePicks')} ({sum})
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setReduce({ ...reduce, [l.orderLineId]: r ? undefined! : { qty: '', reason: 'not_found', note: '' } })}>
                    {t('lessFound')}
                  </button>
                </div>
              </div>
            )}
            {r && (
              <div className="grid grid-cols-2 gap-2">
                <input className="field" type="number" min={0} max={l.quantity - 1} placeholder={t('newQty')} value={r.qty} onChange={(e) => setReduce({ ...reduce, [l.orderLineId]: { ...r, qty: e.target.value } })} />
                <select className="field" value={r.reason} onChange={(e) => setReduce({ ...reduce, [l.orderLineId]: { ...r, reason: e.target.value } })}>
                  {REDUCE_REASONS.map((x) => (
                    <option key={x} value={x}>
                      {tR(x)}
                    </option>
                  ))}
                </select>
                {r.reason === 'other' && <input className="field col-span-2" placeholder={tO('reason')} value={r.note} onChange={(e) => setReduce({ ...reduce, [l.orderLineId]: { ...r, note: e.target.value } })} />}
                <button
                  type="button"
                  className="btn btn-primary col-span-2"
                  disabled={busy || r.qty === ''}
                  onClick={() =>
                    run(async () => {
                      const v = await post<View>(`/orders/${id}/lines/${l.orderLineId}/reduce`, { newQuantity: Number(r.qty), reason: r.reason, note: r.note || null });
                      setReduce({ ...reduce, [l.orderLineId]: undefined! });
                      if (v.status !== 'preparing') router.replace(`/app/orders/${id}`);
                      return v;
                    })
                  }
                >
                  {tApp('save')}
                </button>
              </div>
            )}
          </Card>
        );
      })}
      <Card className="space-y-3">
        <p className="muted text-sm">{t('confirmHelp')}</p>
        <button
          type="button"
          className="btn btn-primary w-full"
          disabled={busy || !allPicked || view.status !== 'preparing'}
          onClick={() =>
            run(async () => {
              await post(`/orders/${id}/confirm-preparation`);
              router.replace(`/app/orders/${id}`);
            })
          }
        >
          {t('confirm')}
        </button>
        <button type="button" className="btn btn-secondary w-full" disabled={busy} onClick={() => run(async () => { await post(`/orders/${id}/release-preparing`); router.replace('/app/orders'); })}>
          {t('release')}
        </button>
      </Card>
      <Link href={`/app/orders/${id}`} className="btn btn-secondary">
        {tApp('back')}
      </Link>
    </div>
  );
}
