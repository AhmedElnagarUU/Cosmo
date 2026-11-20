'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { get } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { hasAnyRole, useMe } from '@/lib/me-context';
import { useName, type Offer, type Named } from '@/lib/catalog';
import { Badge, Card, ErrorBox, Loading, PageTitle } from '@/components/ui';
import { OfferBadge } from '@/components/offer-badge';

interface Row extends Named {
  id: string;
  productType: 'medicine' | 'cosmetic';
  barcode: string | null;
  brand: Named;
  packSize: string;
  strength: string | null;
  sellingPrice: string;
  keepCold: boolean;
  isActive?: boolean;
  inStock: boolean;
  stock?: { available: number; onHand: number; reserved: number };
  offer: Offer | null;
}

export default function ProductsPage() {
  const t = useTranslations('products');
  const name = useName();
  const { me } = useMe();
  const canAdd = hasAnyRole(me, 'stock_manager');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setSearch(q), 300);
    return () => clearTimeout(id);
  }, [q]);

  const { data, error, loading } = useLoad(
    () => get<{ items: Row[]; total: number }>(`/products?limit=100&q=${encodeURIComponent(search)}&type=${type}&status=${showInactive ? 'all' : 'active'}`),
    [search, type, showInactive],
  );

  return (
    <div>
      <PageTitle
        action={
          canAdd && (
            <Link href="/app/products/new" className="btn btn-primary">
              {t('add')}
            </Link>
          )
        }
      >
        {t('title')}
      </PageTitle>
      <div className="mb-4 space-y-2">
        <input className="field" type="search" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex flex-wrap items-center gap-2">
          {(['', 'medicine', 'cosmetic'] as const).map((v) => (
            <button key={v} type="button" onClick={() => setType(v)} className={`btn ${type === v ? 'btn-primary' : 'btn-secondary'}`}>
              {v ? t(v) : t('all')}
            </button>
          ))}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            {t('showInactive')}
          </label>
        </div>
      </div>
      <ErrorBox error={error} />
      {loading && !data ? (
        <Loading />
      ) : data?.items.length === 0 ? (
        <p className="muted py-6 text-center">{t('none')}</p>
      ) : (
        <div className="space-y-2">
          {data?.items.map((p) => (
            <Link key={p.id} href={`/app/products/${p.id}`} className="block">
              <Card className="space-y-1 hover:border-teal-500">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{name(p)}</div>
                    <div className="muted text-sm">
                      {name(p.brand)} · {[p.strength, p.packSize].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className="text-end">
                    <div className="font-bold" dir="ltr">
                      {p.sellingPrice}
                    </div>
                    {p.stock ? (
                      <div className={`text-sm ${p.stock.available > 0 ? '' : 'text-red-700'}`}>
                        {t('available')}: {p.stock.available}
                      </div>
                    ) : (
                      <div className="text-sm">{p.inStock ? t('inStock') : t('outOfStock')}</div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Badge>{t(p.productType)}</Badge>
                  {p.keepCold && <Badge tone="teal">❄ {t('keepCold')}</Badge>}
                  <OfferBadge offer={p.offer} />
                  {p.isActive === false && <Badge tone="red">{t('inactive')}</Badge>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
