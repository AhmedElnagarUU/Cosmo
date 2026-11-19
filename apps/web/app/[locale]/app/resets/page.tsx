'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { get } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { Badge, Card, ErrorBox, Loading, PageTitle } from '@/components/ui';

interface Row {
  id: string;
  requestedAt: string;
  userType: 'customer' | 'employee';
  phone: string;
  customerId: string | null;
  employeeId: string | null;
  name: string;
}

// C-87: customers who tapped "forgot password". Opening one leads to "set temporary password".
export default function ResetsPage() {
  const t = useTranslations('resets');
  const locale = useLocale();
  const { data, error, loading } = useLoad(() => get<{ items: Row[] }>('/password-reset-requests'));

  return (
    <div>
      <PageTitle>{t('title')}</PageTitle>
      <ErrorBox error={error} />
      {loading && !data ? (
        <Loading />
      ) : data?.items.length === 0 ? (
        <p className="muted py-6 text-center">{t('none')}</p>
      ) : (
        <div className="space-y-2">
          {data?.items.map((r) => (
            <Link key={r.id} href={r.customerId ? `/app/customers/${r.customerId}` : `/app/employees/${r.employeeId}`} className="block">
              <Card className="flex flex-wrap items-center justify-between gap-2 hover:border-teal-500">
                <div>
                  <div className="font-semibold">{r.name}</div>
                  <div className="muted text-sm" dir="ltr">
                    {r.phone}
                  </div>
                </div>
                <div className="text-end">
                  <Badge>{t(r.userType)}</Badge>
                  <div className="muted text-xs">
                    {t('requested')}: {new Date(r.requestedAt).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-GB')}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
