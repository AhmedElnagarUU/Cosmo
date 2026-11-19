'use client';

import { use, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { post } from '@/lib/api';
import { Card, ErrorBox, Field, fieldError } from '@/components/ui';

// C-87: the request goes to the wholesaler, who sends a temporary password by WhatsApp
export default function ForgotPage({ params }: { params: Promise<{ loginCode: string }> }) {
  const { loginCode } = use(params);
  const t = useTranslations('forgot');
  const tLogin = useTranslations('login');
  const tErr = useTranslations('errors');
  const [phone, setPhone] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post('/auth/forgot-password', { loginCode, phone });
      setDone(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <Card className="space-y-4">
        <h1 className="text-xl font-bold">{t('title')}</h1>
        {done ? (
          <p role="status">{t('done')}</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="muted text-sm">{t('help')}</p>
            <ErrorBox error={error} />
            <Field
              label={tLogin('phone')}
              type="tel"
              inputMode="tel"
              dir="ltr"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              error={fieldError(error, 'phone', tErr)}
            />
            <button className="btn btn-primary w-full" disabled={busy}>
              {t('submit')}
            </button>
          </form>
        )}
        <Link href={`/login/${loginCode}`} className="block text-sm underline">
          {t('backToLogin')}
        </Link>
      </Card>
    </main>
  );
}
