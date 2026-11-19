import { localMoment, openStatus, type OpenStatus } from '@cosmo/shared';
import type { Trx } from '../../core/db';

// Open or closed now, from the working hours and closed days (C-37)
export async function currentOpenStatus(trx: Trx, wholesalerId: string, at = new Date()): Promise<OpenStatus> {
  const w = await trx.selectFrom('wholesalers').select('time_zone').where('id', '=', wholesalerId).executeTakeFirstOrThrow();
  const now = localMoment(at, w.time_zone);
  const days = await trx.selectFrom('working_hours').select(['day_of_week', 'opens_at', 'closes_at']).execute();
  const closed = await trx
    .selectFrom('closed_days')
    .select('closed_on')
    .where('closed_on', '>=', now.date)
    .execute();
  return openStatus(
    now,
    days.map((d) => ({ dayOfWeek: d.day_of_week, opensAt: d.opens_at.slice(0, 5), closesAt: d.closes_at.slice(0, 5) })),
    new Set(closed.map((c) => c.closed_on)),
  );
}
