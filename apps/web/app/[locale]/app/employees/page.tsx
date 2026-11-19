'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { get } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { Badge, Card, ErrorBox, Loading, PageTitle } from '@/components/ui';

interface Row {
  id: string;
  name: string;
  phone: string;
  roles: string[];
  isActive: boolean;
  lastLoginAt: string | null;
}

export default function EmployeesPage() {
  const t = useTranslations('employees');
  const tRoles = useTranslations('roles');
  const locale = useLocale();
  const { data, error, loading } = useLoad(() => get<{ items: Row[] }>('/employees'));

  return (
    <div>
      <PageTitle
        action={
          <Link href="/app/employees/new" className="btn btn-primary">
            {t('add')}
          </Link>
        }
      >
        {t('title')}
      </PageTitle>
      <ErrorBox error={error} />
      {loading && !data ? (
        <Loading />
      ) : (
        <div className="space-y-2">
          {data?.items.map((e) => (
            <Link key={e.id} href={`/app/employees/${e.id}`} className="block">
              <Card className="flex flex-wrap items-center justify-between gap-2 hover:border-teal-500">
                <div>
                  <div className="font-semibold">{e.name}</div>
                  <div className="muted text-sm" dir="ltr">
                    {e.phone}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {e.roles.map((r) => (
                    <Badge key={r} tone="teal">
                      {tRoles(r)}
                    </Badge>
                  ))}
                  {!e.isActive && <Badge tone="red">{t('inactive')}</Badge>}
                </div>
                <div className="muted w-full text-xs">
                  {t('lastLogin')}: {e.lastLoginAt ? new Date(e.lastLoginAt).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-GB') : t('never')}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
