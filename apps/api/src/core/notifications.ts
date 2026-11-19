import type { Trx } from './db';
import type { Text } from './errors';

// Notifications inside the app (C-46). Each one gets a delivery row per channel,
// so SMS or WhatsApp can be added later as new channels without changing this code's callers.
export async function notify(
  trx: Trx,
  wholesalerId: string,
  recipientUserIds: string[],
  message: { type: string; title: Text; body?: Text; entityType?: string; entityId?: string },
): Promise<void> {
  const unique = [...new Set(recipientUserIds)];
  if (unique.length === 0) return;
  const rows = await trx
    .insertInto('notifications')
    .values(
      unique.map((recipient) => ({
        wholesaler_id: wholesalerId,
        recipient_user_id: recipient,
        type: message.type,
        title_ar: message.title.ar,
        title_en: message.title.en,
        body_ar: message.body?.ar ?? '',
        body_en: message.body?.en ?? '',
        entity_type: message.entityType ?? null,
        entity_id: message.entityId ?? null,
      })),
    )
    .returning('id')
    .execute();
  await trx
    .insertInto('notification_deliveries')
    .values(
      rows.map((r) => ({
        wholesaler_id: wholesalerId,
        notification_id: r.id,
        channel: 'in_app' as const,
        status: 'sent' as const,
        sent_at: new Date(),
      })),
    )
    .execute();
}

// User ids of active employees with one of these roles
export async function usersWithRoles(trx: Trx, roles: Array<'owner' | 'sales'>): Promise<string[]> {
  const rows = await trx
    .selectFrom('employee_roles as r')
    .innerJoin('employees as e', 'e.id', 'r.employee_id')
    .innerJoin('users as u', 'u.id', 'e.user_id')
    .where('r.role', 'in', roles)
    .where('u.is_active', '=', true)
    .select('u.id')
    .distinct()
    .execute();
  return rows.map((r) => r.id);
}
