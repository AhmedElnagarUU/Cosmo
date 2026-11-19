import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@cosmo/shared';
import { SESSION_COOKIE, SESSION_IDLE_MS, config } from './config';
import { withTenant, type Db } from './db';
import { hashToken } from './passwords';
import type { AuthContext } from './context';

// Reads the session cookie and loads the user, their roles, and their wholesaler.
// It does not refuse anything. Routes decide with requireLogin and requireRoles.
export function loadSession(db: Db) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || token.length < 20) return next();

    const session = await db
      .selectFrom('sessions')
      .innerJoin('wholesalers as w', 'w.id', 'sessions.wholesaler_id')
      .select(['sessions.id', 'sessions.user_id', 'sessions.wholesaler_id', 'sessions.expires_at', 'sessions.last_used_at', 'w.is_active as wholesaler_active'])
      .where('token_hash', '=', hashToken(token))
      .executeTakeFirst();
    if (!session || !session.wholesaler_active || new Date(session.expires_at) <= new Date()) return next();

    const ctx = await withTenant(db, session.wholesaler_id, async (trx) => {
      const user = await trx
        .selectFrom('users')
        .leftJoin('employees as e', 'e.user_id', 'users.id')
        .leftJoin('customers as c', 'c.user_id', 'users.id')
        .select([
          'users.id', 'users.user_type', 'users.is_active', 'users.must_change_password',
          'e.id as employee_id', 'e.name as employee_name',
          'c.id as customer_id', 'c.business_name', 'c.is_active as customer_active',
        ])
        .where('users.id', '=', session.user_id)
        .executeTakeFirst();
      if (!user || !user.is_active) return null;
      if (user.user_type === 'customer' && !user.customer_active) return null;

      const roles = user.employee_id
        ? (await trx.selectFrom('employee_roles').select('role').where('employee_id', '=', user.employee_id).execute()).map((r) => r.role)
        : [];

      // Sliding expiry: each use extends the session. Written at most once a minute.
      const lastUsed = new Date(session.last_used_at).getTime();
      if (Date.now() - lastUsed > 60_000) {
        await trx
          .updateTable('sessions')
          .set({ last_used_at: new Date(), expires_at: new Date(Date.now() + SESSION_IDLE_MS[user.user_type]) })
          .where('id', '=', session.id)
          .execute();
      }

      const result: AuthContext = {
        sessionId: session.id,
        userId: user.id,
        wholesalerId: session.wholesaler_id,
        userType: user.user_type,
        roles,
        employeeId: user.employee_id,
        customerId: user.customer_id,
        name: user.employee_name ?? user.business_name ?? '',
        mustChangePassword: user.must_change_password,
      };
      return result;
    });
    if (ctx) req.auth = ctx;
    next();
  };
}

export async function deleteSessionsOf(db: Db | import('./db').Trx, userId: string, exceptSessionId?: string) {
  let q = db.deleteFrom('sessions').where('user_id', '=', userId);
  if (exceptSessionId) q = q.where('id', '!=', exceptSessionId);
  await q.execute();
}

export function sessionCookieOptions(userType: 'employee' | 'customer') {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_IDLE_MS[userType],
  };
}

export const hasRole = (roles: Role[], role: Role) => roles.includes(role);

