import { withTenant, type Db } from '../core/db';
import { expireBatches } from '../modules/stock/stock.service';

// Background job: expired batches stop counting as available (C-55).
// Runs once at start and then every hour. It is safe to run many times.
export async function runExpiryJob(db: Db): Promise<number> {
  const wholesalers = await db.selectFrom('wholesalers').select('id').where('is_active', '=', true).execute();
  let changed = 0;
  for (const w of wholesalers) {
    changed += await withTenant(db, w.id, (trx) => expireBatches(trx, w.id));
  }
  return changed;
}

export function scheduleExpiryJob(db: Db): NodeJS.Timeout {
  const run = () =>
    runExpiryJob(db).catch((e) => {
      console.error('Expiry job failed', e);
    });
  void run();
  return setInterval(run, 60 * 60 * 1000);
}
