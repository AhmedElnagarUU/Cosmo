'use client';

import { use, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DOOR_PAYMENT_METHODS, FAILURE_REASONS } from '@cosmo/shared';
import { useRouter } from '@/i18n/navigation';
import { del, get, patch, post } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { hasAnyRole, useMe } from '@/lib/me-context';
import { useName, type Named } from '@/lib/catalog';
import { Badge, Card, ErrorBox, Loading, PageTitle } from '@/components/ui';

interface Stop {
  id: string;
  position: number;
  orderId: string;
  orderNumber: string;
  customer: { businessName: string; phone: string; address: string; area: string | null };
  total: string;
  paymentChoice: 'on_arrival' | 'credit';
  refusedCredit: string | null;
  toCollect: string;
  result: 'waiting' | 'delivered' | 'failed';
  failureReason: string | null;
  failureNote: string | null;
  signedPaperReceived: boolean;
  keepCold: boolean;
  lines: Array<{ id: string; product: Named; quantity: number; bonusQty: number; keepCold: boolean }>;
  payments: Array<{ id: string; amount: string; method: string; reference: string | null; status: string }>;
}
interface Trip {
  id: string;
  tripNumber: string;
  status: 'planned' | 'in_progress' | 'finished' | 'closed';
  deliveryPersonId: string;
  deliveryPerson: string | null;
  cashExpected: string | null;
  stops: Stop[];
}

const key = () => 'k' + Math.random().toString(36).slice(2) + Date.now().toString(36);

