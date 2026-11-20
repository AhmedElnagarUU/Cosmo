import { localMoment, workingMinutesBetween } from '@cosmo/shared';
import { withTenant, type Db } from '../core/db';
import { logActivity } from '../core/activity';
import { notify, usersWithRoles } from '../core/notifications';

// C-35, C-39: an order waiting more than 5 working hours for acceptance, or for the customer's answer,
// is reported to the owner once. It is never cancelled automatically.
export const WAITING_LIMIT_MINUTES = 5 * 60;

export async function reportWaitingOrders(db: Db, now = new Date()): Promise<number> {
  const wholesalers = await db.selectFrom('wholesalers').select(['id', 'time_zone']).where('is_active', '=', true).execute();
  let reported = 0;
  for (const w of wholesalers) {
    reported += await withTenant(db, w.id, async (trx) => {
      const orders = await trx
        .selectFrom('orders as o')
        .innerJoin('customers as c', 'c.id', 'o.customer_id')
        .select(['o.id', 'o.order_number', 'o.status', 'o.waiting_since', 'c.business_name'])
        .where('o.status', 'in', ['placed', 'waiting_for_customer'])
        .where('o.reported_to_owner', '=', false)
        .where('o.waiting_since', 'is not', null)
        .execute();
      if (!orders.length) return 0;
      const days = (await trx.selectFrom('working_hours').select(['day_of_week', 'opens_at', 'closes_at']).execute()).map((d) => ({
        dayOfWeek: d.day_of_week,
        opensAt: d.opens_at.slice(0, 5),
        closesAt: d.closes_at.slice(0, 5),
      }));
      const closed = new Set((await trx.selectFrom('closed_days').select('closed_on').execute()).map((c) => c.closed_on));
      const owners = await usersWithRoles(trx, ['owner']);
      let n = 0;
      for (const o of orders) {
        const minutes = workingMinutesBetween(localMoment(new Date(o.waiting_since!), w.time_zone), localMoment(now, w.time_zone), days, closed);
        if (minutes < WAITING_LIMIT_MINUTES) continue;
        const forCustomer = o.status === 'waiting_for_customer';
        await trx.updateTable('orders').set({ reported_to_owner: true }).where('id', '=', o.id).execute();
        await logActivity(trx, { userId: null, wholesalerId: w.id }, {
          action: forCustomer ? 'order_waiting_customer_long' : 'order_waiting_acceptance_long',
          entityType: 'order',
          entityId: o.id,
          details: { number: o.order_number, workingMinutes: minutes },
          important: true,
        });
        await notify(trx, w.id, owners, {
          type: 'order_waiting_long',
          title: forCustomer
            ? { en: `${o.business_name} has not answered order ${o.order_number} for 5 working hours`, ar: `${o.business_name} لم يرد على الطلب ${o.order_number} منذ ٥ ساعات عمل` }
            : { en: `Order ${o.order_number} has waited 5 working hours for acceptance`, ar: `الطلب ${o.order_number} ينتظر القبول منذ ٥ ساعات عمل` },
          entityType: 'order',
          entityId: o.id,
        });
        n++;
      }
      return n;
    });
  }
  return reported;
}

export function scheduleWaitingOrdersJob(db: Db): NodeJS.Timeout {
  const run = () =>
    reportWaitingOrders(db).catch((e) => {
      console.error('Waiting orders job failed', e);
    });
  return setInterval(run, 5 * 60 * 1000);
}
