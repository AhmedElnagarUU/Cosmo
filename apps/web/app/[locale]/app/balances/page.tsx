'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { get } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { Card, ErrorBox, Loading, PageTitle } from '@/components/ui';

// Customer balances, with overdue amounts shown separately (C-33)
export default function BalancesPage() {
  const t = useTranslations('billing');
  const { data, error } = useLoad(() => get<{ items: Array<{ id: string; businessName: string; balance: string; overdue: string }> }>('/customer-balances'));
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  return (
    <div className="space-y-4">
      <PageTitle>{t('balances')}</PageTitle>
      {data.items.length === 0 && <p className="muted py-6 text-center">{t('none')}</p>}
      {data.items.map((c) => (
        <Link key={c.id} href={`/app/statement?customerId=${c.id}`} className="block">
          <Card className="flex flex-wrap items-center justify-between gap-2 hover:border-teal-500">
            <span className="font-semibold">{c.businessName}</span>
            <span className="text-end">
              <b dir="ltr">{c.balance}</b>
              {c.overdue !== '0.00' && (
                <span className="block text-sm text-red-700">
                  {t('overdueAmount')}: <span dir="ltr">{c.overdue}</span>
                </span>
              )}
            </span>
          </Card>
        </Link>
      ))}
    </div>
  );
}
