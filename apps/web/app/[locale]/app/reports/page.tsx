'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { get } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { useName } from '@/lib/catalog';
import { Card, ErrorBox, Field, Loading, PageTitle } from '@/components/ui';

interface Sales {
  by: string;
  from: string;
  to: string;
  rows: Array<{ key: string; label: string; labelEn?: string; amount: string; quantity?: number; invoices?: number }>;
  total: string;
  returns: string;
  net: string;
}

// OWN-12: the five first reports (C-85). Simple numbers and lists, no report builder.
export default function ReportsPage() {
  const t = useTranslations('reports');
  const locale = useLocale();
  const name = useName();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
  const [from, setFrom] = useState(today.slice(0, 8) + '01');
  const [to, setTo] = useState(today);
  const [by, setBy] = useState<'day' | 'product' | 'customer'>('day');
  const sales = useLoad(() => get<Sales>(`/reports/sales?by=${by}&from=${from}&to=${to}`), [by, from, to]);
  const value = useLoad(() => get<{ costValue: string; sellingValue: string; items: Array<{ id: string; nameAr: string; nameEn: string; quantity: number; costValue: string }> }>('/reports/stock-value'));
  const max = Math.max(1, ...(sales.data?.rows.map((r) => Number(r.amount)) ?? [1]));

  return (
    <div className="space-y-4">
      <PageTitle>{t('title')}</PageTitle>
      <Card className="space-y-3">
        <h2 className="font-bold">{t('sales')}</h2>
        <div className="flex flex-wrap gap-2">
          {(['day', 'product', 'customer'] as const).map((x) => (
            <button key={x} type="button" className={`btn ${by === x ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setBy(x)}>
              {t(x === 'day' ? 'byDay' : x === 'product' ? 'byProduct' : 'byCustomer')}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('from')} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Field label={t('to')} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <ErrorBox error={sales.error} />
        {!sales.data ? (
          <Loading />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              {(['total', 'returns', 'net'] as const).map((k) => (
                <div key={k} className="rounded-lg border border-[var(--line)] p-2">
                  <div className="font-bold" dir="ltr">
                    {sales.data![k]}
                  </div>
                  <div className="muted text-xs">{t(k)}</div>
                </div>
              ))}
            </div>
            <ul className="space-y-2 text-sm">
              {sales.data.rows.map((r) => (
                <li key={r.key} className="space-y-1">
                  <div className="flex justify-between gap-2">
                    <span>
                      {r.labelEn ? name({ nameAr: r.label, nameEn: r.labelEn }) : by === 'day' ? new Date(r.label + 'T12:00:00').toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-GB') : r.label}
                      {r.quantity !== undefined && <span className="muted"> · {r.quantity}</span>}
                      {r.invoices !== undefined && <span className="muted"> · {r.invoices} {t('invoices')}</span>}
                    </span>
                    <b dir="ltr">{r.amount}</b>
                  </div>
                  <div className="h-2 rounded bg-[var(--line)]">
                    <div className="h-2 rounded bg-[var(--color-brand)]" style={{ width: `${(Number(r.amount) / max) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <Card className="space-y-3">
        <h2 className="font-bold">{t('stockValue')}</h2>
        {value.data && (
          <>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg border border-[var(--line)] p-2">
                <div className="font-bold" dir="ltr">
                  {value.data.costValue}
                </div>
                <div className="muted text-xs">{t('atCost')}</div>
              </div>
              <div className="rounded-lg border border-[var(--line)] p-2">
                <div className="font-bold" dir="ltr">
                  {value.data.sellingValue}
                </div>
                <div className="muted text-xs">{t('atSelling')}</div>
              </div>
            </div>
            <ul className="text-sm">
              {value.data.items.slice(0, 10).map((p) => (
                <li key={p.id} className="flex justify-between border-b border-[var(--line)] py-1 last:border-0">
                  <span>
                    {name(p)} <span className="muted">· {p.quantity}</span>
                  </span>
                  <span dir="ltr">{p.costValue}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <Card className="space-y-2">
        <h2 className="font-bold">{t('more')}</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/app/balances" className="btn btn-secondary">
            {t('customerBalances')}
          </Link>
          <Link href="/app/suppliers" className="btn btn-secondary">
            {t('supplierBalances')}
          </Link>
          <Link href="/app/stock" className="btn btn-secondary">
            {t('nearExpiry')}
          </Link>
        </div>
      </Card>
    </div>
  );
}
