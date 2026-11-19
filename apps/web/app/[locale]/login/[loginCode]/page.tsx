'use client';

import { use, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { post } from '@/lib/api';
import { Card, ErrorBox, Field, fieldError } from '@/components/ui';
import { LanguageSwitch } from '@/components/language-switch';

// Each wholesaler has its own login link, for example /ar/login/ahmed-pharma (C-86)
export default function LoginPage({ params }: { params: Promise<{ loginCode: string }> }) {
  const { loginCode } = use(params);
  const t = useTranslations('login');
  const tErr = useTranslations('errors');
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post('/auth/login', { loginCode, phone, password });
      try {
        localStorage.setItem('cosmo.loginCode', loginCode);
      } catch {}
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
          <ErrorBox error={error} />
          <Field
            label={t('phone')}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="username"
            dir="ltr"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            error={fieldError(error, 'phone', tErr)}
          />
          <Field
            label={t('password')}
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="btn btn-primary w-full" disabled={busy}>
            {t('submit')}
          </button>
          <div className="flex items-center justify-between text-sm">
            <Link href={`/login/${loginCode}/forgot`} className="underline">
              {t('forgot')}
            </Link>
            <LanguageSwitch />
          </div>
        </form>
      </Card>
    </main>
  );
}
