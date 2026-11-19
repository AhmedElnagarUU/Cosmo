'use client';

import { useTranslations } from 'next-intl';
import { Field, fieldError } from './ui';

export interface CustomerFields {
  businessName: string;
  contactPerson: string;
  phone: string;
  address: string;
  area: string;
}

export const emptyCustomer: CustomerFields = { businessName: '', contactPerson: '', phone: '', address: '', area: '' };

export function CustomerForm({
  value,
  onChange,
  error,
  disabled,
}: {
  value: CustomerFields;
  onChange: (v: CustomerFields) => void;
  error: unknown;
  disabled?: boolean;
}) {
  const t = useTranslations('customers');
  const tErr = useTranslations('errors');
  const set = (k: keyof CustomerFields) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <fieldset disabled={disabled} className="space-y-4">
      <Field label={t('businessName')} required value={value.businessName} onChange={set('businessName')} error={fieldError(error, 'businessName', tErr)} />
      <Field label={t('contactPerson')} required value={value.contactPerson} onChange={set('contactPerson')} error={fieldError(error, 'contactPerson', tErr)} />
      <Field label={t('phone')} type="tel" inputMode="tel" dir="ltr" required value={value.phone} onChange={set('phone')} error={fieldError(error, 'phone', tErr)} />
      <Field label={t('address')} required value={value.address} onChange={set('address')} error={fieldError(error, 'address', tErr)} />
      <Field label={t('area')} value={value.area} onChange={set('area')} error={fieldError(error, 'area', tErr)} />
    </fieldset>
  );
}
