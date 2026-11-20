'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { get } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { useMe } from '@/lib/me-context';
import { useDateFormat } from '@/lib/catalog';
import { Badge, Card, ErrorBox, Loading, PageTitle } from '@/components/ui';
import { OrderStatusBadge } from '@/components/order-status';

interface Row {
  id: string;
  orderNumber: string;
  status: string;
  total: string;
  paymentChoice: 'on_arrival' | 'credit';
  placedAt: string;
  placedWhileClosed: boolean;
  customerName: string;
  lines: number;
  reportedToOwner?: boolean;
}

// STK-03: new orders, oldest first. Customers see their own orders (CUS-09).
export default function OrdersPage() {
  const t = useTranslations('orders');
  const fmt = useDateFormat();
  const { me } = useMe();
  const staff = me.userType === 'employee';
  const tabs = staff
    ? ([
        ['placed', 'placed', 'oldest', t('tabPlaced')],
        ['waiting', 'waiting_for_customer', 'oldest', t('tabWaiting')],
        ['accepted', 'accepted', 'oldest', t('tabAccepted')],
        ['all', '', 'newest', t('tabAll')],
      ] as const)
    : null;
  const [tab, setTab] = useState(0);
  const query = tabs ? `status=${tabs[tab]![1]}&sort=${tabs[tab]![2]}` : '';
  const { data, error, loading } = useLoad(() => get<{ items: Row[] }>(`/orders?limit=100&${query}`), [query]);

  return (
    <div className="space-y-4">
      <PageTitle>{t('title')}</PageTitle>
      {tabs && (
        <div className="flex flex-wrap gap-2">
          {tabs.map((x, i) => (
            <button key={x[0]} type="button" className={`btn ${tab === i ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab(i)}>
              {x[3]}
            </button>
          ))}
        </div>
      )}
      <ErrorBox error={error} />
      {loading && !data ? (
        <Loading />
      ) : data?.items.length === 0 ? (
        <p className="muted py-6 text-center">{t('none')}</p>
      ) : (
        <div className="space-y-2">
          {data?.items.map((o) => (
            <Link key={o.id} href={`/app/orders/${o.id}`} className="block">
              <Card className="space-y-1 hover:border-teal-500">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{staff ? o.customerName : <span dir="ltr">{o.orderNumber}</span>}</span>
                  <OrderStatusBadge status={o.status} staff={staff} />
                </div>
                <div className="muted flex flex-wrap justify-between gap-2 text-sm">
                  <span>
                    {staff && (
                      <>
                        <span dir="ltr">{o.orderNumber}</span> ·{' '}
                      </>
                    )}
                    {t('lines', { n: o.lines })} · {fmt(o.placedAt, true)}
                  </span>
                  <span className="font-bold text-[var(--text)]" dir="ltr">
                    {o.total}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {o.paymentChoice === 'credit' && <Badge>{t('credit')}</Badge>}
                  {staff && o.placedWhileClosed && <Badge>{t('closed')}</Badge>}
                  {o.reportedToOwner && <Badge tone="red">{t('waitingLong')}</Badge>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
