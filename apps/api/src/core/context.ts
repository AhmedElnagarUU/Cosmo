import type { Request } from 'express';
import type { Role } from '@cosmo/shared';
import type { Db } from './db';
import { errors } from './errors';

export interface AuthContext {
  sessionId: string;
  userId: string;
  wholesalerId: string;
  userType: 'employee' | 'customer';
  roles: Role[];
  employeeId: string | null;
  customerId: string | null;
  name: string;
  mustChangePassword: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
      lang: 'ar' | 'en';
    }
    interface Locals {
      db: Db;
    }
  }
}

export function auth(req: Request): AuthContext {
  if (!req.auth) throw errors.notLoggedIn();
  return req.auth;
}

export function actorOf(ctx: AuthContext) {
  return { userId: ctx.userId, wholesalerId: ctx.wholesalerId };
}
