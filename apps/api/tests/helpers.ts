import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { createDb, type Db } from '../src/core/db';
import { createWholesaler } from '../src/modules/platform/platform.service';

export const ORIGIN = 'http://localhost:3000';

let counter = 0;
export function uniquePhone(): string {
  counter += 1;
  return '010' + String(Date.now() % 100000).padStart(5, '0').slice(0, 5) + String(counter).padStart(3, '0');
}

export function setup() {
  const db: Db = createDb(process.env.DATABASE_URL!);
  const ownerDb: Db = createDb(process.env.MIGRATION_DATABASE_URL!);
  const app: Express = createApp(db);
  return { db, ownerDb, app };
}

// A logged-in browser: keeps its cookie and always sends our Origin header
export function client(app: Express) {
  const agent = request.agent(app);
  const withOrigin = <T extends request.Test>(t: T) => t.set('Origin', ORIGIN).set('Accept-Language', 'en');
  return {
    agent,
    get: (url: string) => withOrigin(agent.get(url)),
    post: (url: string, body?: object) => withOrigin(agent.post(url)).send(body ?? {}),
    patch: (url: string, body?: object) => withOrigin(agent.patch(url)).send(body ?? {}),
    put: (url: string, body?: object) => withOrigin(agent.put(url)).send(body ?? {}),
    del: (url: string) => withOrigin(agent.delete(url)),
  };
}
export type Client = ReturnType<typeof client>;

export const NEW_PASSWORD = 'a-good-password-1';

// Logs in with a temporary password and changes it, like a person on the first day
export async function firstLogin(app: Express, loginCode: string, phone: string, temporaryPassword: string) {
  const c = client(app);
  const login = await c.post('/api/v1/auth/login', { loginCode, phone, password: temporaryPassword });
  if (login.status !== 200) throw new Error('login failed: ' + JSON.stringify(login.body));
  const change = await c.post('/api/v1/auth/change-password', { currentPassword: temporaryPassword, newPassword: NEW_PASSWORD });
  if (change.status !== 200) throw new Error('change failed: ' + JSON.stringify(change.body));
  return c;
}

let codeCounter = 0;
export async function newWholesaler(ownerDb: Db, app: Express) {
  codeCounter += 1;
  const loginCode = `test-${Date.now() % 100000}-${codeCounter}`;
  const ownerPhone = uniquePhone();
  const w = await createWholesaler(ownerDb, { name: 'Test ' + loginCode, loginCode, ownerName: 'Owner', ownerPhone });
  const owner = await firstLogin(app, loginCode, ownerPhone, w.temporaryPassword);
  return { ...w, owner };
}
