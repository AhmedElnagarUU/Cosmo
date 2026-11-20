'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { get, post } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { useDateFormat } from '@/lib/catalog';
import { Badge, Card, ErrorBox, PageTitle } from '@/components/ui';

interface Ready {
  id: string;
  orderNumber: string;
  total: string;
  paymentChoice: string;
  readySince: string;
  customer: { businessName: string; address: string; area: string | null };
}

// DM-01 to DM-06: ready orders, trips, and signed papers
export default function DeliveryPage() {
  const t = useTranslations('delivery');
  const fmt = useDateFormat();
  const router = useRouter();
  const ready = useLoad(() => get<{ items: Ready[] }>('/ready-orders'));
  const people = useLoad(() => get<{ items: Array<{ userId: string; name: string }> }>('/delivery-people'));
  const trips = useLoad(() => get<{ items: Array<{ id: string; tripNumber: string; status: string; deliveryPerson: string; stops: number; done: number; createdAt: string }> }>('/trips'));
  const papers = useLoad(() => get<{ items: Array<{ stopId: string; orderNumber: string; customerName: string; tripNumber: string; deliveryPerson: string | null }> }>('/trip-stops/missing-papers'));
  const [selected, setSelected] = useState<string[]>([]);
  const [person, setPerson] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-4">
      <PageTitle>{t('title')}</PageTitle>
      <ErrorBox error={error} />
      <Card className="space-y-3">
        <h2 className="font-bold">{t('ready')}</h2>
        {ready.data?.items.length === 0 && <p className="muted text-sm">{t('noReady')}</p>}
        {ready.data?.items.map((o) => (
          <label key={o.id} className="flex items-start gap-3 rounded-lg border border-[var(--line)] p-2">
            <input type="checkbox" className="mt-1" checked={selected.includes(o.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, o.id] : selected.filter((x) => x !== o.id))} />
            <span className="flex-1">
              <span className="font-semibold">{o.customer.businessName}</span>
              <span className="muted block text-sm">
                {o.customer.address}
                {o.customer.area && ` · ${o.customer.area}`}
              </span>
              <span className="muted block text-xs">
                <span dir="ltr">{o.orderNumber}</span> · {fmt(o.readySince, true)}
              </span>
            </span>
            <span className="font-bold" dir="ltr">
              {o.total}
            </span>
          </label>
        ))}
        {!!ready.data?.items.length && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="block flex-1 space-y-1">
              <span className="text-sm font-medium">{t('person')}</span>
              <select className="field" value={person} onChange={(e) => setPerson(e.target.value)}>
                <option value="">…</option>
                {people.data?.items.map((p) => (
                  <option key={p.userId} value={p.userId}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !person || selected.length === 0}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  const trip = await post<{ id: string }>('/trips', { deliveryPersonId: person, orderIds: selected });
                  router.push(`/app/trips/${trip.id}`);
                } catch (e) {
                  setError(e);
                  setBusy(false);
                }
              }}
            >
              {t('createTrip')} ({selected.length})
            </button>
          </div>
        )}
      </Card>

      <Card className="space-y-2">
        <h2 className="font-bold">{t('papers')}</h2>
        {papers.data?.items.length === 0 && <p className="muted text-sm">{t('noPapers')}</p>}
        {papers.data?.items.map((p) => (
          <div key={p.stopId} className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] py-2 text-sm last:border-0">
            <span>
              {p.customerName} · <span dir="ltr">{p.orderNumber}</span> · {p.deliveryPerson}
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={async () => {
                await post(`/trip-stops/${p.stopId}/paper-received`).catch(setError);
                await papers.reload();
              }}
            >
              ✓ {t('paperIn')}
            </button>
          </div>
        ))}
      </Card>

      <Card className="space-y-2">
        <h2 className="font-bold">{t('trips')}</h2>
        {trips.data?.items.length === 0 && <p className="muted text-sm">{t('noTrips')}</p>}
        {trips.data?.items.map((tr) => (
          <Link key={tr.id} href={`/app/trips/${tr.id}`} className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] py-2 last:border-0">
            <span>
              <span dir="ltr" className="font-medium">
                {tr.tripNumber}
              </span>{' '}
              · {tr.deliveryPerson}
            </span>
            <span className="flex items-center gap-2 text-sm">
              {t('stops', { done: tr.done, n: tr.stops })}
              <Badge tone={tr.status === 'in_progress' ? 'teal' : tr.status === 'planned' ? 'gray' : 'green'}>{t(tr.status as 'planned')}</Badge>
            </span>
          </Link>
        ))}
      </Card>
    </div>
  );
}
