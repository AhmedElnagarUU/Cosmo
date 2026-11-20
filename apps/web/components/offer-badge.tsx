'use client';

import { useTranslations } from 'next-intl';
import type { Offer } from '@/lib/catalog';
import { Badge } from './ui';

export function OfferBadge({ offer }: { offer: Offer | null }) {
  const t = useTranslations('products');
  if (!offer) return null;
  return (
    <Badge tone="green">
      {offer.offerType === 'bonus'
        ? t('offerBonus', { buy: offer.buyQuantity ?? 0, free: offer.freeQuantity ?? 0 })
        : t('offerDiscount', { percent: Number(offer.discountPercent) })}
    </Badge>
  );
}
