function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export const config = {
  databaseUrl: required('DATABASE_URL'),
  webOrigin: required('WEB_ORIGIN'),
  port: Number(process.env.PORT ?? 4000),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  isTest: process.env.NODE_ENV === 'test',
};

// Session lengths without use (C-91)
export const SESSION_IDLE_MS = {
  customer: 30 * 24 * 60 * 60 * 1000,
  employee: 12 * 60 * 60 * 1000,
} as const;

// Login limits (docs/technical/04-security.md)
export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;

export const SESSION_COOKIE = 'cosmo_session';
