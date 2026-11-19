'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { FirstLogin } from '@/lib/api';
import { Card } from './ui';

// Shows the temporary password once, with a WhatsApp button (C-73, C-87)
export function FirstLoginCard({ details, wholesalerName }: { details: FirstLogin; wholesalerName: string }) {
  const t = useTranslations('firstLogin');
  const tApp = useTranslations('app');
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/${document.documentElement.lang}/login/${details.loginCode}`;
  const message = t('message', { wholesaler: wholesalerName, link, phone: details.phone, password: details.temporaryPassword });
  const waNumber = '2' + details.phone; // 010... becomes 2010...
  const waLink = `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;

  return (
    <Card className="space-y-3 border-teal-500">
      <h2 className="text-lg font-bold">{t('title')}</h2>
      <p className="muted text-sm">{t('help')}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="muted">{t('link')}</dt>
        <dd className="break-all" dir="ltr">{link}</dd>
        <dt className="muted">{t('phone')}</dt>
        <dd dir="ltr">{details.phone}</dd>
        <dt className="muted">{t('password')}</dt>
        <dd dir="ltr" className="font-mono text-base font-bold" data-testid="temporary-password">
          {details.temporaryPassword}
        </dd>
      </dl>
      <div className="flex flex-wrap gap-2">
        <a className="btn btn-primary" href={waLink} target="_blank" rel="noreferrer">
          {t('whatsapp')}
        </a>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={async () => {
            await navigator.clipboard?.writeText(message).catch(() => {});
            setCopied(true);
          }}
        >
          {copied ? tApp('copied') : tApp('copy')}
        </button>
      </div>
    </Card>
  );
}
