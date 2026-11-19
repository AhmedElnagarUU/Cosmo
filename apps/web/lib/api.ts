'use client';

import type { ApiErrorBody, ErrorCode } from '@cosmo/shared';

// The only place that talks to the backend (docs/technical/03-project-structure.md).
// The browser sends requests to this website, and Next.js passes them to Express.

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
  get fields(): Record<string, string> {
    return ((this.details?.fields as Record<string, string>) ?? {});
  }
}

function currentLocale(): string {
  if (typeof document === 'undefined') return 'ar';
  return document.documentElement.lang || 'ar';
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        'Accept-Language': currentLocale(),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'SERVER_ERROR', currentLocale() === 'en' ? 'No connection. Please try again.' : 'لا يوجد اتصال. حاول مرة أخرى.');
  }
  const data = (await res.json().catch(() => ({}))) as unknown;
  if (!res.ok) {
    const err = (data as ApiErrorBody).error;
    throw new ApiError(res.status, err?.code ?? 'SERVER_ERROR', err?.message ?? 'Error', err?.details);
  }
  return data as T;
}

export const get = <T>(path: string) => api<T>('GET', path);
export const post = <T>(path: string, body?: unknown) => api<T>('POST', path, body ?? {});
export const patch = <T>(path: string, body: unknown) => api<T>('PATCH', path, body);
export const put = <T>(path: string, body: unknown) => api<T>('PUT', path, body);
export const del = <T>(path: string) => api<T>('DELETE', path);

// Types of the answers used by the screens
export type OpenStatus =
  | { open: true; closesAt: string }
  | { open: false; nextOpening: { date: string; time: string } | null };

export interface Me {
  userId: string;
  userType: 'employee' | 'customer';
  name: string;
  roles: string[];
  employeeId: string | null;
  customerId: string | null;
  mustChangePassword: boolean;
  wholesaler: { name: string; loginCode: string };
  openStatus: OpenStatus;
}

export interface FirstLogin {
  loginCode: string;
  phone: string;
  temporaryPassword: string;
}
