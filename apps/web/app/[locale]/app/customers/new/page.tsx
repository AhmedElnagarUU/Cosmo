'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { post, type FirstLogin } from '@/lib/api';
import { useMe } from '@/lib/me-context';
import { Card, ErrorBox, PageTitle } from '@/components/ui';
import { CustomerForm, emptyCustomer } from '@/components/customer-form';
import { FirstLoginCard } from '@/components/first-login-card';

// OWN-03, SAL-01: the first-login details are shown once, to send by WhatsApp (C-73)
export default function NewCustomerPage() {
  const t = useTranslations('customers');
  const tApp = useTranslations('app');
  const { me } = useMe();
  const [value, setValue] = useState(emptyCustomer);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [created, setCreated] = useState<{ id: string; firstLogin: FirstLogin } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ customer: { id: string }; firstLogin: FirstLogin }>('/customers', { ...value, area: value.area || null });
      setCreated({ id: r.customer.id, firstLogin: r.firstLogin });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div className="space-y-4">
        <PageTitle>{t('add')}</PageTitle>
        <FirstLoginCard details={created.firstLogin} wholesalerName={me.wholesaler.name} />
        <div className="flex gap-2">
          <Link href={`/app/customers/${created.id}`} className="btn btn-secondary">
            {t('edit')}
          </Link>
          <Link href="/app/customers" className="btn btn-secondary">
            {tApp('back')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageTitle>{t('add')}</PageTitle>
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <ErrorBox error={error} />
          <CustomerForm value={value} onChange={setValue} error={error} />
          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={busy}>
              {tApp('save')}
            </button>
            <Link href="/app/customers" className="btn btn-secondary">
              {tApp('cancel')}
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
