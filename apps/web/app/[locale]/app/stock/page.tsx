'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { get } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { useName, type Named } from '@/lib/catalog';
import { Card, ErrorBox, Loading, PageTitle } from '@/components/ui';

interface Item {
  batchId: string;
  productId: string;
  product: Named;
  batchNumber: string | null;
  expiryDate: string;
  sellable: number;
  expired: number;
}

// STK-16: batches close to expiry (C-45) and expired stock (C-55)
export default function ExpiryPage() {
  const t = useTranslations('expiry');
  const tP = useTranslations('products');
  const name = useName();
  const { data, error } = useLoad(() => get<{ months: number; nearExpiry: Item[]; expired: Item[] }>('/stock/near-expiry'));
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const today = Date.now();

  const list = (items: Item[], kind: 'near' | 'expired') =>
    items.length === 0 ? (
      <p className="muted text-sm">{t('none')}</p>
    ) : (
      <ul className="divide-y divide-[var(--line)]">
        {items.map((b) => {
          const days = Math.ceil((new Date(b.expiryDate + 'T00:00:00').getTime() - today) / 86_400_000);
          return (
            <li key={b.batchId}>
              <Link href={`/app/products/${b.productId}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{name(b.product)}</span>
                  <span className="muted text-sm" dir="ltr">
                    {' '}
                    · {b.batchNumber}
                  </span>
                </span>
                <span className="text-sm">
                  <span dir="ltr">{b.expiryDate}</span>
                  {kind === 'near' && <span className={days < 30 ? 'text-red-700' : 'muted'}> · {t('daysLeft', { days })}</span>}
                  <span className="font-semibold"> · {kind === 'near' ? b.sellable : b.expired + b.sellable}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    );

  return (
    <div className="space-y-4">
      <PageTitle>{t('title')}</PageTitle>
      <Card className="space-y-2">
        <h2 className="font-bold">{t('near', { months: data.months })}</h2>
        {list(data.nearExpiry, 'near')}
      </Card>
      <Card className="space-y-2">
        <h2 className="font-bold text-red-700">{t('expired')}</h2>
        {list(data.expired, 'expired')}
        <p className="muted text-xs">{tP('expired')}</p>
      </Card>
    </div>
  );
}
