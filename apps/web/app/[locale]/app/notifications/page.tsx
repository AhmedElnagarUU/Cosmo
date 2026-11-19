'use client';

import { useLocale, useTranslations } from 'next-intl';
import { get, post } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { Card, ErrorBox, Loading, PageTitle } from '@/components/ui';

interface Note {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

// Notifications inside the app (C-46)
export default function NotificationsPage() {
  const t = useTranslations('notifications');
  const locale = useLocale();
  const { data, error, loading, reload } = useLoad(() => get<{ items: Note[]; unread: number }>('/notifications?limit=50'));

  return (
    <div>
      <PageTitle
        action={
          !!data?.unread && (
            <button type="button" className="btn btn-secondary" onClick={() => post('/notifications/read-all').then(reload)}>
              {t('markAll')}
            </button>
          )
        }
      >
        {t('title')}
      </PageTitle>
      <ErrorBox error={error} />
      {loading && !data ? (
        <Loading />
      ) : data?.items.length === 0 ? (
        <p className="muted py-6 text-center">{t('none')}</p>
      ) : (
        <div className="space-y-2">
          {data?.items.map((n) => (
            <Card key={n.id} className={n.readAt ? 'opacity-70' : 'border-teal-500'}>
              <button
                type="button"
                className="w-full text-start"
                onClick={() => !n.readAt && post(`/notifications/${n.id}/read`).then(reload)}
              >
                <div className="font-semibold">{n.title}</div>
                {n.body && <div className="text-sm">{n.body}</div>}
                <div className="muted text-xs">{new Date(n.createdAt).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-GB')}</div>
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
