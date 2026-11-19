import type { LoginInput } from '@cosmo/shared';
import { LOGIN_LOCK_MS, LOGIN_MAX_FAILURES, SESSION_IDLE_MS } from '../../core/config';
import { withTenant, type Db } from '../../core/db';
import { errors } from '../../core/errors';
import { logActivity } from '../../core/activity';
import { notify, usersWithRoles } from '../../core/notifications';
import { deleteSessionsOf } from '../../core/auth';
import { hashPassword, hashToken, newSessionToken, verifyAgainstDummy, verifyPassword } from '../../core/passwords';
import type { AuthContext } from '../../core/context';
import { currentOpenStatus } from '../settings/open-status';

async function activeWholesaler(db: Db, loginCode: string) {
  return db
    .selectFrom('wholesalers')
    .select(['id', 'name', 'login_code'])
    .where('login_code', '=', loginCode)
    .where('is_active', '=', true)
    .executeTakeFirst();
}

export async function login(db: Db, input: LoginInput) {
  const wholesaler = await activeWholesaler(db, input.loginCode);
  if (!wholesaler) {
    await verifyAgainstDummy(input.password);
    throw errors.wrongLogin();
  }

  const outcome = await withTenant(db, wholesaler.id, async (trx) => {
    const user = await trx
      .selectFrom('users')
      .leftJoin('customers as c', 'c.user_id', 'users.id')
      .select(['users.id', 'users.password_hash', 'users.is_active', 'users.user_type', 'users.locked_until', 'users.failed_logins', 'c.is_active as customer_active'])
      .where('users.phone', '=', input.phone)
      .forUpdate('users')
      .executeTakeFirst();

    if (!user) {
      await verifyAgainstDummy(input.password);
      return { kind: 'wrong' as const };
    }
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return { kind: 'locked' as const };
    }

    const ok = await verifyPassword(user.password_hash, input.password);
    const active = user.is_active && (user.user_type === 'employee' || user.customer_active === true);

    if (!ok) {
      const failures = user.failed_logins + 1;
      if (failures >= LOGIN_MAX_FAILURES) {
        await trx
          .updateTable('users')
          .set({ failed_logins: 0, locked_until: new Date(Date.now() + LOGIN_LOCK_MS) })
          .where('id', '=', user.id)
          .execute();
        await logActivity(trx, { userId: null, wholesalerId: wholesaler.id }, {
          action: 'login_locked',
          entityType: 'user',
          entityId: user.id,
          important: true,
        });
        await notify(trx, wholesaler.id, await usersWithRoles(trx, ['owner']), {
          type: 'login_locked',
          title: { en: 'An account was locked after 5 wrong passwords', ar: 'تم قفل حساب بعد ٥ محاولات خاطئة' },
          body: { en: `Phone ending ${input.phone.slice(-4)}`, ar: `رقم ينتهي بـ ${input.phone.slice(-4)}` },
          entityType: 'user',
          entityId: user.id,
        });
        return { kind: 'locked' as const };
      }
      await trx.updateTable('users').set({ failed_logins: failures }).where('id', '=', user.id).execute();
      return { kind: 'wrong' as const };
    }
    // A deactivated account gets the same answer as a wrong password
    if (!active) return { kind: 'wrong' as const };

    const token = newSessionToken();
    await trx
      .updateTable('users')
      .set({ failed_logins: 0, locked_until: null, last_login_at: new Date() })
      .where('id', '=', user.id)
      .execute();
    await trx
      .insertInto('sessions')
      .values({
        user_id: user.id,
        wholesaler_id: wholesaler.id,
        token_hash: hashToken(token),
        last_used_at: new Date(),
        expires_at: new Date(Date.now() + SESSION_IDLE_MS[user.user_type]),
      })
      .execute();
    return { kind: 'ok' as const, token, userType: user.user_type };
  });

  if (outcome.kind === 'locked') throw errors.tooManyAttempts();
  if (outcome.kind === 'wrong') throw errors.wrongLogin();
  return outcome;
}

export async function logout(db: Db, sessionId: string) {
  await db.deleteFrom('sessions').where('id', '=', sessionId).execute();
}

