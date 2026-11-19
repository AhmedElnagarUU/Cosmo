'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { get } from '@/lib/api';
import { Card } from '@/components/ui';
import { LanguageSwitch } from '@/components/language-switch';

// The start page. A logged-in person goes to the app. Others are sent to their wholesaler's login link.
export default function StartPage() {
  const t = useTranslations();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    get('/me')
      .then(() => router.replace('/app'))
      .catch(() => {
        let last: string | null = null;
        try {
          last = localStorage.getItem('cosmo.loginCode');
        } catch {}
        if (last) router.replace(`/login/${last}`);
        else setChecked(true);
      });
  }, [router]);

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <Card className="space-y-3 text-center">
        <h1 className="text-2xl font-bold text-[var(--color-brand)]">{t('app.name')}</h1>
        {checked ? <p className="muted">{t('login.noCode')}</p> : <p className="muted">{t('app.loading')}</p>}
        <LanguageSwitch />
      </Card>
    </main>
  );
}
