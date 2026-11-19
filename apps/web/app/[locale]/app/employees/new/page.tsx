'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Role } from '@cosmo/shared';
import { Link } from '@/i18n/navigation';
import { post, type FirstLogin } from '@/lib/api';
import { useMe } from '@/lib/me-context';
import { Card, ErrorBox, Field, PageTitle, fieldError } from '@/components/ui';
import { RolePicker } from '@/components/role-picker';
import { FirstLoginCard } from '@/components/first-login-card';

// OWN-01: name, phone, roles. The temporary password is shown once.
export default function NewEmployeePage() {
  const t = useTranslations('employees');
  const tApp = useTranslations('app');
  const tErr = useTranslations('errors');
  const { me } = useMe();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [roles, setRoles] = useState<Role[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [created, setCreated] = useState<{ id: string; details: FirstLogin } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ employee: { id: string; phone: string }; temporaryPassword: string }>('/employees', { name, phone, roles });
      setCreated({
        id: r.employee.id,
        details: { loginCode: me.wholesaler.loginCode, phone: r.employee.phone, temporaryPassword: r.temporaryPassword },
      });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div className="space-y-4">
        <PageTitle>{t('add')}</PageTitle>
        <FirstLoginCard details={created.details} wholesalerName={me.wholesaler.name} />
        <Link href="/app/employees" className="btn btn-secondary">
          {tApp('back')}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <PageTitle>{t('add')}</PageTitle>
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <ErrorBox error={error} />
          <Field label={t('name')} required value={name} onChange={(e) => setName(e.target.value)} error={fieldError(error, 'name', tErr)} />
          <Field label={t('phone')} type="tel" inputMode="tel" dir="ltr" required value={phone} onChange={(e) => setPhone(e.target.value)} error={fieldError(error, 'phone', tErr)} />
          <div className="space-y-1">
            <span className="text-sm font-medium">{t('roles')}</span>
            <RolePicker value={roles} onChange={setRoles} />
            {roles.length === 0 && <span className="muted text-xs">{t('chooseRole')}</span>}
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={busy || roles.length === 0}>
              {tApp('save')}
            </button>
            <Link href="/app/employees" className="btn btn-secondary">
              {tApp('cancel')}
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
