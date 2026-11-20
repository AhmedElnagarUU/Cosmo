'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { get, post } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { useMe } from '@/lib/me-context';
import { useCart } from '@/lib/cart';
import { useName } from '@/lib/catalog';
import { Badge, Card, ErrorBox, PageTitle } from '@/components/ui';
import { ProductPicker } from '@/components/product-picker';

interface Preview {
  lines: Array<{ productId: string; quantity: number; unitPrice: string; discountPercent: string | null; bonusQty: number; lineTotal: string }>;
  subtotal: string;
  discountTotal: string;
  total: string;
  minimumOrderValue: string | null;
  belowMinimum: boolean;
  shortages: Array<{ productId: string; requested: number; available: number }>;
  creditAllowed: boolean;
  creditDays: number;
}

function newKey() {
  return 'k' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// CUS-05 to CUS-07, SAL-02. Only choices are sent; the backend calculates every number.
export default function CartPage() {
  const t = useTranslations('cart');
  const name = useName();
  const router = useRouter();
  const { me } = useMe();
  const isCustomer = me.userType === 'customer';
  const { cart, save, add, clear } = useCart(me.userId);
  const customers = useLoad(() => (isCustomer ? Promise.resolve({ items: [] }) : get<{ items: Array<{ id: string; businessName: string }> }>('/customers?limit=100')));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  // One key per attempt, so a double tap or a retry never creates two orders
  const idempotencyKey = useRef(newKey());

  const body = {
    ...(isCustomer ? {} : { customerId: cart.customerId }),
    paymentChoice: cart.paymentChoice,
    lines: cart.lines.filter((l) => l.quantity > 0).map((l) => ({ productId: l.productId, quantity: l.quantity, mustHave: l.mustHave })),
  };
  const ready = body.lines.length > 0 && (isCustomer || !!cart.customerId);

  useEffect(() => {
    idempotencyKey.current = newKey();
    if (!ready) {
      setPreview(null);
      return;
    }
    const id = setTimeout(() => {
      post<Preview>('/orders/preview', body)
        .then((p) => {
          setPreview(p);
          setError(null);
          if (!p.creditAllowed && cart.paymentChoice === 'credit') save({ ...cart, paymentChoice: 'on_arrival' });
        })
        .catch(setError);
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(body)]);

  const setLine = (productId: string, patch: Partial<(typeof cart.lines)[number]>) =>
    save({ ...cart, lines: cart.lines.map((l) => (l.productId === productId ? { ...l, ...patch } : l)) });
  const allMust = cart.lines.length > 0 && cart.lines.every((l) => l.mustHave);

  async function place() {
    setBusy(true);
    setError(null);
    try {
      const o = await post<{ id: string; orderNumber: string }>('/orders', body, { 'Idempotency-Key': idempotencyKey.current });
      clear();
      router.replace(`/app/orders/${o.id}?placed=1`);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageTitle>{t('title')}</PageTitle>
      {!isCustomer && (
        <Card className="space-y-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('customer')}</span>
            <select className="field" value={cart.customerId ?? ''} onChange={(e) => save({ ...cart, customerId: e.target.value || undefined })}>
              <option value="">…</option>
              {customers.data?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.businessName}
                </option>
              ))}
            </select>
          </label>
          <ProductPicker placeholder="🔍" onPick={(p) => add(p)} />
        </Card>
      )}
      <ErrorBox error={error} />
      {cart.lines.length === 0 ? (
        <Card className="space-y-3 text-center">
          <p className="muted">{t('empty')}</p>
          {isCustomer && (
            <Link href="/app/catalog" className="btn btn-primary">
              🛒
            </Link>
          )}
        </Card>
      ) : (
        <>
          <Card className="space-y-3">
            <p className="muted text-sm">{t('mustHaveHelp')}</p>
            <label className="flex items-center gap-2 font-medium">
              <input type="checkbox" checked={allMust} onChange={(e) => save({ ...cart, lines: cart.lines.map((l) => ({ ...l, mustHave: e.target.checked })) })} />
              {t('askAll')}
            </label>
          </Card>
          <div className="space-y-2">
            {cart.lines.map((l) => {
              const p = preview?.lines.find((x) => x.productId === l.productId);
              const short = preview?.shortages.find((s) => s.productId === l.productId);
              return (
                <Card key={l.productId} className={`space-y-2 ${short ? 'border-red-500' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold">{name(l)}</span>
                    <button type="button" className="text-sm text-red-700 underline" onClick={() => save({ ...cart, lines: cart.lines.filter((x) => x.productId !== l.productId) })}>
                      {t('remove')}
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1" dir="ltr">
                      <button type="button" className="btn btn-secondary w-11" onClick={() => setLine(l.productId, { quantity: Math.max(1, l.quantity - 1) })}>
                        −
                      </button>
                      <input
                        className="field w-20 text-center"
                        type="number"
                        min={1}
                        value={l.quantity}
                        onChange={(e) => setLine(l.productId, { quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                      />
                      <button type="button" className="btn btn-secondary w-11" onClick={() => setLine(l.productId, { quantity: l.quantity + 1 })}>
                        +
                      </button>
                    </div>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={l.mustHave} onChange={(e) => setLine(l.productId, { mustHave: e.target.checked })} />
                      {t('mustHave')}
                    </label>
                    {p && (
                      <span className="ms-auto text-end">
                        {p.bonusQty > 0 && <Badge tone="green">{t('free', { n: p.bonusQty })}</Badge>}{' '}
                        <span className="font-bold" dir="ltr">
                          {p.lineTotal}
                        </span>
                      </span>
                    )}
                  </div>
                  {short && <p className="text-sm text-red-700">{t('short', { n: short.available })}</p>}
                </Card>
              );
            })}
          </div>
          <Card className="space-y-3">
            <span className="text-sm font-medium">{t('payment')}</span>
            <label className="flex items-center gap-2">
              <input type="radio" name="pay" checked={cart.paymentChoice === 'on_arrival'} onChange={() => save({ ...cart, paymentChoice: 'on_arrival' })} />
              {t('onArrival')}
            </label>
            {preview?.creditAllowed && (
              <label className="flex items-center gap-2">
                <input type="radio" name="pay" checked={cart.paymentChoice === 'credit'} onChange={() => save({ ...cart, paymentChoice: 'credit' })} />
                {t('credit', { days: preview.creditDays })}
              </label>
            )}
          </Card>
          {preview && (
            <Card className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>{t('subtotal')}</span>
                <span dir="ltr">{preview.subtotal}</span>
              </div>
              {preview.discountTotal !== '0.00' && (
                <div className="flex justify-between text-sm text-green-700">
                  <span>{t('discount')}</span>
                  <span dir="ltr">−{preview.discountTotal}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold">
                <span>{t('total')}</span>
                <span dir="ltr">{preview.total}</span>
              </div>
              {preview.belowMinimum && <p className="text-sm text-red-700">{t('belowMinimum', { min: preview.minimumOrderValue ?? '' })}</p>}
            </Card>
          )}
          <button type="button" className="btn btn-primary w-full" disabled={busy || !preview || preview.belowMinimum || preview.shortages.length > 0} onClick={place}>
            {t('place')}
          </button>
          {!isCustomer && !cart.customerId && <p className="muted text-center text-sm">{t('chooseCustomer')}</p>}
        </>
      )}
    </div>
  );
}
