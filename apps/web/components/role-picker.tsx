'use client';

import { useTranslations } from 'next-intl';
import { ROLES, type Role } from '@cosmo/shared';

// One employee can hold several roles (C-31)
export function RolePicker({ value, onChange }: { value: Role[]; onChange: (roles: Role[]) => void }) {
  const t = useTranslations('roles');
  return (
    <div className="grid grid-cols-2 gap-2">
      {ROLES.map((role) => (
        <label key={role} className="flex items-center gap-2 rounded-lg border border-[var(--line)] px-3 py-2">
          <input
            type="checkbox"
            checked={value.includes(role)}
            onChange={(e) => onChange(e.target.checked ? [...value, role] : value.filter((r) => r !== role))}
          />
          <span>{t(role)}</span>
        </label>
      ))}
    </div>
  );
}
