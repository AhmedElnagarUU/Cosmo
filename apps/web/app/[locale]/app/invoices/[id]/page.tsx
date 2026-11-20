'use client';

import { use, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CUSTOMER_PAYMENT_METHODS } from '@cosmo/shared';
import { Link } from '@/i18n/navigation';
import { get, post } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { hasAnyRole, useMe } from '@/lib/me-context';
import { useDateFormat, useName, type Named } from '@/lib/catalog';
import { Badge, Card, ErrorBox, Field, Loading } from '@/components/ui';
import { InvoiceStatus } from '@/components/invoice-status';

interface Invoice {
  id: string;
  invoiceNumber: string;
  orderId: string;
  orderNumber: string;
  status: string;
  invoiceDate: string;
  dueDate: string;
  paymentChoice: 'on_arrival' | 'credit';
  overdue: boolean;
  wholesaler: { name: string; phone: string | null; address: string | null };
  customer: { id: string; businessName: string; address: string; phone: string };
  subtotal: string;
  discountTotal: string;
  total: string;
  confirmedPaid: string;
  returnCredit: string;
  remaining: string;
  lines: Array<{ id: string; product: Named; quantity: number; isBonus: boolean; unitPrice: string; discountPercent: string | null; lineTotal: string }>;
  payments: Array<{ id: string; amount: string; method: string; reference: string | null; paidOn: string; status: string; rejectionReason: string | null; cancelReason: string | null }>;
  returns: Array<{ id: string; number: string; credit: string }>;
}

