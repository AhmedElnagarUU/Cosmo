'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { get } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { useDateFormat } from '@/lib/catalog';
import { Badge, Card, ErrorBox, Loading, PageTitle } from '@/components/ui';

interface Entry {
  id: string;
  action: string;
  entityType: string;
  reason: string | null;
  important: boolean;
  at: string;
  by: string | null;
}

const TYPES = ['order', 'product', 'payment', 'invoice', 'trip', 'customer', 'employee', 'supplier', 'customer_return', 'supplier_return', 'receipt', 'settings'];

// OWN-10: who did what and when (C-30). Entries cannot be changed.
export default function ActivityPage() {
  const t = useTranslations('activity');
  const tA = useTranslations('actions');
  const fmt = useDateFormat();
  const [important, setImportant] = useState(false);
  const [type, setType] = useState('');
  const { data, error } = useLoad(() => get<{ items: Entry[] }>(`/activity?limit=100${important ? '&important=1' : ''}${type ? `&type=${type}` : ''}`), [important, type]);
  const label = (a: string) => (tA.has(a) ? tA(a) : a.replace(/_/g, ' '));

  return (
    <div className="space-y-4">
      <PageTitle>{t('title')}</PageTitle>
      <div className="flex flex-wrap items-center gap-3">
        <select className="field w-auto" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">{t('all')}</option>
          {TYPES.map((x) => (
            <option key={x} value={x}>
              {x.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} />
          {t('important')}
        </label>
      </div>
      <ErrorBox error={error} />
      {!data ? (
        <Loading />
      ) : data.items.length === 0 ? (
        <p className="muted py-6 text-center">{t('none')}</p>
      ) : (
        <Card>
          <ul className="divide-y divide-[var(--line)] text-sm">
            {data.items.map((a) => (
              <li key={a.id} className="space-y-0.5 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {label(a.action)} {a.important && <Badge tone="red">!</Badge>}
                  </span>
                  <span className="muted text-xs">{fmt(a.at, true)}</span>
                </div>
                <div className="muted">{a.by ?? t('system')}</div>
                {a.reason && <div className="text-amber-800 dark:text-amber-200">{a.reason}</div>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
