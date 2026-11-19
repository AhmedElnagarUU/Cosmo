import { normalizePhone, type Role } from '@cosmo/shared';
import { withTenant, type Db } from '../../core/db';
import { logActivity } from '../../core/activity';
import { hashPassword, temporaryPassword } from '../../core/passwords';
import { deleteSessionsOf } from '../../core/auth';

// Platform administration (docs/technical/02-api-design.md, area 13).
// In the first version these run as command-line scripts on the server,
// so only people with server access can use them. A web screen comes later.

export async function createWholesaler(
  db: Db,
  input: { name: string; loginCode: string; ownerName: string; ownerPhone: string },
) {
  const phone = normalizePhone(input.ownerPhone);
  if (!phone) throw new Error('The owner phone number is not a valid Egyptian mobile number');
  const loginCode = input.loginCode.trim().toLowerCase();

  const wholesaler = await db
    .insertInto('wholesalers')
    .values({ name: input.name.trim(), login_code: loginCode })
    .returning('id')
    .executeTakeFirstOrThrow();

  return withTenant(db, wholesaler.id, async (trx) => {
    await trx.insertInto('settings').values({ wholesaler_id: wholesaler.id }).execute();
    const password = temporaryPassword();
    const user = await trx
      .insertInto('users')
      .values({ wholesaler_id: wholesaler.id, phone, password_hash: await hashPassword(password), user_type: 'employee' })
      .returning('id')
      .executeTakeFirstOrThrow();
    const employee = await trx
      .insertInto('employees')
      .values({ wholesaler_id: wholesaler.id, user_id: user.id, name: input.ownerName.trim() })
      .returning('id')
      .executeTakeFirstOrThrow();
    await trx
      .insertInto('employee_roles')
      .values({ employee_id: employee.id, role: 'owner' as Role, wholesaler_id: wholesaler.id })
      .execute();
    await logActivity(trx, { userId: null, wholesalerId: wholesaler.id }, {
      action: 'wholesaler_created',
      entityType: 'wholesaler',
      entityId: wholesaler.id,
      details: { by: 'platform' },
    });
    return { wholesalerId: wholesaler.id, loginCode, ownerPhone: phone, temporaryPassword: password };
  });
}

// C-87: the platform team resets a forgotten owner password after calling the owner
export async function resetOwnerPassword(db: Db, loginCode: string, ownerPhone: string) {
  const phone = normalizePhone(ownerPhone);
  if (!phone) throw new Error('The phone number is not valid');
  const w = await db.selectFrom('wholesalers').select('id').where('login_code', '=', loginCode.trim().toLowerCase()).executeTakeFirst();
  if (!w) throw new Error('No wholesaler with this login code');
  return withTenant(db, w.id, async (trx) => {
    const owner = await trx
      .selectFrom('users as u')
      .innerJoin('employees as e', 'e.user_id', 'u.id')
      .innerJoin('employee_roles as r', 'r.employee_id', 'e.id')
      .select('u.id')
      .where('u.phone', '=', phone)
      .where('r.role', '=', 'owner')
      .executeTakeFirst();
    if (!owner) throw new Error('No owner with this phone number');
    const password = temporaryPassword();
    await trx
      .updateTable('users')
      .set({ password_hash: await hashPassword(password), must_change_password: true, failed_logins: 0, locked_until: null, is_active: true })
      .where('id', '=', owner.id)
      .execute();
    await deleteSessionsOf(trx, owner.id);
    await logActivity(trx, { userId: null, wholesalerId: w.id }, {
      action: 'owner_password_reset',
      entityType: 'user',
      entityId: owner.id,
      details: { by: 'platform' },
      important: true,
    });
    return { temporaryPassword: password };
  });
}
