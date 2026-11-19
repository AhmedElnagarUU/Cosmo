'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { get, post, type Me } from '@/lib/api';
import { Card, ErrorBox, Field } from '@/components/ui';

// Required at first login and after a reset (C-29, C-48). Also used to change a password later.
export default function ChangePasswordPage() {
  const t = useTranslations('changePassword');
  const tApp = useTranslations('app');
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<string | null>(null);

  useEffect(() => {
    get<Me>('/me').then(setMe).catch(() => router.replace('/'));
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 8) return setLocal(t('tooShort'));
    if (next !== repeat) return setLocal(t('mismatch'));
    setLocal(null);
    setBusy(true);
    try {
      await post('/auth/change-password', { currentPassword: current, newPassword: next });
      router.replace('/app');
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <h1 className="text-xl font-bold">{t('title')}</h1>
          {me?.mustChangePassword && <p className="muted text-sm">{t('firstTime')}</p>}
          <ErrorBox error={error} />
          {local && (
            <p role="alert" className="text-sm text-red-600">
              {local}
            </p>
          )}
          <Field label={t('current')} type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
          <Field label={t('new')} type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} hint={t('tooShort')} />
          <Field label={t('repeat')} type="password" autoComplete="new-password" required value={repeat} onChange={(e) => setRepeat(e.target.value)} />
          <button className="btn btn-primary w-full" disabled={busy || !me}>
            {t('submit')}
          </button>
          {me && !me.mustChangePassword && (
            <button type="button" className="btn btn-secondary w-full" onClick={() => router.back()}>
              {tApp('cancel')}
            </button>
          )}
        </form>
      </Card>
    </main>
  );
}
