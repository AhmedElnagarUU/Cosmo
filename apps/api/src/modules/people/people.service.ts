import type { Role } from '@cosmo/shared';
import type { Trx } from '../../core/db';
import { errors } from '../../core/errors';
import { hashPassword, temporaryPassword } from '../../core/passwords';
import { deleteSessionsOf } from '../../core/auth';

export async function phoneIsFree(trx: Trx, phone: string, exceptUserId?: string) {
  let q = trx.selectFrom('users').select('id').where('phone', '=', phone);
  if (exceptUserId) q = q.where('id', '!=', exceptUserId);
  if (await q.executeTakeFirst()) {
    throw errors.rule(
      { en: 'This phone number is already used by another account', ar: 'رقم الهاتف مستخدم بالفعل في حساب آخر' },
      { field: 'phone' },
    );
  }
}

// Creates a login with a temporary password that must be changed at first login (C-29, C-48)
export async function createUser(trx: Trx, wholesalerId: string, phone: string, userType: 'employee' | 'customer') {
  await phoneIsFree(trx, phone);
  const password = temporaryPassword();
  const user = await trx
    .insertInto('users')
    .values({ wholesaler_id: wholesalerId, phone, password_hash: await hashPassword(password), user_type: userType, must_change_password: true })
    .returning('id')
    .executeTakeFirstOrThrow();
  return { userId: user.id, temporaryPassword: password };
}

// Sets a new temporary password and logs the person out everywhere (C-87)
export async function resetToTemporaryPassword(trx: Trx, userId: string, handledBy: string) {
  const password = temporaryPassword();
  await trx
    .updateTable('users')
    .set({ password_hash: await hashPassword(password), must_change_password: true, failed_logins: 0, locked_until: null })
    .where('id', '=', userId)
    .execute();
  await deleteSessionsOf(trx, userId);
  await trx
    .updateTable('password_reset_requests')
    .set({ status: 'done', handled_by: handledBy, handled_at: new Date() })
    .where('user_id', '=', userId)
    .where('status', '=', 'waiting')
    .execute();
  return password;
}

export async function activeOwnerCount(trx: Trx, exceptEmployeeId?: string) {
  let q = trx
    .selectFrom('employee_roles as r')
    .innerJoin('employees as e', 'e.id', 'r.employee_id')
    .innerJoin('users as u', 'u.id', 'e.user_id')
    .where('r.role', '=', 'owner')
    .where('u.is_active', '=', true);
  if (exceptEmployeeId) q = q.where('e.id', '!=', exceptEmployeeId);
  const row = await q.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow();
  return Number(row.n);
}

export const lastOwnerError = () =>
  errors.rule({
    en: 'There must always be at least one active owner',
    ar: 'يجب أن يوجد مالك واحد نشط على الأقل',
  });

export function sortRoles(roles: Role[]): Role[] {
  const order: Role[] = ['owner', 'sales', 'stock_manager', 'delivery_manager', 'accountant', 'delivery'];
  return [...new Set(roles)].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}
