'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { get } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { hasAnyRole, isOwner, useMe } from '@/lib/me-context';
import { Badge, Card, ErrorBox, Loading, PageTitle } from '@/components/ui';

interface Row {
  id: string;
  businessName: string;
  contactPerson?: string;
  phone: string;
  address: string;
  area: string | null;
  creditAllowed?: boolean;
  creditDays?: number;
  isActive?: boolean;
}

export default function CustomersPage() {
  const t = useTranslations('customers');
  const { me } = useMe();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const canOpen = hasAnyRole(me, 'sales', 'accountant');
  const canAdd = hasAnyRole(me, 'sales');

  useEffect(() => {
    const id = setTimeout(() => setSearch(q), 300);
    return () => clearTimeout(id);
  }, [q]);

  const { data, error, loading } = useLoad(
    () => get<{ items: Row[]; total: number }>(`/customers?limit=100&status=${showInactive ? 'all' : 'active'}&q=${encodeURIComponent(search)}`),
    [search, showInactive],
  );

  return (
    <div>
      <PageTitle
        action={
          canAdd && (
            <Link href="/app/customers/new" className="btn btn-primary">
              {t('add')}
            </Link>
          )
        }
      >
        {t('title')}
      </PageTitle>
      <div className="mb-4 space-y-2">
        <input className="field" type="search" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
        {isOwner(me) && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            {t('showInactive')}
          </label>
        )}
      </div>
      <ErrorBox error={error} />
      {loading && !data ? (
        <Loading />
      ) : data?.items.length === 0 ? (
        <p className="muted py-6 text-center">{t('none')}</p>
      ) : (
        <div className="space-y-2">
          {data?.items.map((c) => {
            const body = (
              <Card className={`space-y-1 ${canOpen ? 'hover:border-teal-500' : ''}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{c.businessName}</span>
                  <span className="flex gap-1">
                    {c.creditAllowed !== undefined && (
                      <Badge tone={c.creditAllowed ? 'teal' : 'gray'}>
                        {c.creditAllowed ? `${t('credit')}: ${c.creditDays}` : t('noCredit')}
                      </Badge>
                    )}
                    {c.isActive === false && <Badge tone="red">{t('deactivate')}</Badge>}
                  </span>
                </div>
                <div className="muted text-sm">
                  <span dir="ltr">{c.phone}</span> · {c.address}
                  {c.area ? ` · ${c.area}` : ''}
                </div>
              </Card>
            );
            return canOpen ? (
              <Link key={c.id} href={`/app/customers/${c.id}`} className="block">
                {body}
              </Link>
            ) : (
              <div key={c.id}>{body}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
