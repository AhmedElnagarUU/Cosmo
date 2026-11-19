'use client';

import type { ReactNode, InputHTMLAttributes } from 'react';
import { useTranslations } from 'next-intl';
import { ApiError } from '@/lib/api';

export function Field({
  label,
  error,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <input className="field" aria-invalid={error ? true : undefined} {...props} />
      {hint && !error && <span className="text-xs muted">{hint}</span>}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </label>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  const t = useTranslations('app');
  if (!error) return null;
  const message = error instanceof ApiError ? error.message : t('error');
  return (
    <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
      {message}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card p-4 ${className}`}>{children}</div>;
}

export function PageTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-bold">{children}</h1>
      {action}
    </div>
  );
}

export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'green' | 'red' | 'teal' }) {
  const tones = {
    gray: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200',
    green: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
    red: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
    teal: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-100',
  };
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Loading() {
  const t = useTranslations('app');
  return <p className="muted py-6 text-center">{t('loading')}</p>;
}

// Field errors come back from the backend with codes, for example "invalid_phone".
// translate is useTranslations('errors').
export function fieldError(err: unknown, name: string, translate: (key: string) => string): string | undefined {
  if (!(err instanceof ApiError)) return undefined;
  const code = err.fields[name];
  if (!code) return undefined;
  return ['invalid_phone', 'password_too_short'].includes(code) ? translate(code) : translate('generic');
}
