import type { Trx } from './db';

export interface Actor {
  userId: string | null;
  wholesalerId: string;
}

// Writes one row to the activity log (C-30). The app's database user cannot change or delete these rows.
export async function logActivity(
  trx: Trx,
  actor: Actor,
  entry: {
    action: string;
    entityType: string;
    entityId?: string | null;
    reason?: string | null;
    details?: Record<string, unknown>;
    important?: boolean;
  },
): Promise<void> {
  await trx
    .insertInto('activity_log')
    .values({
      wholesaler_id: actor.wholesalerId,
      user_id: actor.userId,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      reason: entry.reason ?? null,
      details: JSON.stringify(entry.details ?? {}),
      is_important: entry.important ?? false,
    })
    .execute();
}