// DEL-01 to DEL-08 on the phone, and the delivery manager's view of one trip (DM-04)
export default function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('delivery');
  const tF = useTranslations('failReason');
  const tM = useTranslations('methods');
  const name = useName();
  const router = useRouter();
  const { me } = useMe();
  const { data, error, setData } = useLoad(() => get<Trip>(`/trips/${id}`), [id]);
  const [open, setOpen] = useState<{ stopId: string; mode: 'deliver' | 'fail' | 'pay' } | null>(null);
  const [refused, setRefused] = useState<Record<string, string>>({});
  const [refusedReason, setRefusedReason] = useState('');
  const [fail, setFail] = useState({ reason: 'not_available', note: '' });
  const [pay, setPay] = useState({ method: 'cash', amount: '', reference: '' });
  const payKey = useRef(key());
  const [actionError, setActionError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<Trip>) {
    setBusy(true);
    setActionError(null);
    try {
      setData(await fn());
      setOpen(null);
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const mine = data.deliveryPersonId === me.userId;
  const isManager = hasAnyRole(me, 'delivery_manager');

  return (
    <div className="space-y-4">
      <PageTitle action={<Badge tone={data.status === 'in_progress' ? 'teal' : 'gray'}>{t(data.status)}</Badge>}>
        <span dir="ltr">{data.tripNumber}</span> · {data.deliveryPerson}
      </PageTitle>
      <ErrorBox error={actionError} />

      {mine && data.status === 'planned' && (
        <Card className="space-y-2">
          <p className="muted text-sm">{t('startHelp')}</p>
          <button type="button" className="btn btn-primary w-full text-lg" disabled={busy} onClick={() => run(() => post<Trip>(`/trips/${id}/start`))}>
            {t('start')}
          </button>
        </Card>
      )}
      {isManager && data.status === 'planned' && (
        <button
          type="button"
          className="btn btn-secondary text-red-700"
          disabled={busy}
          onClick={async () => {
            await del(`/trips/${id}`).catch(setActionError);
            router.replace('/app/delivery');
          }}
        >
          {t('deleteTrip')}
        </button>
      )}
      {data.cashExpected && <Card className="text-lg font-bold">{t('cashTotal', { amount: data.cashExpected })}</Card>}

      {data.stops.map((s, i) => {
        const isOpen = open?.stopId === s.id;
        return (
          <Card key={s.id} className={`space-y-2 ${s.result === 'delivered' ? 'border-green-500' : s.result === 'failed' ? 'border-red-500' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="muted text-xs">{t('position', { n: s.position })}</div>
                <div className="text-lg font-semibold">{s.customer.businessName}</div>
                <div className="text-sm">
                  {s.customer.address}
                  {s.customer.area && ` · ${s.customer.area}`}
                </div>
              </div>
              <a href={`tel:${s.customer.phone}`} className="btn btn-secondary shrink-0">
                📞 {t('call')}
              </a>
            </div>
            <ul className="text-sm">
              {s.lines.map((l) => (
                <li key={l.id}>
                  {l.quantity}
                  {l.bonusQty > 0 && ` + ${l.bonusQty}`} × {name(l.product)} {l.keepCold && '❄'}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span dir="ltr" className="muted">
                {s.orderNumber}
              </span>
              {s.paymentChoice === 'credit' ? (
                <Badge>{t('nothingToCollect')}</Badge>
              ) : (
                <Badge tone="teal">
                  {t('toCollect')}: {s.toCollect}
                </Badge>
              )}
              {s.refusedCredit && <Badge tone="red">{t('refusedCredit', { amount: s.refusedCredit })}</Badge>}
              {s.result === 'delivered' && <Badge tone="green">{t('delivered')}</Badge>}
              {s.result === 'failed' && (
                <Badge tone="red">
                  {t('failed')}: {tF(s.failureReason!)}
                </Badge>
              )}
              {isManager && s.result === 'delivered' && s.signedPaperReceived && <Badge tone="green">✓ {t('paperIn')}</Badge>}
            </div>
            {s.payments.map((p) => (
              <div key={p.id} className="text-sm">
                <span dir="ltr">{p.amount}</span> · {tM(p.method)} {p.status === 'waiting' && <span className="muted">· {t('waitingConfirm')}</span>}
              </div>
            ))}

            {mine && data.status === 'in_progress' && s.result === 'waiting' && !isOpen && (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="btn btn-primary" onClick={() => setOpen({ stopId: s.id, mode: 'deliver' })}>
                  {t('deliver')}
                </button>
                <button type="button" className="btn btn-secondary text-red-700" onClick={() => setOpen({ stopId: s.id, mode: 'fail' })}>
                  {t('fail')}
                </button>
                {i > 0 && (
                  <button
                    type="button"
                    className="btn btn-secondary col-span-2"
                    disabled={busy}
                    onClick={() => {
                      const ids = data.stops.map((x) => x.id);
                      [ids[i - 1], ids[i]] = [ids[i]!, ids[i - 1]!];
                      void run(() => patch<Trip>(`/trips/${id}/stop-order`, { stopIds: ids }));
                    }}
                  >
                    ↑ {t('moveUp')}
                  </button>
                )}
              </div>
            )}

            {isOpen && open.mode === 'deliver' && (
              <div className="space-y-2 rounded-lg border border-[var(--line)] p-2">
                <p className="text-sm font-medium">{t('refused')}</p>
                {s.lines.map((l) => (
                  <label key={l.id} className="flex items-center justify-between gap-2 text-sm">
                    <span>{name(l.product)}</span>
                    <input
                      className="field w-20 text-center"
                      type="number"
                      min={0}
                      max={l.quantity + l.bonusQty}
                      placeholder="0"
                      value={refused[l.id] ?? ''}
                      onChange={(e) => setRefused({ ...refused, [l.id]: e.target.value })}
                    />
                  </label>
                ))}
                {Object.values(refused).some((v) => Number(v) > 0) && (
                  <input className="field" placeholder={t('refusedReason')} value={refusedReason} onChange={(e) => setRefusedReason(e.target.value)} />
                )}
                <button
                  type="button"
                  className="btn btn-primary w-full"
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      post<Trip>(`/trip-stops/${s.id}/deliver`, {
                        refused: Object.entries(refused)
                          .filter(([, v]) => Number(v) > 0)
                          .map(([orderLineId, v]) => ({ orderLineId, quantity: Number(v) })),
                        refusedReason: refusedReason || null,
                      }),
                    )
                  }
                >
                  ✓ {t('deliver')}
                </button>
              </div>
            )}

            {isOpen && open.mode === 'fail' && (
              <div className="space-y-2 rounded-lg border border-[var(--line)] p-2">
                <select className="field" value={fail.reason} onChange={(e) => setFail({ ...fail, reason: e.target.value })}>
                  {FAILURE_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {tF(r)}
                    </option>
                  ))}
                </select>
                <input className="field" placeholder={t('note')} value={fail.note} onChange={(e) => setFail({ ...fail, note: e.target.value })} />
                <button type="button" className="btn btn-primary w-full" disabled={busy} onClick={() => run(() => post<Trip>(`/trip-stops/${s.id}/fail`, { reason: fail.reason, note: fail.note || null }))}>
                  {t('fail')}
                </button>
              </div>
            )}

            {/* DEL-05: record the payment collected, waiting for the accountant (C-27) */}
            {mine && s.result === 'delivered' && s.paymentChoice === 'on_arrival' && s.toCollect !== '0.00' && (
              isOpen && open.mode === 'pay' ? (
                <div className="space-y-2 rounded-lg border border-[var(--line)] p-2">
                  <select className="field" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                    {DOOR_PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {tM(m)}
                      </option>
                    ))}
                  </select>
                  <input className="field" dir="ltr" inputMode="decimal" placeholder={t('amount')} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
                  {pay.method !== 'cash' && <input className="field" dir="ltr" placeholder={t('reference')} value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />}
                  <button
                    type="button"
                    className="btn btn-primary w-full"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const r = await post<Trip>(`/trip-stops/${s.id}/payments`, { method: pay.method, amount: pay.amount, reference: pay.reference || null }, { 'Idempotency-Key': payKey.current });
                        payKey.current = key();
                        return r;
                      })
                    }
                  >
                    {t('pay')}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary w-full"
                  onClick={() => {
                    setPay({ method: 'cash', amount: s.toCollect, reference: '' });
                    setOpen({ stopId: s.id, mode: 'pay' });
                  }}
                >
                  {t('pay')} ({s.toCollect})
                </button>
              )
            )}
          </Card>
        );
      })}
    </div>
  );
}
