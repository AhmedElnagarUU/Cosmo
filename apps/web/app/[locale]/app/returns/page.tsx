'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { get } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { useMe } from '@/lib/me-context';
import { useDateFormat } from '@/lib/catalog';
import { Badge, Card, ErrorBox, Loading, PageTitle } from '@/components/ui';

interface Row {
  id: string;
  returnNumber: string;
  status: 'requested' | 'completed' | 'cancelled';
  source: 'normal' | 'at_the_door';
  creditAmount: string;
  leftOver: string;
  leftOverChoice: string | null;
  createdAt: string;
  customerName: string;
  orderNumber: string;
}

// CUS-13, STK-13, ACC-11, ACC-13
export default function ReturnsPage() {
  const t = useTranslations('returns');
  const fmt = useDateFormat();
  const { me } = useMe();
  const staff = me.userType === 'employee';
  const { data, error } = useLoad(() => get<{ items: Row[] }>('/returns'));
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  return (
    <div className="space-y-4">
      <PageTitle>{t('title')}</PageTitle>
      {data.items.length === 0 && <p className="muted py-6 text-center">{t('none')}</p>}
      {data.items.map((r) => (
        <Link key={r.id} href={`/app/returns/${r.id}`} className="block">
          <Card className="space-y-1 hover:border-teal-500">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{staff ? r.customerName : <span dir="ltr">{r.returnNumber}</span>}</span>
              <span className="flex gap-1">
                {r.source === 'at_the_door' && <Badge>{t('atDoor')}</Badge>}
                <Badge tone={r.status === 'completed' ? 'green' : r.status === 'requested' ? 'teal' : 'gray'}>{t(r.status)}</Badge>
                {staff && r.status === 'completed' && r.leftOver !== '0.00' && !r.leftOverChoice && <Badge tone="red">{t('leftOver')}</Badge>}
              </span>
            </div>
            <div className="muted flex flex-wrap justify-between gap-2 text-sm">
              <span>
                <span dir="ltr">{r.orderNumber}</span> · {fmt(r.createdAt)}
              </span>
              <span className="text-[var(--text)]">
                {t('credit')}: <b dir="ltr">{r.creditAmount}</b>
              </span>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