// ACC-07: the printed invoice shows what C-79 lists. ACC-04, ACC-05, ACC-12 for the accountant.
export default function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('billing');
  const tM = useTranslations('methods');
  const tApp = useTranslations('app');
  const name = useName();
  const fmt = useDateFormat();
  const { me } = useMe();
  const accountant = me.userType === 'employee' && hasAnyRole(me, 'accountant');
  const { data, error, reload } = useLoad(() => get<Invoice>(`/invoices/${id}`), [id]);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
  const [pay, setPay] = useState({ amount: '', method: 'cash', paidOn: today, reference: '' });
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

  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const i = data;

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xl font-bold">{i.wholesaler.name}</div>
            {i.wholesaler.address && <div className="muted text-sm">{i.wholesaler.address}</div>}
            {i.wholesaler.phone && (
              <div className="muted text-sm" dir="ltr">
                {i.wholesaler.phone}
              </div>
            )}
          </div>
          <div className="text-end">
            <div className="text-lg font-bold" dir="ltr">
              {i.invoiceNumber}
            </div>
            <InvoiceStatus status={i.status} overdue={i.overdue} />
          </div>
        </div>
        <div className="grid gap-2 text-sm md:grid-cols-2">
          <div>
            <div className="muted">{t('customer')}</div>
            <div className="font-semibold">{i.customer.businessName}</div>
            <div>{i.customer.address}</div>
            <div dir="ltr">{i.customer.phone}</div>
          </div>
          <div>
            <div>
              {t('date')}: {fmt(i.invoiceDate)}
            </div>
            <div>
              {t('order')}: <span dir="ltr">{i.orderNumber}</span>
            </div>
            <div>{i.paymentChoice === 'credit' ? t('credit') : t('onArrival')}</div>
            {i.paymentChoice === 'credit' && (
              <div className={i.overdue ? 'font-bold text-red-700' : ''}>
                {t('due')}: {fmt(i.dueDate)}
              </div>
            )}
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="muted border-b border-[var(--line)]">
              <th className="py-1 text-start" />
              <th className="py-1">{t('qty')}</th>
              <th className="py-1">{t('price')}</th>
              <th className="py-1 text-end">{t('total')}</th>
            </tr>
          </thead>
          <tbody>
            {i.lines.map((l) => (
              <tr key={l.id} className="border-b border-[var(--line)]">
                <td className="py-1">
                  {name(l.product)} {l.isBonus && <Badge tone="green">{t('free')}</Badge>}
                </td>
                <td className="py-1 text-center">{l.quantity}</td>
                <td className="py-1 text-center" dir="ltr">
                  {l.unitPrice}
                  {l.discountPercent && ` −${Number(l.discountPercent)}%`}
                </td>
                <td className="py-1 text-end" dir="ltr">
                  {l.lineTotal}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ms-auto max-w-xs space-y-1 text-sm">
          {i.discountTotal !== '0.00' && (
            <div className="flex justify-between">
              <span>−</span>
              <span dir="ltr">{i.discountTotal}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold">
            <span>{t('total')}</span>
            <span dir="ltr">{i.total}</span>
          </div>
          {i.returnCredit !== '0.00' && (
            <div className="flex justify-between">
              <span>{t('returnCredit')}</span>
              <span dir="ltr">−{i.returnCredit}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>{t('paid')}</span>
            <span dir="ltr">−{i.confirmedPaid}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>{t('remaining')}</span>
            <span dir="ltr">{i.remaining}</span>
          </div>
        </div>
      </Card>

      <button type="button" className="btn btn-secondary no-print" onClick={() => window.print()}>
        🖨 {t('print')}
      </button>
      <div className="no-print space-y-4">
        <ErrorBox error={actionError} />
        <Card className="space-y-2">
          <h2 className="font-bold">{t('payments')}</h2>
          {i.payments.length === 0 && <p className="muted text-sm">{t('none')}</p>}
          {i.payments.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] py-2 text-sm last:border-0">
              <span className={p.status === 'cancelled' || p.status === 'rejected' ? 'line-through muted' : ''}>
                <b dir="ltr">{p.amount}</b> · {tM(p.method)} · {fmt(p.paidOn)}
                {p.reference && <span dir="ltr"> · {p.reference}</span>}
              </span>
              <span className="flex items-center gap-2">
                <Badge tone={p.status === 'confirmed' ? 'green' : p.status === 'waiting' ? 'teal' : 'red'}>{t(p.status as 'waiting')}</Badge>
                {accountant && p.status === 'confirmed' && (
                  <button
                    type="button"
                    className="text-red-700 underline"
                    disabled={busy}
                    onClick={() => {
                      const reason = prompt(t('cancelReason'));
                      if (reason) void run(() => post(`/payments/${p.id}/cancel`, { reason }));
                    }}
                  >
                    {t('cancelPayment')}
                  </button>
                )}
              </span>
              {(p.rejectionReason || p.cancelReason) && <span className="w-full text-xs text-red-700">{p.rejectionReason ?? p.cancelReason}</span>}
            </div>
          ))}
        </Card>
        {accountant && i.remaining !== '0.00' && i.status !== 'cancelled' && (
          <Card className="space-y-3">
            <h2 className="font-bold">{t('recordPayment')}</h2>
            <form
              className="grid gap-3 md:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => post('/payments', { invoiceId: id, ...pay, reference: pay.reference || null }));
              }}
            >
              <Field label={t('remaining')} dir="ltr" inputMode="decimal" required placeholder={i.remaining} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
              <label className="block space-y-1">
                <span className="text-sm font-medium">{t('payments')}</span>
                <select className="field" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                  {CUSTOMER_PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {tM(m)}
                    </option>
                  ))}
                </select>
              </label>
              <Field label={t('date')} type="date" required value={pay.paidOn} onChange={(e) => setPay({ ...pay, paidOn: e.target.value })} />
              <Field label="#" dir="ltr" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />
              <div>
                <button className="btn btn-primary" disabled={busy}>
                  {t('save')}
                </button>
              </div>
            </form>
          </Card>
        )}
        <Link href="/app/invoices" className="btn btn-secondary">
          {tApp('back')}
        </Link>
      </div>
    </div>
  );
}
