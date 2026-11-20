'use client';

import { use, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { REDUCE_REASONS } from '@cosmo/shared';
import { Link } from '@/i18n/navigation';
import { get, post } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { hasAnyRole, useMe } from '@/lib/me-context';
import { useDateFormat, useName, type Named } from '@/lib/catalog';
import { Badge, Card, ErrorBox, Loading, PageTitle } from '@/components/ui';
import { OrderStatusBadge } from '@/components/order-status';

interface Line {
  id: string;
  product: Named;
  packSize: string;
  keepCold: boolean;
  mustHave: boolean;
  orderedQty: number;
  currentQty: number;
  bonusQty: number;
  unitPrice: string;
  discountPercent: string | null;
  lineTotal: string;
  changes: Array<{ stage: string; oldQty: number; newQty: number; reason: string; note: string | null; by: string | null; at: string }>;
}
interface Order {
  id: string;
  orderNumber: string;
  status: string;
  paymentChoice: 'on_arrival' | 'credit';
  customer: { id: string; businessName: string; phone?: string; address?: string };
  placedBy: string | null;
  subtotal: string;
  discountTotal: string;
  total: string;
  placedWhileClosed: boolean;
  placedAt: string;
  reportedToOwner?: boolean;
  lines: Line[];
  history: Array<{ from: string | null; to: string; by: string | null; reason: string | null; at: string }>;
}

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('orders');
  const tCart = useTranslations('cart');
  const tStatus = useTranslations('orderStatus');
  const tReason = useTranslations('reduceReason');
  const tApp = useTranslations('app');
  const tPrep = useTranslations('prepare');
  const name = useName();
  const fmt = useDateFormat();
  const placed = useSearchParams().get('placed') === '1';
  const { me } = useMe();
  const staff = me.userType === 'employee';
  const canDecide = staff && hasAnyRole(me, 'stock_manager');
  const { data, error, setData } = useLoad(() => get<Order>(`/orders/${id}`), [id]);
  const [editing, setEditing] = useState<Record<string, { qty: string; reason: string; note: string }> | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function act(path: string, body?: object) {
    setBusy(true);
    setActionError(null);
    try {
      setData(await post<Order>(`/orders/${id}/${path}`, body));
      setEditing(null);
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const o = data;
  const customerCanCancel = !staff && ['placed', 'accepted'].includes(o.status);
  const staffCanCancel = canDecide && ['placed', 'waiting_for_customer', 'accepted', 'preparing', 'ready'].includes(o.status);

  return (
    <div className="space-y-4">
      <PageTitle action={<OrderStatusBadge status={o.status} staff={staff} />}>
        <span dir="ltr">{o.orderNumber}</span>
        {staff && ` · ${o.customer.businessName}`}
      </PageTitle>
      {placed && o.status === 'placed' && (
        <p role="status" className="rounded-lg bg-green-50 p-3 text-green-900 dark:bg-green-950 dark:text-green-100">
          {tCart('placed', { number: o.orderNumber })}
        </p>
      )}
      <ErrorBox error={actionError} />

      {/* C-39: the customer answers a change to a must-have product */}
      {!staff && o.status === 'waiting_for_customer' && (
        <Card className="space-y-3 border-teal-500">
          <h2 className="font-bold">{t('answerTitle')}</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => act('answer', { answer: 'accept_change' })}>
              {t('acceptChange')}
            </button>
            <button type="button" className="btn btn-secondary text-red-700" disabled={busy} onClick={() => act('answer', { answer: 'cancel' })}>
              {t('cancelOrder')}
            </button>
          </div>
        </Card>
      )}

      <Card className="space-y-1 text-sm">
        <div>
          {t('placedAt')}: {fmt(o.placedAt, true)}
          {o.placedBy && ` · ${t('placedBy', { name: o.placedBy })}`}
        </div>
        <div>
          {t('payment')}: {o.paymentChoice === 'credit' ? t('credit') : t('onArrival')}
        </div>
        {staff && o.customer.phone && (
          <div className="muted">
            <span dir="ltr">{o.customer.phone}</span> · {o.customer.address}
          </div>
        )}
        <div className="flex flex-wrap gap-1 pt-1">
          {staff && o.placedWhileClosed && <Badge>{t('closed')}</Badge>}
          {o.reportedToOwner && <Badge tone="red">{t('waitingLong')}</Badge>}
        </div>
      </Card>

      <Card className="space-y-3">
        {o.lines.map((l) => {
          const ed = editing?.[l.id];
          return (
            <div key={l.id} className={`space-y-1 border-b border-[var(--line)] pb-3 last:border-0 ${l.currentQty === 0 ? 'opacity-60' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="font-semibold">{name(l.product)}</span>
                <span className="font-bold" dir="ltr">
                  {l.lineTotal}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>
                  {l.currentQty !== l.orderedQty ? (
                    <span dir="ltr">
                      <span className="line-through">{l.orderedQty}</span> → <b>{l.currentQty}</b>
                    </span>
                  ) : (
                    <b>{l.currentQty}</b>
                  )}{' '}
                  × <span dir="ltr">{l.unitPrice}</span>
                  {l.discountPercent && ` (−${Number(l.discountPercent)}%)`}
                </span>
                {l.bonusQty > 0 && <Badge tone="green">{t('free', { n: l.bonusQty })}</Badge>}
                {l.mustHave && <Badge tone="teal">{t('mustHave')}</Badge>}
                {l.keepCold && <Badge tone="teal">❄ {t('keepCold')}</Badge>}
              </div>
              {l.changes.map((c, i) => (
                <div key={i} className="text-xs text-amber-800 dark:text-amber-200">
                  <span dir="ltr">
                    {c.oldQty} → {c.newQty}
                  </span>{' '}
                  · {tReason(c.reason)}
                  {c.note && `: ${c.note}`}
                  {staff && c.by && ` · ${c.by}`}
                </div>
              ))}
              {ed && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <input
                    className="field"
                    type="number"
                    min={0}
                    max={l.currentQty}
                    placeholder={t('newQty')}
                    value={ed.qty}
                    onChange={(e) => setEditing({ ...editing!, [l.id]: { ...ed, qty: e.target.value } })}
                  />
                  <select className="field" value={ed.reason} onChange={(e) => setEditing({ ...editing!, [l.id]: { ...ed, reason: e.target.value } })}>
                    {REDUCE_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {tReason(r)}
                      </option>
                    ))}
                  </select>
                  {ed.reason === 'other' && (
                    <input className="field col-span-2" placeholder={t('reason')} value={ed.note} onChange={(e) => setEditing({ ...editing!, [l.id]: { ...ed, note: e.target.value } })} />
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div className="space-y-1 border-t border-[var(--line)] pt-2">
          {o.discountTotal !== '0.00' && (
            <div className="flex justify-between text-sm text-green-700">
              <span>{tCart('discount')}</span>
              <span dir="ltr">−{o.discountTotal}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold">
            <span>{tCart('total')}</span>
            <span dir="ltr">{o.total}</span>
          </div>
        </div>
      </Card>

      {/* STK-04, STK-05, STK-18 */}
      {canDecide && o.status === 'placed' && (
        <Card className="flex flex-wrap gap-2">
          {editing ? (
            <>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() =>
                  act('accept', {
                    changes: Object.entries(editing)
                      .filter(([, v]) => v.qty !== '')
                      .map(([lineId, v]) => ({ orderLineId: lineId, newQuantity: Number(v.qty), reason: v.reason, note: v.note || null })),
                  })
                }
              >
                {t('acceptWithChanges')}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>
                ✕
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => act('accept', { changes: [] })}>
                {t('accept')}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setEditing(Object.fromEntries(o.lines.map((l) => [l.id, { qty: '', reason: 'not_found', note: '' }])))}
              >
                {t('changeQty')}
              </button>
              <button
                type="button"
                className="btn btn-secondary text-red-700"
                disabled={busy}
                onClick={() => {
                  const reason = prompt(t('rejectReason'));
                  if (reason) void act('reject', { reason });
                }}
              >
                {t('reject')}
              </button>
            </>
          )}
        </Card>
      )}

      {canDecide && (o.status === 'accepted' || o.status === 'preparing') && (
        <Link href={`/app/orders/${o.id}/prepare`} className="btn btn-primary w-full">
          {o.status === 'accepted' ? tPrep('start') : tPrep('continue')}
        </Link>
      )}

      {(customerCanCancel || staffCanCancel) && (
        <button
          type="button"
          className="btn btn-secondary text-red-700"
          disabled={busy}
          onClick={() => {
            if (staff) {
              const reason = prompt(t('cancelReason'));
              if (reason) void act('cancel', { reason });
            } else if (confirm(t('confirmCancel'))) void act('cancel', {});
          }}
        >
          {t('cancel')}
        </button>
      )}

      <Card className="space-y-1">
        <h2 className="font-bold">{t('history')}</h2>
        <ul className="text-sm">
          {o.history.map((h, i) => (
            <li key={i} className="py-1">
              {tStatus(h.to)} · <span className="muted">{fmt(h.at, true)}</span>
              {h.by && <span className="muted"> · {h.by}</span>}
              {h.reason && <div className="text-red-700">{h.reason}</div>}
            </li>
          ))}
        </ul>
      </Card>
      <Link href="/app/orders" className="btn btn-secondary">
        {tApp('back')}
      </Link>
    </div>
  );
}
