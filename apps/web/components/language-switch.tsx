'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';

export function LanguageSwitch() {
  const t = useTranslations('app');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  return (
    <button type="button" className="text-sm underline" onClick={() => router.replace(pathname, { locale: locale === 'ar' ? 'en' : 'ar' })}>
      {t('language')}
    </button>
  );
}
