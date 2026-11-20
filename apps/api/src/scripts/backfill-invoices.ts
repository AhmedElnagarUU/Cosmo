import { createDb, withTenant } from '../core/db';
import { createInvoice } from '../modules/billing/billing.service';

// One-time helper for databases that had delivered orders before invoices existed (phase 7).
// Creates the missing invoices. Safe to run more than once.
const db = createDb(process.env.MIGRATION_DATABASE_URL!);
const run = async () => {
  const ws = await db.selectFrom('wholesalers').select('id').execute();
  for (const w of ws) {
    await withTenant(db, w.id, async (trx) => {
      const orders = await trx
        .selectFrom('orders as o')
        .select('o.id')
        .where('o.status', '=', 'delivered')
        .where((eb) => eb.not(eb.exists(eb.selectFrom('invoices as i').select('i.id').whereRef('i.order_id', '=', 'o.id').where('i.status', '<>', 'cancelled'))))
        .execute();
      for (const o of orders) await createInvoice(trx, { userId: null, wholesalerId: w.id }, o.id);
      if (orders.length) console.log(`Created ${orders.length} invoices`);
    });
  }
};
run().finally(() => db.destroy());
