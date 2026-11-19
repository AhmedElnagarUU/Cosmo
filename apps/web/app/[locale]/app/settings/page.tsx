'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { INVOICE_TIMINGS } from '@cosmo/shared';
import { del, get, patch, post, put } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { useMe } from '@/lib/me-context';
import { Card, ErrorBox, Field, Loading, PageTitle } from '@/components/ui';
import { OpenStatusBadge } from '@/components/open-status';

interface Settings {
  defaultCreditDays: number;
  invoiceTiming: (typeof INVOICE_TIMINGS)[number];
  nearExpiryMonths: number;
  supplierReturnApproval: boolean;
  minimumOrderValue: string | null;
}
interface Day {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
}
interface ClosedDay {
  id: string;
  closedOn: string;
  note: string | null;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </Card>
  );
}

// OWN-02: the few owner settings (C-40), working hours and closed days (C-37)
export default function SettingsPage() {
  const t = useTranslations('settings');
  const tApp = useTranslations('app');
  const tDays = useTranslations('days');
  const { me, reloadMe } = useMe();

  const settings = useLoad(() => get<Settings>('/settings'));
  const hours = useLoad(() => get<{ days: Day[] }>('/settings/working-hours'));
  const closed = useLoad(() => get<{ items: ClosedDay[] }>('/settings/closed-days'));

  const [form, setForm] = useState<Settings | null>(null);
  const [minimum, setMinimum] = useState('');
  const [week, setWeek] = useState<Record<number, Day | null>>({});
  const [newClosed, setNewClosed] = useState({ closedOn: '', note: '' });
  const [message, setMessage] = useState<{ section: string; error?: unknown } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (settings.data) {
      setForm(settings.data);
      setMinimum(settings.data.minimumOrderValue ?? '');
    }
  }, [settings.data]);

  useEffect(() => {
    if (!hours.data) return;
    const w: Record<number, Day | null> = {};
    for (let d = 0; d < 7; d++) w[d] = hours.data.days.find((x) => x.dayOfWeek === d) ?? null;
    setWeek(w);
  }, [hours.data]);

  async function run(section: string, fn: () => Promise<unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      setMessage({ section });
      await reloadMe();
    } catch (error) {
      setMessage({ section, error });
    } finally {
      setBusy(false);
    }
  }

  const status = (section: string) =>
    message?.section === section &&
    (message.error ? <ErrorBox error={message.error} /> : <p role="status" className="text-sm text-green-700">{tApp('saved')}</p>);

  if (!form || settings.loading) return settings.error ? <ErrorBox error={settings.error} /> : <Loading />;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());

  return (
    <div className="space-y-4">
      <PageTitle>{t('title')}</PageTitle>

      <Section title={t('general')}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run('general', () =>
              patch('/settings', {
                defaultCreditDays: Number(form.defaultCreditDays),
                invoiceTiming: form.invoiceTiming,
                nearExpiryMonths: Number(form.nearExpiryMonths),
                supplierReturnApproval: form.supplierReturnApproval,
                minimumOrderValue: minimum.trim() === '' ? null : minimum.trim(),
              }),
            );
          }}
        >
          {status('general')}
          <Field label={t('defaultCreditDays')} type="number" min={1} max={365} value={form.defaultCreditDays} onChange={(e) => setForm({ ...form, defaultCreditDays: Number(e.target.value) })} />
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('invoiceTiming')}</span>
            <select className="field" value={form.invoiceTiming} onChange={(e) => setForm({ ...form, invoiceTiming: e.target.value as Settings['invoiceTiming'] })}>
              {INVOICE_TIMINGS.map((v) => (
                <option key={v} value={v}>
                  {t(v)}
                </option>
              ))}
            </select>
          </label>
          <Field label={t('nearExpiryMonths')} type="number" min={1} max={36} value={form.nearExpiryMonths} onChange={(e) => setForm({ ...form, nearExpiryMonths: Number(e.target.value) })} />
          <Field label={t('minimumOrderValue')} inputMode="decimal" dir="ltr" value={minimum} onChange={(e) => setMinimum(e.target.value)} hint={t('minimumOrderOff')} />
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.supplierReturnApproval} onChange={(e) => setForm({ ...form, supplierReturnApproval: e.target.checked })} />
            {t('supplierReturnApproval')}
          </label>
          <button className="btn btn-primary" disabled={busy}>
            {tApp('save')}
          </button>
        </form>
      </Section>

      <Section title={t('workingHours')}>
        <OpenStatusBadge status={me.openStatus} />
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const days = Object.values(week).filter((d): d is Day => d !== null);
            void run('hours', () => put('/settings/working-hours', { days }));
          }}
        >
          {status('hours')}
          {[6, 0, 1, 2, 3, 4, 5].map((d) => {
            const day = week[d] ?? null;
            return (
              <div key={d} className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] py-2">
                <label className="flex w-36 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={day !== null}
                    onChange={(e) => setWeek({ ...week, [d]: e.target.checked ? { dayOfWeek: d, opensAt: '09:00', closesAt: '17:00' } : null })}
                  />
                  {tDays(String(d))}
                </label>
                {day && (
                  <>
                    <span className="muted text-sm">{t('from')}</span>
                    <input className="field w-28" type="time" value={day.opensAt} onChange={(e) => setWeek({ ...week, [d]: { ...day, opensAt: e.target.value } })} />
                    <span className="muted text-sm">{t('to')}</span>
                    <input className="field w-28" type="time" value={day.closesAt} onChange={(e) => setWeek({ ...week, [d]: { ...day, closesAt: e.target.value } })} />
                  </>
                )}
              </div>
            );
          })}
          <button className="btn btn-primary" disabled={busy}>
            {tApp('save')}
          </button>
        </form>
      </Section>

      <Section title={t('closedDays')}>
        {status('closed')}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || closed.data?.items.some((c) => c.closedOn === today)}
            onClick={() => run('closed', async () => { await post('/settings/closed-days', { closedOn: today }); await closed.reload(); })}
          >
            {t('closedToday')}
          </button>
        </div>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run('closed', async () => {
              await post('/settings/closed-days', { closedOn: newClosed.closedOn, note: newClosed.note || null });
              setNewClosed({ closedOn: '', note: '' });
              await closed.reload();
            });
          }}
        >
          <Field label={t('date')} type="date" required value={newClosed.closedOn} onChange={(e) => setNewClosed({ ...newClosed, closedOn: e.target.value })} />
          <Field label={t('note')} value={newClosed.note} onChange={(e) => setNewClosed({ ...newClosed, note: e.target.value })} />
          <button className="btn btn-primary" disabled={busy}>
            {t('addClosedDay')}
          </button>
        </form>
        {closed.data?.items.length === 0 && <p className="muted text-sm">{t('noClosedDays')}</p>}
        <ul className="divide-y divide-[var(--line)]">
          {closed.data?.items.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2">
              <span>
                <span dir="ltr">{c.closedOn}</span>
                {c.note && <span className="muted"> · {c.note}</span>}
              </span>
              <button
                type="button"
                className="text-sm text-red-700 underline"
                disabled={busy}
                onClick={() => run('closed', async () => { await del(`/settings/closed-days/${c.id}`); await closed.reload(); })}
              >
                {t('remove')}
              </button>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
