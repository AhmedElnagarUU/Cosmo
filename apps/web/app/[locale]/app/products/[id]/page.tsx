'use client';

import { use, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { get, patch, post } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { hasAnyRole, isOwner, useMe } from '@/lib/me-context';
import { useDateFormat, useName, type Product } from '@/lib/catalog';
import { Badge, Card, ErrorBox, Field, Loading, PageTitle, fieldError } from '@/components/ui';
import { OfferBadge } from '@/components/offer-badge';
import { ProductForm, fromProduct, toBody, type ProductFormValue } from '@/components/product-form';

interface Batch {
  id: string;
  batchNumber: string | null;
  expiryDate: string | null;
  sellable: number;
  damaged: number;
  expired: number;
  held: number;
  onHand: number;
}
interface Movement {
  id: string;
  type: string;
  state: string | null;
  quantityChange: number;
  reservedChange: number;
  reason: string | null;
  batchNumber: string | null;
  by: string | null;
  at: string;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === '') return null;
  return (
    <>
      <dt className="muted">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('products');
  const tApp = useTranslations('app');
  const tMove = useTranslations('movement');
  const tErr = useTranslations('errors');
  const name = useName();
  const fmt = useDateFormat();
  const { me } = useMe();
  const owner = isOwner(me);
  const canEdit = hasAnyRole(me, 'stock_manager');

  const product = useLoad(() => get<Product>(`/products/${id}`), [id]);
  const batches = useLoad(() => (canEdit ? get<{ items: Batch[] }>(`/products/${id}/batches`) : Promise.resolve({ items: [] as Batch[] })), [id]);
  const moves = useLoad(() => (canEdit ? get<{ items: Movement[] }>(`/products/${id}/movements?limit=30`) : Promise.resolve({ items: [] as Movement[] })), [id]);

  const [editing, setEditing] = useState<ProductFormValue | null>(null);
  const [prices, setPrices] = useState<{ sellingPrice: string; costPrice: string } | null>(null);
  const [offer, setOffer] = useState({ offerType: 'discount' as 'discount' | 'bonus', discountPercent: '', buyQuantity: '10', freeQuantity: '1', startsOn: '', endsOn: '' });
  const [adjust, setAdjust] = useState({ batchId: '', batchNumber: '', expiryDate: '', counted: '', reason: '' });
  const [damage, setDamage] = useState({ batchId: '', kind: 'damaged' as 'damaged' | 'lost', quantity: '', reason: '' });
  const [section, setSection] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function run(name: string, fn: () => Promise<unknown>) {
    setBusy(true);
    setSection(name);
    setError(null);
    try {
      await fn();
      await Promise.all([product.reload(), batches.reload(), moves.reload()]);
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const errorFor = (name: string) => (section === name ? <ErrorBox error={error} /> : null);

  if (product.error) return <ErrorBox error={product.error} />;
  const p = product.data;
  if (!p) return <Loading />;
  const newBatchMode = p.trackBatches && adjust.batchId === 'new';

  return (
    <div className="space-y-4">
      <PageTitle>{name(p)}</PageTitle>
      <div className="flex flex-wrap gap-1">
        <Badge>{t(p.productType)}</Badge>
        {p.keepCold && <Badge tone="teal">❄ {t('keepCold')}</Badge>}
        <OfferBadge offer={p.offer} />
        {p.isActive === false && <Badge tone="red">{t('inactive')}</Badge>}
      </div>

      {p.stock && (
        <div className="grid grid-cols-3 gap-2">
          {(['available', 'onHand', 'reserved'] as const).map((k) => (
            <Card key={k} className="text-center">
              <div className="text-2xl font-bold">{p.stock![k]}</div>
              <div className="muted text-sm">{t(k)}</div>
            </Card>
          ))}
        </div>
      )}

      {/* Details, or the edit form */}
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">{editing ? t('edit') : t('details')}</h2>
          {canEdit && !editing && (
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(fromProduct(p))}>
              {tApp('edit')}
            </button>
          )}
        </div>
        {editing ? (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run('edit', () => patch(`/products/${id}`, toBody(editing, 'edit')))) setEditing(null);
            }}
          >
            <ProductForm value={editing} onChange={setEditing} mode="edit" error={section === 'edit' ? error : null} />
            <div className="flex gap-2">
              <button className="btn btn-primary" disabled={busy}>
                {tApp('save')}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>
                {tApp('cancel')}
              </button>
            </div>
          </form>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <Row label={t('nameAr')}>{p.nameAr}</Row>
            <Row label={t('nameEn')}>{p.nameEn}</Row>
            <Row label={t('brand')}>{name(p.brand)}</Row>
            <Row label={t('category')}>{name(p.category)}</Row>
            <Row label={t('unit')}>{p.unit}</Row>
            <Row label={t('packSize')}>{p.packSize}</Row>
            <Row label={t('barcode')}>{p.barcode}</Row>
            {p.medicine && (
              <>
                <Row label={t('activeIngredient')}>{p.medicine.activeIngredient}</Row>
                <Row label={t('strength')}>{p.medicine.strength}</Row>
                <Row label={t('dosageForm')}>{name(p.medicine.dosageForm)}</Row>
                <Row label={t('storage')}>{t(p.medicine.storage)}</Row>
                <Row label={t('publicPrice')}>{p.medicine.publicPrice}</Row>
                <Row label={t('registrationNumber')}>{p.medicine.registrationNumber}</Row>
                <Row label={t('needsPrescription')}>{p.medicine.needsPrescription ? tApp('yes') : tApp('no')}</Row>
              </>
            )}
            {p.cosmetic && (
              <>
                <Row label={t('shadeName')}>{p.cosmetic.shadeName}</Row>
                <Row label={t('shadeNumber')}>{p.cosmetic.shadeNumber}</Row>
                <Row label={t('suitableFor')}>{p.cosmetic.suitableFor}</Row>
                <Row label={t('periodAfterOpening')}>{p.cosmetic.periodAfterOpeningMonths}</Row>
              </>
            )}
            <Row label={t('description')}>{p.description}</Row>
          </dl>
        )}
      </Card>

      {/* Prices (OWN-07) */}
      <Card className="space-y-3">
        <h2 className="font-bold">{t('prices')}</h2>
        {errorFor('prices')}
        {owner && prices ? (
          <form
            className="grid gap-3 md:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run('prices', () => patch(`/products/${id}/price`, prices))) setPrices(null);
            }}
          >
            <Field label={t('sellingPrice')} dir="ltr" inputMode="decimal" required value={prices.sellingPrice} onChange={(e) => setPrices({ ...prices, sellingPrice: e.target.value })} error={section === 'prices' ? fieldError(error, 'sellingPrice', tErr) : undefined} />
            <Field label={t('costPrice')} dir="ltr" inputMode="decimal" required value={prices.costPrice} onChange={(e) => setPrices({ ...prices, costPrice: e.target.value })} error={section === 'prices' ? fieldError(error, 'costPrice', tErr) : undefined} />
            <div className="flex gap-2">
              <button className="btn btn-primary" disabled={busy}>
                {tApp('save')}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setPrices(null)}>
                {tApp('cancel')}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <div className="muted text-sm">{t('sellingPrice')}</div>
              <div className="text-lg font-bold" dir="ltr">
                {p.sellingPrice}
              </div>
            </div>
            {p.costPrice && (
              <div>
                <div className="muted text-sm">{t('costPrice')}</div>
                <div className="text-lg" dir="ltr">
                  {p.costPrice}
                </div>
              </div>
            )}
            {owner && (
              <button type="button" className="btn btn-secondary" onClick={() => setPrices({ sellingPrice: p.sellingPrice, costPrice: p.costPrice ?? '' })}>
                {tApp('edit')}
              </button>
            )}
          </div>
        )}
        {!owner && <p className="muted text-xs">{t('pricesOwner')}</p>}
      </Card>

      {/* Offer (C-41, OWN-13) */}
      <Card className="space-y-3">
        <h2 className="font-bold">{t('offer')}</h2>
        {errorFor('offer')}
        {p.offers?.filter((o) => o.isActive).map((o) => (
          <div key={o.id} className="flex flex-wrap items-center gap-2">
            <OfferBadge offer={o} />
            {(o.startsOn || o.endsOn) && (
              <span className="muted text-sm" dir="ltr">
                {o.startsOn ?? '…'} → {o.endsOn ?? '…'}
              </span>
            )}
            {owner && (
              <button type="button" className="text-sm text-red-700 underline" disabled={busy} onClick={() => run('offer', () => post(`/offers/${o.id}/stop`))}>
                {t('stopOffer')}
              </button>
            )}
          </div>
        ))}
        {!p.offers?.some((o) => o.isActive) && <p className="muted text-sm">{t('noOffer')}</p>}
        {owner && !p.offers?.some((o) => o.isActive) && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const body =
                offer.offerType === 'discount'
                  ? { offerType: 'discount', productId: id, discountPercent: offer.discountPercent, startsOn: offer.startsOn || null, endsOn: offer.endsOn || null }
                  : { offerType: 'bonus', productId: id, buyQuantity: Number(offer.buyQuantity), freeQuantity: Number(offer.freeQuantity), startsOn: offer.startsOn || null, endsOn: offer.endsOn || null };
              void run('offer', () => post('/offers', body));
            }}
          >
            <div className="flex gap-2">
              {(['discount', 'bonus'] as const).map((k) => (
                <button key={k} type="button" className={`btn flex-1 ${offer.offerType === k ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setOffer({ ...offer, offerType: k })}>
                  {t(k)}
                </button>
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {offer.offerType === 'discount' ? (
                <Field label={t('discountPercent')} dir="ltr" inputMode="decimal" required value={offer.discountPercent} onChange={(e) => setOffer({ ...offer, discountPercent: e.target.value })} />
              ) : (
                <>
                  <Field label={t('buy')} type="number" min={1} required value={offer.buyQuantity} onChange={(e) => setOffer({ ...offer, buyQuantity: e.target.value })} />
                  <Field label={t('free')} type="number" min={1} required value={offer.freeQuantity} onChange={(e) => setOffer({ ...offer, freeQuantity: e.target.value })} />
                </>
              )}
              <Field label={t('startsOn')} type="date" value={offer.startsOn} onChange={(e) => setOffer({ ...offer, startsOn: e.target.value })} />
              <Field label={t('endsOn')} type="date" value={offer.endsOn} onChange={(e) => setOffer({ ...offer, endsOn: e.target.value })} />
            </div>
            <button className="btn btn-primary" disabled={busy}>
              {t('addOffer')}
            </button>
          </form>
        )}
      </Card>

      {canEdit && (
        <>
          {/* Batches */}
          <Card className="space-y-3">
            <h2 className="font-bold">{t('batches')}</h2>
            {batches.data?.items.every((b) => b.onHand === 0) && <p className="muted text-sm">{t('noBatches')}</p>}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="muted text-start">
                    <th className="p-1 text-start">{t('batchNumber')}</th>
                    <th className="p-1 text-start">{t('expiry')}</th>
                    <th className="p-1">{t('sellable')}</th>
                    <th className="p-1">{t('damaged')}</th>
                    <th className="p-1">{t('expired')}</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.data?.items.map((b) => (
                    <tr key={b.id} className="border-t border-[var(--line)]">
                      <td className="p-1" dir="ltr">
                        {b.batchNumber ?? '—'}
                      </td>
                      <td className="p-1" dir="ltr">
                        {b.expiryDate ?? '—'}
                      </td>
                      <td className="p-1 text-center font-semibold">{b.sellable}</td>
                      <td className="p-1 text-center">{b.damaged}</td>
                      <td className="p-1 text-center">{b.expired}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* STK-14: correct after a count, also used for opening stock */}
          <Card className="space-y-3">
            <h2 className="font-bold">{t('adjust')}</h2>
            {errorFor('adjust')}
            <form
              className="grid gap-3 md:grid-cols-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await run('adjust', () =>
                  post('/stock/adjustments', {
                    productId: id,
                    batchId: newBatchMode || !adjust.batchId ? null : adjust.batchId,
                    newBatch: newBatchMode ? { batchNumber: adjust.batchNumber, expiryDate: adjust.expiryDate } : null,
                    countedQuantity: Number(adjust.counted),
                    reason: adjust.reason,
                  }),
                );
                if (ok) setAdjust({ batchId: '', batchNumber: '', expiryDate: '', counted: '', reason: '' });
              }}
            >
              {p.trackBatches && (
                <label className="block space-y-1 md:col-span-2">
                  <span className="text-sm font-medium">{t('batchNumber')}</span>
                  <select className="field" required value={adjust.batchId} onChange={(e) => setAdjust({ ...adjust, batchId: e.target.value })}>
                    <option value="">{t('choose')}</option>
                    {batches.data?.items.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.batchNumber} · {b.expiryDate} · {b.sellable}
                      </option>
                    ))}
                    <option value="new">+ {t('newBatch')}</option>
                  </select>
                </label>
              )}
              {newBatchMode && (
                <>
                  <Field label={t('batchNumber')} dir="ltr" required value={adjust.batchNumber} onChange={(e) => setAdjust({ ...adjust, batchNumber: e.target.value })} />
                  <Field label={t('expiry')} type="date" required value={adjust.expiryDate} onChange={(e) => setAdjust({ ...adjust, expiryDate: e.target.value })} />
                </>
              )}
              <Field label={t('counted')} type="number" min={0} required value={adjust.counted} onChange={(e) => setAdjust({ ...adjust, counted: e.target.value })} />
              <Field label={t('reason')} required value={adjust.reason} onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })} />
              <div>
                <button className="btn btn-primary" disabled={busy}>
                  {tApp('save')}
                </button>
              </div>
            </form>
          </Card>

          {/* STK-15 */}
          <Card className="space-y-3">
            <h2 className="font-bold">{t('damage')}</h2>
            {errorFor('damage')}
            <form
              className="grid gap-3 md:grid-cols-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await run('damage', () =>
                  post('/stock/damaged', { productId: id, batchId: damage.batchId, kind: damage.kind, quantity: Number(damage.quantity), reason: damage.reason }),
                );
                if (ok) setDamage({ batchId: '', kind: 'damaged', quantity: '', reason: '' });
              }}
            >
              <label className="block space-y-1">
                <span className="text-sm font-medium">{t('batchNumber')}</span>
                <select className="field" required value={damage.batchId} onChange={(e) => setDamage({ ...damage, batchId: e.target.value })}>
                  <option value="">{t('choose')}</option>
                  {batches.data?.items
                    .filter((b) => b.sellable > 0)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {(b.batchNumber ?? '—') + ' · ' + b.sellable}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">{t('damageKind')}</span>
                <select className="field" value={damage.kind} onChange={(e) => setDamage({ ...damage, kind: e.target.value as 'damaged' | 'lost' })}>
                  <option value="damaged">{t('kindDamaged')}</option>
                  <option value="lost">{t('kindLost')}</option>
                </select>
              </label>
              <Field label={t('quantity')} type="number" min={1} required value={damage.quantity} onChange={(e) => setDamage({ ...damage, quantity: e.target.value })} />
              <Field label={t('reason')} required value={damage.reason} onChange={(e) => setDamage({ ...damage, reason: e.target.value })} />
              <div>
                <button className="btn btn-primary" disabled={busy}>
                  {tApp('save')}
                </button>
              </div>
            </form>
          </Card>

          {/* Stock history (C-09) */}
          <Card className="space-y-2">
            <h2 className="font-bold">{t('movements')}</h2>
            {moves.data?.items.length === 0 && <p className="muted text-sm">{t('noMovements')}</p>}
            <ul className="divide-y divide-[var(--line)] text-sm">
              {moves.data?.items.map((m) => (
                <li key={m.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">{tMove(m.type)}</span>
                    {m.state && m.state !== 'sellable' && <span className="muted"> ({t(m.state as 'damaged')})</span>}
                    {m.batchNumber && <span className="muted"> · {m.batchNumber}</span>}
                    {m.reason && <span className="muted"> · {m.reason}</span>}
                  </span>
                  <span className="flex gap-3">
                    <span dir="ltr" className={m.quantityChange < 0 ? 'text-red-700' : 'text-green-700'}>
                      {m.quantityChange > 0 ? '+' : ''}
                      {m.quantityChange || ''}
                    </span>
                    <span className="muted">
                      {m.by ?? ''} · {fmt(m.at, true)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <button
              type="button"
              className={`btn btn-secondary ${p.isActive ? 'text-red-700' : ''}`}
              disabled={busy}
              onClick={() => run('status', () => post(`/products/${id}/${p.isActive ? 'deactivate' : 'activate'}`))}
            >
              {p.isActive ? t('deactivate') : t('activate')}
            </button>
          </Card>
        </>
      )}
      <Link href="/app/products" className="btn btn-secondary">
        {tApp('back')}
      </Link>
    </div>
  );
}
