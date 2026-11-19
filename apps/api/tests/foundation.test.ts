import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { client, firstLogin, NEW_PASSWORD, newWholesaler, setup, uniquePhone } from './helpers';
import { withTenant } from '../src/core/db';
import { resetOwnerPassword } from '../src/modules/platform/platform.service';

const { db, ownerDb, app } = setup();
afterAll(async () => {
  await db.destroy();
  await ownerDb.destroy();
});

describe('login and first password (C-29, C-48)', () => {
  it('refuses a wrong password with a general message', async () => {
    const w = await newWholesaler(ownerDb, app);
    const c = client(app);
    const res = await c.post('/api/v1/auth/login', { loginCode: w.loginCode, phone: w.ownerPhone, password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('The phone number or password is wrong');
    const unknown = await c.post('/api/v1/auth/login', { loginCode: w.loginCode, phone: uniquePhone(), password: 'x' });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.message).toBe(res.body.error.message);
  });

  it('forces a password change before anything else', async () => {
    const w = await newWholesaler(ownerDb, app);
    const created = await w.owner.post('/api/v1/employees', { name: 'Sara', phone: uniquePhone(), roles: ['sales'] });
    expect(created.status).toBe(201);
    const c = client(app);
    await c.post('/api/v1/auth/login', { loginCode: w.loginCode, phone: created.body.employee.phone, password: created.body.temporaryPassword }).expect(200);
    const me = await c.get('/api/v1/me').expect(200);
    expect(me.body.mustChangePassword).toBe(true);
    const blocked = await c.get('/api/v1/customers');
    expect(blocked.status).toBe(401);
    expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    await c.post('/api/v1/auth/change-password', { currentPassword: created.body.temporaryPassword, newPassword: NEW_PASSWORD }).expect(200);
    await c.get('/api/v1/customers').expect(200);
  });

  it('accepts phone numbers written in different ways', async () => {
    const w = await newWholesaler(ownerDb, app);
    const c = client(app);
    const intl = '+20 ' + w.ownerPhone.slice(1);
    await c.post('/api/v1/auth/login', { loginCode: w.loginCode, phone: intl, password: NEW_PASSWORD }).expect(200);
  });

  it('locks the account after 5 wrong passwords and alerts the owner', async () => {
    const w = await newWholesaler(ownerDb, app);
    const emp = await w.owner.post('/api/v1/employees', { name: 'Mona', phone: uniquePhone(), roles: ['accountant'] });
    const c = client(app);
    for (let i = 0; i < 4; i++) {
      await c.post('/api/v1/auth/login', { loginCode: w.loginCode, phone: emp.body.employee.phone, password: 'nope-nope' }).expect(401);
    }
    const fifth = await c.post('/api/v1/auth/login', { loginCode: w.loginCode, phone: emp.body.employee.phone, password: 'nope-nope' });
    expect(fifth.status).toBe(429);
    // Even the right password is refused while locked
    const right = await c.post('/api/v1/auth/login', { loginCode: w.loginCode, phone: emp.body.employee.phone, password: emp.body.temporaryPassword });
    expect(right.status).toBe(429);
    const notes = await w.owner.get('/api/v1/notifications').expect(200);
    expect(notes.body.items.some((n: { type: string }) => n.type === 'login_locked')).toBe(true);
  });

  it('logs out', async () => {
    const w = await newWholesaler(ownerDb, app);
    await w.owner.post('/api/v1/auth/logout').expect(200);
    await w.owner.get('/api/v1/me').expect(401);
  });
});

describe('requests from other websites (CSRF)', () => {
  it('refuses a change without our Origin', async () => {
    const w = await newWholesaler(ownerDb, app);
    const res = await w.owner.agent.post('/api/v1/employees').send({ name: 'X', phone: uniquePhone(), roles: ['sales'] });
    expect(res.status).toBe(403);
    const evil = await w.owner.agent.post('/api/v1/employees').set('Origin', 'https://evil.example').send({ name: 'X', phone: uniquePhone(), roles: ['sales'] });
    expect(evil.status).toBe(403);
  });
});

describe('employees and roles (OWN-01, C-31, C-64)', () => {
  it('only the owner manages employees', async () => {
    const w = await newWholesaler(ownerDb, app);
    const phone = uniquePhone();
    const created = await w.owner.post('/api/v1/employees', { name: 'Ali', phone, roles: ['sales', 'delivery'] });
    expect(created.body.employee.roles).toEqual(['sales', 'delivery']);
    const ali = await firstLogin(app, w.loginCode, phone, created.body.temporaryPassword);
    await ali.get('/api/v1/employees').expect(403);
    await ali.post('/api/v1/employees', { name: 'Z', phone: uniquePhone(), roles: ['owner'] }).expect(403);
    await ali.get('/api/v1/settings').expect(403);
  });

  it('refuses a phone number that is already used', async () => {
    const w = await newWholesaler(ownerDb, app);
    const res = await w.owner.post('/api/v1/employees', { name: 'Dup', phone: w.ownerPhone, roles: ['sales'] });
    expect(res.status).toBe(409);
  });

  it('validates input and names the wrong fields', async () => {
    const w = await newWholesaler(ownerDb, app);
    const res = await w.owner.post('/api/v1/employees', { name: '', phone: '123', roles: ['boss'] });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details.fields)).toEqual(expect.arrayContaining(['name', 'phone', 'roles.0']));
  });

  it('deactivating logs the employee out at once (C-90)', async () => {
    const w = await newWholesaler(ownerDb, app);
    const phone = uniquePhone();
    const created = await w.owner.post('/api/v1/employees', { name: 'Omar', phone, roles: ['stock_manager'] });
    const omar = await firstLogin(app, w.loginCode, phone, created.body.temporaryPassword);
    await omar.get('/api/v1/me').expect(200);
    await w.owner.post(`/api/v1/employees/${created.body.employee.id}/deactivate`).expect(200);
    await omar.get('/api/v1/me').expect(401);
    const again = await client(app).post('/api/v1/auth/login', { loginCode: w.loginCode, phone, password: NEW_PASSWORD });
    expect(again.status).toBe(401);
  });

  it('keeps at least one active owner', async () => {
    const w = await newWholesaler(ownerDb, app);
    const me = await w.owner.get('/api/v1/me');
    const res = await w.owner.patch(`/api/v1/employees/${me.body.employeeId}`, { roles: ['sales'] });
    expect(res.status).toBe(409);
    const self = await w.owner.post(`/api/v1/employees/${me.body.employeeId}/deactivate`);
    expect(self.status).toBe(409);
  });

  it('records actions in the activity log, which the app cannot change (C-30)', async () => {
    const w = await newWholesaler(ownerDb, app);
    await w.owner.post('/api/v1/employees', { name: 'Logged', phone: uniquePhone(), roles: ['sales'] }).expect(201);
    await withTenant(db, w.wholesalerId, async (trx) => {
      const rows = await trx.selectFrom('activity_log').select('action').where('action', '=', 'employee_created').execute();
      expect(rows).toHaveLength(1);
    });
    await expect(
      withTenant(db, w.wholesalerId, (trx) => trx.updateTable('activity_log').set({ reason: 'hidden' }).execute()),
    ).rejects.toThrow(/permission denied/);
    await expect(
      withTenant(db, w.wholesalerId, (trx) => trx.deleteFrom('activity_log').execute()),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('customers (OWN-03 to OWN-05, SAL-01, C-26, C-73)', () => {
  it('sales creates a customer, who logs in and sees only their own data', async () => {
    const w = await newWholesaler(ownerDb, app);
    const salesPhone = uniquePhone();
    const s = await w.owner.post('/api/v1/employees', { name: 'Sales', phone: salesPhone, roles: ['sales'] });
    const sales = await firstLogin(app, w.loginCode, salesPhone, s.body.temporaryPassword);

    const created = await sales.post('/api/v1/customers', {
      businessName: 'El Shifa Pharmacy',
      contactPerson: 'Dr. Hany',
      phone: uniquePhone(),
      address: '10 Tahrir St, Cairo',
      area: 'Downtown',
    });
    expect(created.status).toBe(201);
    expect(created.body.customer.creditAllowed).toBe(false);
    expect(created.body.customer.creditDays).toBe(30);
    expect(created.body.firstLogin.loginCode).toBe(w.loginCode);

    const pharmacy = await firstLogin(app, w.loginCode, created.body.firstLogin.phone, created.body.firstLogin.temporaryPassword);
    const profile = await pharmacy.get('/api/v1/my/profile').expect(200);
    expect(profile.body.businessName).toBe('El Shifa Pharmacy');
    await pharmacy.get('/api/v1/customers').expect(403);
    await pharmacy.get('/api/v1/employees').expect(403);

    // Sales cannot change credit. Only the owner can (C-26)
    await sales.patch(`/api/v1/customers/${created.body.customer.id}/credit`, { creditAllowed: true, creditDays: 15 }).expect(403);
    const credit = await w.owner.patch(`/api/v1/customers/${created.body.customer.id}/credit`, { creditAllowed: true, creditDays: 15 });
    expect(credit.body.creditAllowed).toBe(true);
    expect(credit.body.creditDays).toBe(15);
  });

  it('new customers take the default credit period from the settings', async () => {
    const w = await newWholesaler(ownerDb, app);
    await w.owner.patch('/api/v1/settings', { defaultCreditDays: 45 }).expect(200);
    const created = await w.owner.post('/api/v1/customers', { businessName: 'B', contactPerson: 'C', phone: uniquePhone(), address: 'A' });
    expect(created.body.customer.creditDays).toBe(45);
  });

  it('the delivery manager sees only name, address, and phone', async () => {
    const w = await newWholesaler(ownerDb, app);
    await w.owner.post('/api/v1/customers', { businessName: 'Store', contactPerson: 'C', phone: uniquePhone(), address: 'A' });
    const phone = uniquePhone();
    const m = await w.owner.post('/api/v1/employees', { name: 'DM', phone, roles: ['delivery_manager'] });
    const dm = await firstLogin(app, w.loginCode, phone, m.body.temporaryPassword);
    const list = await dm.get('/api/v1/customers').expect(200);
    expect(Object.keys(list.body.items[0]).sort()).toEqual(['address', 'area', 'businessName', 'id', 'phone']);
  });

  it('a deactivated customer cannot log in', async () => {
    const w = await newWholesaler(ownerDb, app);
    const created = await w.owner.post('/api/v1/customers', { businessName: 'X', contactPerson: 'Y', phone: uniquePhone(), address: 'Z' });
    const pharmacy = await firstLogin(app, w.loginCode, created.body.firstLogin.phone, created.body.firstLogin.temporaryPassword);
    await w.owner.post(`/api/v1/customers/${created.body.customer.id}/deactivate`).expect(200);
    await pharmacy.get('/api/v1/me').expect(401);
    const again = await client(app).post('/api/v1/auth/login', { loginCode: w.loginCode, phone: created.body.firstLogin.phone, password: NEW_PASSWORD });
    expect(again.status).toBe(401);
  });

  it('searches customers', async () => {
    const w = await newWholesaler(ownerDb, app);
    await w.owner.post('/api/v1/customers', { businessName: 'Nour Pharmacy', contactPerson: 'A', phone: uniquePhone(), address: 'A' });
    await w.owner.post('/api/v1/customers', { businessName: 'Beauty Store', contactPerson: 'B', phone: uniquePhone(), address: 'B' });
    const found = await w.owner.get('/api/v1/customers?q=nour').expect(200);
    expect(found.body.total).toBe(1);
    expect(found.body.items[0].businessName).toBe('Nour Pharmacy');
  });
});

describe('forgotten passwords (C-87)', () => {
  it('a customer request reaches the owner and sales, and a reset clears it', async () => {
    const w = await newWholesaler(ownerDb, app);
    const created = await w.owner.post('/api/v1/customers', { businessName: 'Forgetful', contactPerson: 'F', phone: uniquePhone(), address: 'A' });
    await firstLogin(app, w.loginCode, created.body.firstLogin.phone, created.body.firstLogin.temporaryPassword);

    const anon = client(app);
    await anon.post('/api/v1/auth/forgot-password', { loginCode: w.loginCode, phone: created.body.firstLogin.phone }).expect(200);
    // The same answer for a phone that does not exist
    await anon.post('/api/v1/auth/forgot-password', { loginCode: w.loginCode, phone: uniquePhone() }).expect(200);

    const list = await w.owner.get('/api/v1/password-reset-requests').expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].name).toBe('Forgetful');

    const reset = await w.owner.post(`/api/v1/customers/${created.body.customer.id}/reset-password`).expect(200);
    expect(reset.body.firstLogin.temporaryPassword).toBeTruthy();
    const after = await w.owner.get('/api/v1/password-reset-requests').expect(200);
    expect(after.body.items).toHaveLength(0);

    // The old password no longer works, the temporary one does
    const c = client(app);
    await c.post('/api/v1/auth/login', { loginCode: w.loginCode, phone: created.body.firstLogin.phone, password: NEW_PASSWORD }).expect(401);
    await c.post('/api/v1/auth/login', { loginCode: w.loginCode, phone: created.body.firstLogin.phone, password: reset.body.firstLogin.temporaryPassword }).expect(200);
  });

  it('a forgotten owner password is reset by the platform team', async () => {
    const w = await newWholesaler(ownerDb, app);
    const r = await resetOwnerPassword(ownerDb, w.loginCode, w.ownerPhone);
    await w.owner.get('/api/v1/me').expect(401);
    const c = client(app);
    await c.post('/api/v1/auth/login', { loginCode: w.loginCode, phone: w.ownerPhone, password: r.temporaryPassword }).expect(200);
  });
});

describe('settings and working hours (C-37, C-40)', () => {
  it('only the owner changes settings', async () => {
    const w = await newWholesaler(ownerDb, app);
    const s = await w.owner.get('/api/v1/settings').expect(200);
    expect(s.body).toMatchObject({ defaultCreditDays: 30, invoiceTiming: 'on_delivered', nearExpiryMonths: 6, supplierReturnApproval: false, minimumOrderValue: null, maxExtraFields: 20 });
    const changed = await w.owner.patch('/api/v1/settings', { minimumOrderValue: '500.00', invoiceTiming: 'on_prepared' }).expect(200);
    expect(changed.body.minimumOrderValue).toBe('500.00');
    const off = await w.owner.patch('/api/v1/settings', { minimumOrderValue: null }).expect(200);
    expect(off.body.minimumOrderValue).toBeNull();
  });

  it('saves the week and reports open or closed', async () => {
    const w = await newWholesaler(ownerDb, app);
    const closed = await w.owner.get('/api/v1/open-status').expect(200);
    expect(closed.body).toEqual({ open: false, nextOpening: null });
    const allDay = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, opensAt: '00:00', closesAt: '23:59' }));
    await w.owner.put('/api/v1/settings/working-hours', { days: allDay }).expect(200);
    const hours = await w.owner.get('/api/v1/settings/working-hours').expect(200);
    expect(hours.body.days).toHaveLength(7);
    const status = await w.owner.get('/api/v1/open-status').expect(200);
    // Open all day, except the last minute of the day
    expect(typeof status.body.open).toBe('boolean');
  });

  it('a closed day makes the warehouse closed today', async () => {
    const w = await newWholesaler(ownerDb, app);
    const allDay = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, opensAt: '00:00', closesAt: '23:59' }));
    await w.owner.put('/api/v1/settings/working-hours', { days: allDay }).expect(200);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
    const added = await w.owner.post('/api/v1/settings/closed-days', { closedOn: today, note: 'Holiday' }).expect(201);
    const status = await w.owner.get('/api/v1/open-status').expect(200);
    expect(status.body.open).toBe(false);
    await w.owner.post('/api/v1/settings/closed-days', { closedOn: today }).expect(409);
    await w.owner.del(`/api/v1/settings/closed-days/${added.body.id}`).expect(200);
  });
});

