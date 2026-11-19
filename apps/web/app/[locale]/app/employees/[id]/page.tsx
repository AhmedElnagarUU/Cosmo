'use client';

import { use, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Role } from '@cosmo/shared';
import { Link } from '@/i18n/navigation';
import { get, patch, post, type FirstLogin } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { useMe } from '@/lib/me-context';
import { Badge, Card, ErrorBox, Field, Loading, PageTitle, fieldError } from '@/components/ui';
import { RolePicker } from '@/components/role-picker';
import { FirstLoginCard } from '@/components/first-login-card';

interface Employee {
  id: string;
  name: string;
  phone: string;
  roles: Role[];
  isActive: boolean;
}

export default function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('employees');
  const tApp = useTranslations('app');
  const tErr = useTranslations('errors');
  const { me } = useMe();
  const { data, error: loadError, setData } = useLoad(() => get<Employee>(`/employees/${id}`), [id]);
  const [name, setName] = useState('');
  const [roles, setRoles] = useState<Role[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const [reset, setReset] = useState<FirstLogin | null>(null);

  useEffect(() => {
    if (data) {
      setName(data.name);
      setRoles(data.roles);
    }
  }, [data]);

  async function run(fn: () => Promise<Employee | void>) {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const r = await fn();
      if (r) setData(r);
      setSaved(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <ErrorBox error={loadError} />;
  if (!data) return <Loading />;
  const isSelf = data.id === me.employeeId;

  return (
    <div className="space-y-4">
      <PageTitle action={!data.isActive && <Badge tone="red">{t('inactive')}</Badge>}>{t('edit')}</PageTitle>
      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => patch<Employee>(`/employees/${id}`, { name, roles }));
          }}
          className="space-y-4"
        >
          <ErrorBox error={error} />
          {saved && <p role="status" className="text-sm text-green-700">{tApp('saved')}</p>}
          <Field label={t('name')} required value={name} onChange={(e) => setName(e.target.value)} error={fieldError(error, 'name', tErr)} />
          <div className="text-sm">
            <span className="muted">{t('phone')}: </span>
            <span dir="ltr">{data.phone}</span>
          </div>
          <div className="space-y-1">
            <span className="text-sm font-medium">{t('roles')}</span>
            <RolePicker value={roles} onChange={setRoles} />
          </div>
          <button className="btn btn-primary" disabled={busy || roles.length === 0}>
            {tApp('save')}
          </button>
        </form>
      </Card>

      {reset && <FirstLoginCard details={reset} wholesalerName={me.wholesaler.name} />}

      {!isSelf && (
        <Card className="flex flex-wrap gap-2">
          {data.isActive && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const r = await post<{ temporaryPassword: string; phone: string }>(`/employees/${id}/reset-password`);
                  setReset({ loginCode: me.wholesaler.loginCode, phone: r.phone, temporaryPassword: r.temporaryPassword });
                })
              }
            >
              {t('resetPassword')}
            </button>
          )}
          {data.isActive ? (
            <button
              type="button"
              className="btn btn-secondary text-red-700"
              disabled={busy}
              onClick={() => confirm(t('confirmDeactivate')) && run(() => post<Employee>(`/employees/${id}/deactivate`))}
            >
              {t('deactivate')}
            </button>
          ) : (
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => run(() => post<Employee>(`/employees/${id}/activate`))}>
              {t('activate')}
            </button>
          )}
        </Card>
      )}
      <Link href="/app/employees" className="btn btn-secondary">
        {tApp('back')}
      </Link>
    </div>
  );
}
