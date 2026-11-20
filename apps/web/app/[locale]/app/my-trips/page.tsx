'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { get } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { useDateFormat } from '@/lib/catalog';
import { Badge, Card, ErrorBox, Loading, PageTitle } from '@/components/ui';

// DEL-01: the delivery person sees only their own trips
export default function MyTripsPage() {
  const t = useTranslations('delivery');
  const tNav = useTranslations('nav');
  const fmt = useDateFormat();
  const { data, error } = useLoad(() => get<{ items: Array<{ id: string; tripNumber: string; status: string; createdAt: string; stops: number }> }>('/my/trips'));
  return (
    <div className="space-y-4">
      <PageTitle>{tNav('myTrips')}</PageTitle>
      <ErrorBox error={error} />
      {!data ? (
        <Loading />
      ) : data.items.length === 0 ? (
        <p className="muted py-6 text-center">{t('noTrips')}</p>
      ) : (
        data.items.map((tr) => (
          <Link key={tr.id} href={`/app/trips/${tr.id}`} className="block">
            <Card className="flex items-center justify-between gap-2 hover:border-teal-500">
              <span>
                <span className="text-lg font-bold" dir="ltr">
                  {tr.tripNumber}
                </span>
                <span className="muted block text-sm">
                  {tr.stops} · {fmt(tr.createdAt, true)}
                </span>
              </span>
              <Badge tone={tr.status === 'in_progress' ? 'teal' : 'gray'}>{t(tr.status as 'planned')}</Badge>
            </Card>
          </Link>
        ))
      )}
    </div>
  );
}
