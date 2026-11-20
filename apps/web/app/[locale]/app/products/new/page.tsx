'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { post } from '@/lib/api';
import { Card, PageTitle } from '@/components/ui';
import { ProductForm, emptyProduct, toBody } from '@/components/product-form';

export default function NewProductPage() {
  const t = useTranslations('products');
  const tApp = useTranslations('app');
  const router = useRouter();
  const [value, setValue] = useState(emptyProduct);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const p = await post<{ id: string }>('/products', toBody(value, 'create'));
      router.replace(`/app/products/${p.id}`);
    } catch (err) {
      setError(err);
      setBusy(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  return (
    <div>
      <PageTitle>{t('add')}</PageTitle>
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <ProductForm value={value} onChange={setValue} mode="create" error={error} />
          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={busy}>
              {tApp('save')}
            </button>
            <Link href="/app/products" className="btn btn-secondary">
              {tApp('cancel')}
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
