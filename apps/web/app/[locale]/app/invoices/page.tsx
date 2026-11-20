'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { get } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { useMe } from '@/lib/me-context';
import { useDateFormat } from '@/lib/catalog';
import { Card, ErrorBox, Loading, PageTitle } from '@/components/ui';
import { InvoiceStatus } from '@/components/invoice-status';

interface Row {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  total: string;
  remaining: string;
  status: string;
  paymentChoice: string;
  customerName: string;
  overdue: boolean;
  daysLate: number;
}

// ACC-01, ACC-08, CUS-11
export default function InvoicesPage() {
  const t = useTranslations('billing');
  const fmt = useDateFormat();
  const { me } = useMe();
  const staff = me.userType === 'employee';
  const tabs = [
    ['open', 'status=open'],
    ['overdue', 'overdue=1'],
    ['all', ''],
  ] as const;
  const [tab, setTab] = useState(0);
  const { data, error, loading } = useLoad(() => get<{ items: Row[] }>(`/invoices?limit=100&${tabs[tab]![1]}`), [tab]);

  return (
    <div className="space-y-4">
      <PageTitle>{t('invoices')}</PageTitle>
      <div className="flex flex-wrap gap-2">
        {tabs.map((x, i) => (
          <button key={x[0]} type="button" className={`btn ${tab === i ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab(i)}>
            {t(x[0])}
          </button>
        ))}
      </div>
      <ErrorBox error={error} />
      {loading && !data ? (
        <Loading />
      ) : data?.items.length === 0 ? (
        <p className="muted py-6 text-center">{t('none')}</p>
      ) : (
        data?.items.map((i) => (
          <Link key={i.id} href={`/app/invoices/${i.id}`} className="block">
            <Card className="space-y-1 hover:border-teal-500">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{staff ? i.customerName : <span dir="ltr">{i.invoiceNumber}</span>}</span>
                <InvoiceStatus status={i.status} overdue={i.overdue} />
              </div>
              <div className="muted flex flex-wrap justify-between gap-2 text-sm">
                <span>
                  {staff && (
                    <>
                      <span dir="ltr">{i.invoiceNumber}</span> ·{' '}
                    </>
                  )}
                  {fmt(i.invoiceDate)}
                  {i.paymentChoice === 'credit' && ` · ${t('due')} ${fmt(i.dueDate)}`}
                  {i.daysLate > 0 && <span className="text-red-700"> · {t('daysLate', { n: i.daysLate })}</span>}
                </span>
                <span className="text-[var(--text)]">
                  {t('remaining')}: <b dir="ltr">{i.remaining}</b> / <span dir="ltr">{i.total}</span>
                </span>
              </div>
            </Card>
          </Link>
        ))
      )}
    </div>
  );
}
