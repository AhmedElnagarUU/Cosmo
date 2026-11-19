'use client';

import { useTranslations } from 'next-intl';
import { get } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { Card, ErrorBox, Loading, PageTitle } from '@/components/ui';

interface Profile {
  businessName: string;
  contactPerson: string;
  phone: string;
  address: string;
  area: string | null;
  creditAllowed: boolean;
  creditDays: number;
}

export default function ProfilePage() {
  const t = useTranslations('profile');
  const tC = useTranslations('customers');
  const { data, error } = useLoad(() => get<Profile>('/my/profile'));
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  return (
    <div>
      <PageTitle>{t('title')}</PageTitle>
      <Card className="space-y-2">
        <div className="text-lg font-semibold">{data.businessName}</div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="muted">{tC('contactPerson')}</dt>
          <dd>{data.contactPerson}</dd>
          <dt className="muted">{tC('phone')}</dt>
          <dd dir="ltr">{data.phone}</dd>
          <dt className="muted">{tC('address')}</dt>
          <dd>{data.address}</dd>
          {data.area && (
            <>
              <dt className="muted">{tC('area')}</dt>
              <dd>{data.area}</dd>
            </>
          )}
        </dl>
        <p className="pt-2">{data.creditAllowed ? t('creditDays', { days: data.creditDays }) : t('noCredit')}</p>
      </Card>
    </div>
  );
}
