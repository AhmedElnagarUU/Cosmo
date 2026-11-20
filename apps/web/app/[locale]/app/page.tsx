'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { get } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { useMe } from '@/lib/me-context';
import { Card } from '@/components/ui';
import { OpenStatusBadge } from '@/components/open-status';

type Dash = Record<string, number | string | undefined>;

// OWN-09 and a home screen for every role: what needs attention today. Every number opens its list.
const GROUPS: Array<{ title: 'actions' | 'stock' | 'money'; items: Array<{ key: string; href: string; alert?: boolean }> }> = [
  {
    title: 'actions',
    items: [
      { key: 'ordersToAccept', href: '/app/orders' },
      { key: 'ordersWaitingLong', href: '/app/orders', alert: true },
      { key: 'ordersWaitingCustomer', href: '/app/orders' },
      { key: 'ordersToPrepare', href: '/app/orders' },
      { key: 'ordersReady', href: '/app/delivery' },
      { key: 'tripsInProgress', href: '/app/delivery' },
      { key: 'failedDeliveries', href: '/app/goods-back', alert: true },
      { key: 'missingPapers', href: '/app/delivery', alert: true },
      { key: 'myTrips', href: '/app/my-trips' },
      { key: 'supplierReturnsWaiting', href: '/app/supplier-returns' },
      { key: 'passwordRequests', href: '/app/resets' },
      { key: 'returnsToCheck', href: '/app/returns' },
    ],
  },
  {
    title: 'stock',
    items: [
      { key: 'goodsToReturn', href: '/app/goods-back' },
      { key: 'outOfStock', href: '/app/products', alert: true },
      { key: 'nearExpiry', href: '/app/stock' },
      { key: 'expired', href: '/app/stock', alert: true },
    ],
  },
  {
    title: 'money',
    items: [
      { key: 'paymentsWaiting', href: '/app/payments' },
      { key: 'tripsToClose', href: '/app/delivery' },
      { key: 'leftOverReturns', href: '/app/returns' },
      { key: 'unpaidTotal', href: '/app/invoices' },
      { key: 'overdueTotal', href: '/app/invoices', alert: true },
      { key: 'overdueInvoices', href: '/app/invoices', alert: true },
      { key: 'owedToSuppliers', href: '/app/suppliers' },
    ],
  },
];

export default function HomePage() {
  const { me } = useMe();
  const t = useTranslations('home');
  const tD = useTranslations('dash');
  const tRoles = useTranslations('roles');
  const tNav = useTranslations('nav');
  const staff = me.userType === 'employee';
  const dash = useLoad(() => (staff ? get<Dash>('/dashboard') : Promise.resolve({} as Dash)), [staff]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t('hello', { name: me.name })}</h1>
      <Card>
        <OpenStatusBadge status={me.openStatus} />
      </Card>
      {staff ? (
        <>
          <p className="muted text-sm">{t('staffIntro', { roles: me.roles.map((r) => tRoles(r)).join('، ') })}</p>
          {GROUPS.map((g) => {
            const items = g.items.filter((i) => dash.data?.[i.key] !== undefined);
            if (!items.length) return null;
            return (
              <div key={g.title} className="space-y-2">
                <h2 className="font-bold">{tD(g.title)}</h2>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {items.map((i) => {
                    const v = dash.data![i.key]!;
                    const zero = v === 0 || v === '0.00';
                    return (
                      <Link key={i.key} href={i.href}>
                        <Card className={`h-full hover:border-teal-500 ${i.alert && !zero ? 'border-red-400' : ''}`}>
                          <div className={`text-2xl font-bold ${i.alert && !zero ? 'text-red-700' : zero ? 'muted' : ''}`} dir="ltr">
                            {v}
                          </div>
                          <div className="muted text-sm">{tD(i.key)}</div>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      ) : (
        <Card className="space-y-3">
          <p>{t('customerIntro')}</p>
          <Link href="/app/catalog" className="btn btn-primary">
            {tNav('catalog')}
          </Link>
        </Card>
      )}
    </div>
  );
}
