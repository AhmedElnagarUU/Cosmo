'use client';

import { useTranslations, useLocale } from 'next-intl';
import type { OpenStatus } from '@/lib/api';

// "Open now" or "Closed now, opens at 9:00" (C-37)
export function OpenStatusBadge({ status }: { status: OpenStatus }) {
  const t = useTranslations('open');
  const locale = useLocale();
  if (status.open) {
    return (
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
        <span className="font-semibold">{t('openNow')}</span>
        <span className="muted text-sm">{t('closesAt', { time: status.closesAt })}</span>
      </div>
    );
  }
  const next = status.nextOpening;
  const date = next
    ? new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(
        new Date(next.date + 'T12:00:00'),
      )
    : '';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="h-2.5 w-2.5 rounded-full bg-gray-400" />
      <span className="font-semibold">{t('closedNow')}</span>
      <span className="muted text-sm">{next ? t('opensAt', { date, time: next.time }) : t('noHours')}</span>
    </div>
  );
}
