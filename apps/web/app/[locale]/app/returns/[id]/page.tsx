'use client';

import { use, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DOOR_PAYMENT_METHODS } from '@cosmo/shared';
import { Link } from '@/i18n/navigation';
import { get, post } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { hasAnyRole, useMe } from '@/lib/me-context';
import { useDateFormat, useName, type Named } from '@/lib/catalog';
import { Badge, Card, ErrorBox, Loading, PageTitle } from '@/components/ui';

interface Ret {
  id: string;
  returnNumber: string;
  source: 'normal' | 'at_the_door';
  status: 'requested' | 'completed' | 'cancelled';
  reason: string;
  note: string | null;
  customer: { businessName: string };
  orderId: string;
  orderNumber: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  creditAmount: string;
  appliedToInvoice: string;
  leftOver: string;
  leftOverChoice: 'refund' | 'keep_as_credit' | null;
  refunded: string;
  createdAt: string;
  lines: Array<{ id: string; product: Named; batchNumber: string | null; quantity: number; condition: 'sellable' | 'damaged' | null; lineCredit: string }>;
  refunds: Array<{ id: string; amount: string; method: string; refundedOn: string }>;
}

export default function ReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('returns');
  const tM = useTranslations('methods');
  const tApp = useTranslations('app');
  const name = useName();
  const fmt = useDateFormat();
  const { me } = useMe();
  const keeper = me.userType === 'employee' && hasAnyRole(me, 'stock_manager');
  const accountant = me.userType === 'employee' && hasAnyRole(me, 'accountant');
  const { data, error, setData } = useLoad(() => get<Ret>(`/returns/${id}`), [id]);
  const [conditions, setConditions] = useState<Record<string, 'sellable' | 'damaged'>>({});
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
  const [refund, setRefund] = useState({ amount: '', method: 'cash', reference: '' });
  const [actionError, setActionError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) setConditions(Object.fromEntries(data.lines.map((l) => [l.id, l.condition ?? 'sellable'])));
  }, [data]);

  async function run(fn: () => Promise<Ret>) {
    setBusy(true);
    setActionError(null);
    try {
      setData(await fn());
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const r = data;
  const leftToRefund = (Math.round(Number(r.leftOver) * 100) - Math.round(Number(r.refunded) * 100)) / 100;

  return (
    <div className="space-y-4">
      <PageTitle action={<Badge tone={r.status === 'completed' ? 'green' : 'teal'}>{t(r.status)}</Badge>}>
        <span dir="ltr">{r.returnNumber}</span> · {r.customer.businessName}
      </PageTitle>
      <ErrorBox error={actionError} />
      <Card className="space-y-1 text-sm">
        <div>
          {t('reason')}: {t(`reason_${r.reason}` as 'reason_other')}
          {r.note && ` · ${r.note}`}
        </div>
        <div className="muted">
          <Link href={`/app/orders/${r.orderId}`} className="underline" dir="ltr">
            {r.orderNumber}
          </Link>
          {r.invoiceId && (
            <>
              {' · '}
              <Link href={`/app/invoices/${r.invoiceId}`} className="underline" dir="ltr">
                {r.invoiceNumber}
              </Link>
            </>
          )}{' '}
          · {fmt(r.createdAt)}
        </div>
        {r.source === 'at_the_door' && <Badge>{t('atDoor')}</Badge>}
      </Card>

      <Card className="space-y-2">
        {r.lines.map((l) => (
          <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] py-2 last:border-0">
            <span>
              {l.quantity} × {name(l.product)}{' '}
              <span className="muted text-xs" dir="ltr">
                {l.batchNumber ?? ''}
              </span>
            </span>
            {keeper && r.status === 'requested' ? (
              <span className="flex gap-1">
                {(['sellable', 'damaged'] as const).map((c) => (
                  <button key={c} type="button" className={`btn ${conditions[l.id] === c ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setConditions({ ...conditions, [l.id]: c })}>
                    {t(c)}
                  </button>
                ))}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                {l.condition && <Badge tone={l.condition === 'sellable' ? 'green' : 'red'}>{t(l.condition)}</Badge>}
                <b dir="ltr">{l.lineCredit}</b>
              </span>
            )}
          </div>
        ))}
        {keeper && r.status === 'requested' && (
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => run(() => post<Ret>(`/returns/${id}/check`, { lines: Object.entries(conditions).map(([lineId, condition]) => ({ lineId, condition })) }))}
            >
              {t('confirmCheck')}
            </button>
            {r.source === 'normal' && (
              <button type="button" className="btn btn-secondary text-red-700" disabled={busy} onClick={() => run(() => post<Ret>(`/returns/${id}/cancel`))}>
                {t('cancel')}
              </button>
            )}
          </div>
        )}
      </Card>

      <Card className="space-y-1 text-sm">
        <div className="flex justify-between font-bold">
          <span>{t('credit')}</span>
          <span dir="ltr">{r.creditAmount}</span>
        </div>
        {r.status === 'completed' && (
          <>
            <div className="flex justify-between">
              <span>{t('applied')}</span>
              <span dir="ltr">{r.appliedToInvoice}</span>
            </div>
            {r.leftOver !== '0.00' && (
              <div className="flex justify-between">
                <span>{t('leftOver')}</span>
                <span dir="ltr">{r.leftOver}</span>
              </div>
            )}
            {r.refunded !== '0.00' && (
              <div className="flex justify-between">
                <span>{t('refunded')}</span>
                <span dir="ltr">{r.refunded}</span>
              </div>
            )}
            {r.leftOverChoice === 'keep_as_credit' && <p className="text-green-700">{t('keptAsCredit')}</p>}
          </>
        )}
      </Card>

      {/* ACC-13: money back or credit (C-69) */}
      {accountant && r.status === 'completed' && r.leftOver !== '0.00' && (
        <Card className="space-y-3">
          <h2 className="font-bold">{t('refundOrCredit')}</h2>
          {!r.leftOverChoice || (r.leftOverChoice !== 'refund' && r.refunded === '0.00') ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => post<Ret>(`/returns/${id}/left-over`, { choice: 'refund' }))}>
                {t('chooseRefund')}
              </button>
              {r.leftOverChoice !== 'keep_as_credit' && (
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => run(() => post<Ret>(`/returns/${id}/left-over`, { choice: 'keep_as_credit' }))}>
                  {t('chooseCredit')}
                </button>
              )}
            </div>
          ) : (
            leftToRefund > 0 && (
              <div className="grid gap-2 md:grid-cols-3">
                <input className="field" dir="ltr" inputMode="decimal" placeholder={leftToRefund.toFixed(2)} value={refund.amount} onChange={(e) => setRefund({ ...refund, amount: e.target.value })} />
                <select className="field" value={refund.method} onChange={(e) => setRefund({ ...refund, method: e.target.value })}>
                  {DOOR_PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {tM(m)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || !refund.amount}
                  onClick={() => run(() => post<Ret>(`/returns/${id}/refund`, { amount: refund.amount, method: refund.method, reference: refund.reference || null, refundedOn: today }))}
                >
                  {t('payBack')}
                </button>
              </div>
            )
          )}
          {r.refunds.map((x) => (
            <div key={x.id} className="text-sm">
              <span dir="ltr">{x.amount}</span> · {tM(x.method)} · {fmt(x.refundedOn)}
            </div>
          ))}
        </Card>
      )}
      <Link href="/app/returns" className="btn btn-secondary">
        {tApp('back')}
      </Link>
    </div>
  );
}
