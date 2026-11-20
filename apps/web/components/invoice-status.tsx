'use client';

import { useTranslations } from 'next-intl';
import { Badge } from './ui';

export function InvoiceStatus({ status, overdue }: { status: string; overdue?: boolean }) {
  const t = useTranslations('billing');
  const tone = status === 'paid' ? 'green' : status === 'cancelled' ? 'gray' : overdue ? 'red' : 'teal';
  return (
    <span className="inline-flex gap-1">
      <Badge tone={tone}>{t(`status_${status}` as 'status_paid')}</Badge>
      {overdue && <Badge tone="red">{t('overdue')}</Badge>}
    </span>
  );
}
