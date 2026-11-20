'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { get, post } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { Card, ErrorBox, Loading, PageTitle } from '@/components/ui';

// STK-12: goods from a failed delivery are back (C-61)
export default function GoodsBackPage() {
  const t = useTranslations('delivery');
  const tF = useTranslations('failReason');
  const { data, error, reload } = useLoad(() => get<{ items: Array<{ stopId: string; orderNumber: string; customerName: string; reason: string; note: string | null }> }>('/trip-stops/goods-to-return'));
  const [actionError, setActionError] = useState<unknown>(null);
  return (
    <div className="space-y-4">
      <PageTitle>{t('goodsBack')}</PageTitle>
      <ErrorBox error={error ?? actionError} />
      {!data ? (
        <Loading />
      ) : data.items.length === 0 ? (
        <p className="muted py-6 text-center">{t('noGoodsBack')}</p>
      ) : (
        data.items.map((s) => (
          <Card key={s.stopId} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <span className="font-semibold">{s.customerName}</span>
              <span className="muted block text-sm">
                <span dir="ltr">{s.orderNumber}</span> · {tF(s.reason)}
                {s.note && ` · ${s.note}`}
              </span>
            </span>
            <button type="button" className="btn btn-primary" onClick={() => post(`/trip-stops/${s.stopId}/goods-back`).then(reload).catch(setActionError)}>
              {t('confirmBack')}
            </button>
          </Card>
        ))
      )}
    </div>
  );
}