export async function changePassword(db: Db, ctx: AuthContext, currentPassword: string, newPassword: string) {
  await withTenant(db, ctx.wholesalerId, async (trx) => {
    const user = await trx.selectFrom('users').select('password_hash').where('id', '=', ctx.userId).executeTakeFirstOrThrow();
    if (!(await verifyPassword(user.password_hash, currentPassword))) {
      throw errors.rule({ en: 'The current password is wrong', ar: 'كلمة المرور الحالية غير صحيحة' }, { field: 'currentPassword' });
    }
    if (currentPassword === newPassword) {
      throw errors.rule({ en: 'Choose a password different from the current one', ar: 'اختر كلمة مرور مختلفة عن الحالية' }, { field: 'newPassword' });
    }
    await trx
      .updateTable('users')
      .set({ password_hash: await hashPassword(newPassword), must_change_password: false })
      .where('id', '=', ctx.userId)
      .execute();
    // Changing a password ends all other sessions (docs/technical/04-security.md)
    await deleteSessionsOf(trx, ctx.userId, ctx.sessionId);
    await logActivity(trx, ctx, { action: 'password_changed', entityType: 'user', entityId: ctx.userId });
  });
}

// C-87: the request goes to the owner (and sales, for customers).
// The answer is always the same, so nobody learns which phone numbers have accounts.
export async function forgotPassword(db: Db, loginCode: string, phone: string) {
  const wholesaler = await activeWholesaler(db, loginCode);
  if (!wholesaler) return;
  await withTenant(db, wholesaler.id, async (trx) => {
    const user = await trx
      .selectFrom('users')
      .leftJoin('customers as c', 'c.user_id', 'users.id')
      .leftJoin('employees as e', 'e.user_id', 'users.id')
      .select(['users.id', 'users.user_type', 'users.is_active', 'c.business_name', 'e.name as employee_name', 'e.id as employee_id'])
      .where('users.phone', '=', phone)
      .executeTakeFirst();
    if (!user || !user.is_active) return;

    if (user.employee_id) {
      const isOwner = await trx
        .selectFrom('employee_roles')
        .select('role')
        .where('employee_id', '=', user.employee_id)
        .where('role', '=', 'owner')
        .executeTakeFirst();
      // A forgotten owner password is reset by the platform team (C-87)
      if (isOwner) return;
    }

    const existing = await trx
      .selectFrom('password_reset_requests')
      .select('id')
      .where('user_id', '=', user.id)
      .where('status', '=', 'waiting')
      .executeTakeFirst();
    if (existing) return;

    const request = await trx
      .insertInto('password_reset_requests')
      .values({ wholesaler_id: wholesaler.id, user_id: user.id })
      .returning('id')
      .executeTakeFirstOrThrow();
    const who = user.business_name ?? user.employee_name ?? '';
    const recipients = await usersWithRoles(trx, user.user_type === 'customer' ? ['owner', 'sales'] : ['owner']);
    await notify(trx, wholesaler.id, recipients, {
      type: 'password_reset_requested',
      title: { en: `${who} forgot their password`, ar: `${who} نسي كلمة المرور` },
      body: { en: 'Set a temporary password and send it by WhatsApp', ar: 'عيّن كلمة مرور مؤقتة وأرسلها عبر واتساب' },
      entityType: 'password_reset_request',
      entityId: request.id,
    });
    await logActivity(trx, { userId: user.id, wholesalerId: wholesaler.id }, {
      action: 'password_reset_requested',
      entityType: 'user',
      entityId: user.id,
    });
  });
}

export async function me(db: Db, ctx: AuthContext) {
  return withTenant(db, ctx.wholesalerId, async (trx) => {
    const w = await trx.selectFrom('wholesalers').select(['name', 'login_code']).where('id', '=', ctx.wholesalerId).executeTakeFirstOrThrow();
    return {
      userId: ctx.userId,
      userType: ctx.userType,
      name: ctx.name,
      roles: ctx.roles,
      employeeId: ctx.employeeId,
      customerId: ctx.customerId,
      mustChangePassword: ctx.mustChangePassword,
      wholesaler: { name: w.name, loginCode: w.login_code },
      openStatus: await currentOpenStatus(trx, ctx.wholesalerId),
    };
  });
}
