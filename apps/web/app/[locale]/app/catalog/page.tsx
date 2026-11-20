'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { get } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { useMe } from '@/lib/me-context';
import { useCart } from '@/lib/cart';
import { useName, type Named, type Offer } from '@/lib/catalog';
import { Badge, Card, ErrorBox, Loading, PageTitle } from '@/components/ui';
import { OfferBadge } from '@/components/offer-badge';

interface Row extends Named {
  id: string;
  brand: Named;
  packSize: string;
  strength: string | null;
  sellingPrice: string;
  publicPrice: string | null;
  keepCold: boolean;
  inStock: boolean;
  offer: Offer | null;
}

// CUS-03, CUS-04: customers see "in stock" or "out of stock", never quantities (C-56)
export default function CatalogPage() {
  const t = useTranslations('catalog');
  const tP = useTranslations('products');
  const name = useName();
  const { me } = useMe();
  const { cart, add } = useCart(me.userId);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setSearch(q), 300);
    return () => clearTimeout(id);
  }, [q]);
  const { data, error, loading } = useLoad(() => get<{ items: Row[] }>(`/products?limit=100&q=${encodeURIComponent(search)}`), [search]);
  const inCart = (id: string) => cart.lines.find((l) => l.productId === id)?.quantity ?? 0;

  return (
    <div className="space-y-4">
      <PageTitle
        action={
          cart.lines.length > 0 && (
            <Link href="/app/cart" className="btn btn-primary">
              🛒 {cart.lines.length}
            </Link>
          )
        }
      >
        {t('title')}
      </PageTitle>
      {!me.openStatus.open && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{t('closedNote')}</p>}
      <input className="field" type="search" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
      <ErrorBox error={error} />
      {loading && !data ? (
        <Loading />
      ) : data?.items.length === 0 ? (
        <p className="muted py-6 text-center">{t('none')}</p>
      ) : (
        <div className="space-y-2">
          {data?.items.map((p) => (
            <Card key={p.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="font-semibold">{name(p)}</div>
                <div className="muted text-sm">
                  {name(p.brand)} · {[p.strength, p.packSize].filter(Boolean).join(' · ')}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <span className="font-bold" dir="ltr">
                    {p.sellingPrice}
                  </span>
                  {p.publicPrice && <span className="muted text-xs">· {t('publicPrice', { price: p.publicPrice })}</span>}
                  <OfferBadge offer={p.offer} />
                  {p.keepCold && <Badge tone="teal">❄ {tP('keepCold')}</Badge>}
                </div>
              </div>
              {p.inStock ? (
                <button type="button" className="btn btn-primary shrink-0" onClick={() => add(p)}>
                  {inCart(p.id) ? `${t('inCart')} (${inCart(p.id)}) +` : t('add')}
                </button>
              ) : (
                <Badge tone="red">{t('outOfStock')}</Badge>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
