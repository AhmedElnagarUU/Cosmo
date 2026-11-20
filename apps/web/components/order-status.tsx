'use client';

import { useTranslations } from 'next-intl';
import { Badge } from './ui';

const tones: Record<string, 'gray' | 'green' | 'red' | 'teal'> = {
  placed: 'teal',
  waiting_for_customer: 'teal',
  accepted: 'green',
  preparing: 'green',
  ready: 'green',
  out_for_delivery: 'green',
  delivered: 'green',
  rejected: 'red',
  cancelled: 'red',
  delivery_failed: 'red',
};

export function OrderStatusBadge({ status, staff }: { status: string; staff?: boolean }) {
  const t = useTranslations('orderStatus');
  const tStaff = useTranslations('staffStatus');
  return <Badge tone={tones[status] ?? 'gray'}>{staff && status === 'waiting_for_customer' ? tStaff('waiting_for_customer') : t(status)}</Badge>;
}