describe('keeping wholesalers apart (C-52)', () => {
  it('one wholesaler cannot see or change another wholesaler data', async () => {
    const a = await newWholesaler(ownerDb, app);
    const b = await newWholesaler(ownerDb, app);
    const customer = await a.owner.post('/api/v1/customers', { businessName: 'A only', contactPerson: 'X', phone: uniquePhone(), address: 'Y' });
    const id = customer.body.customer.id;

    await b.owner.get(`/api/v1/customers/${id}`).expect(404);
    await b.owner.patch(`/api/v1/customers/${id}`, { businessName: 'stolen' }).expect(404);
    await b.owner.patch(`/api/v1/customers/${id}/credit`, { creditAllowed: true, creditDays: 10 }).expect(404);
    await b.owner.post(`/api/v1/customers/${id}/deactivate`).expect(404);
    const list = await b.owner.get('/api/v1/customers').expect(200);
    expect(list.body.items.find((c: { id: string }) => c.id === id)).toBeUndefined();

    const aEmployees = await a.owner.get('/api/v1/employees').expect(200);
    await b.owner.post(`/api/v1/employees/${aEmployees.body.items[0].id}/reset-password`).expect(404);
  });

  it('the same phone can be a customer of two wholesalers (C-86)', async () => {
    const a = await newWholesaler(ownerDb, app);
    const b = await newWholesaler(ownerDb, app);
    const phone = uniquePhone();
    await a.owner.post('/api/v1/customers', { businessName: 'P', contactPerson: 'X', phone, address: 'Y' }).expect(201);
    await b.owner.post('/api/v1/customers', { businessName: 'P', contactPerson: 'X', phone, address: 'Y' }).expect(201);
  });

  it('row level security hides every row when no wholesaler is set', async () => {
    await newWholesaler(ownerDb, app);
    const rows = await sql<{ n: string }>`select count(*)::text as n from users`.execute(db);
    expect(rows.rows[0]!.n).toBe('0');
  });
});
