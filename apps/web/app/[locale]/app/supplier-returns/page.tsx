'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { get } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { hasAnyRole, useMe } from '@/lib/me-context';
import { useDateFormat } from '@/lib/catalog';
import { Badge, Card, ErrorBox, Loading, PageTitle } from '@/components/ui';

interface Row {
  id: string;
  number: string;
  status: 'waiting_for_owner' | 'confirmed' | 'rejected';
  reason: string;
  total: string;
  supplierName: string;
  at: string;
}

const statusTone = { waiting_for_owner: 'teal', confirmed: 'green', rejected: 'red' } as const;

export default function SupplierReturnsPage() {
  const t = useTranslations('supplierReturns');
  const fmt = useDateFormat();
  const { me } = useMe();
  const { data, error } = useLoad(() => get<{ items: Row[] }>('/supplier-returns'));

  return (
    <div className="space-y-4">
      <PageTitle
        action={
          hasAnyRole(me, 'stock_manager') && (
            <Link href="/app/supplier-returns/new" className="btn btn-primary">
              {t('new')}
            </Link>
          )
        }
      >
        {t('title')}
      </PageTitle>
      <ErrorBox error={error} />
      {!data ? (
        <Loading />
      ) : data.items.length === 0 ? (
        <p className="muted py-6 text-center">{t('none')}</p>
      ) : (
        <div className="space-y-2">
          {data.items.map((r) => (
            <Link key={r.id} href={`/app/supplier-returns/${r.id}`} className="block">
              <Card className="flex flex-wrap items-center justify-between gap-2 hover:border-teal-500">
                <div>
                  <div className="font-semibold">{r.supplierName}</div>
                  <div className="muted text-sm">
                    <span dir="ltr">{r.number}</span> · {t(r.reason)} · {fmt(r.at)}
                  </div>
                </div>
                <div className="text-end">
                  <Badge tone={statusTone[r.status]}>{t(r.status)}</Badge>
                  <div className="font-bold" dir="ltr">
                    {r.total}
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
