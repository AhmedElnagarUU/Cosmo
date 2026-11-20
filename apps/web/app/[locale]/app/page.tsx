'use client';

import { useTranslations } from 'next-intl';
import { useMe } from '@/lib/me-context';
import { Link } from '@/i18n/navigation';
import { Card } from '@/components/ui';
import { OpenStatusBadge } from '@/components/open-status';

// The home screen. It grows with each phase: orders to accept, to prepare, to deliver, and so on.
export default function HomePage() {
  const { me } = useMe();
  const t = useTranslations('home');
  const tRoles = useTranslations('roles');
  const tNav = useTranslations('nav');

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t('hello', { name: me.name })}</h1>
      <Card>
        <OpenStatusBadge status={me.openStatus} />
      </Card>
      {me.userType === 'employee' ? (
        <Card className="space-y-2">
          <p>{t('staffIntro', { roles: me.roles.map((r) => tRoles(r)).join('، ') })}</p>
          <p className="muted text-sm">{t('comingSoon')}</p>
        </Card>
      ) : (
        <Card className="space-y-3">
          <p>{t('customerIntro')}</p>
          <Link href="/app/catalog" className="btn btn-primary">
            {tNav('catalog')}
          </Link>
        </Card>
      )}
    </div>
  );
}
