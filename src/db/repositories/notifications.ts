import type {
  NotificationKind,
  NotificationStatus,
  Recurrence,
  ScheduledNotification,
} from '@/domain/types';
import { createId, nowIso } from '@/utils/id';

import { getDatabase } from '../client';
import { parseJson, toScheduledNotification } from '../mappers';

export async function recordNotification(input: {
  osIdentifier?: string | null;
  taskId?: string | null;
  habitId?: string | null;
  kind: NotificationKind;
  title: string;
  body: string;
  triggerAt: string | null;
  recurrence?: Recurrence | null;
  status?: NotificationStatus;
}): Promise<ScheduledNotification> {
  const db = await getDatabase();
  const record: ScheduledNotification = {
    id: createId('ntf_'),
    osIdentifier: input.osIdentifier ?? null,
    taskId: input.taskId ?? null,
    habitId: input.habitId ?? null,
    kind: input.kind,
    title: input.title,
    body: input.body,
    triggerAt: input.triggerAt,
    recurrence: input.recurrence ?? null,
    status: input.status ?? 'scheduled',
    createdAt: nowIso(),
  };

  await db.runAsync(
    `INSERT INTO notification_records (id, os_identifier, task_id, habit_id, kind, title, body,
       trigger_at, recurrence, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.osIdentifier,
      record.taskId,
      record.habitId,
      record.kind,
      record.title,
      record.body,
      record.triggerAt,
      record.recurrence ? JSON.stringify(record.recurrence) : null,
      record.status,
      record.createdAt,
    ],
  );

  return record;
}

export async function listNotificationsForTask(taskId: string): Promise<ScheduledNotification[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Parameters<typeof toScheduledNotification>[0]>(
    'SELECT * FROM notification_records WHERE task_id = ? ORDER BY trigger_at ASC',
    [taskId],
  );
  return rows.map(toScheduledNotification);
}

export async function listScheduledNotifications(): Promise<ScheduledNotification[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Parameters<typeof toScheduledNotification>[0]>(
    "SELECT * FROM notification_records WHERE status = 'scheduled' ORDER BY trigger_at ASC",
  );
  return rows.map(toScheduledNotification);
}

export async function updateNotificationStatus(
  id: string,
  status: NotificationStatus,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE notification_records SET status = ? WHERE id = ?', [status, id]);
}

export async function cancelNotificationsForTask(taskId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE notification_records SET status = 'cancelled' WHERE task_id = ? AND status = 'scheduled'",
    [taskId],
  );
}

/** Mirror of {@link cancelNotificationsForTask} for habit nudges. */
export async function cancelNotificationsForHabit(habitId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE notification_records SET status = 'cancelled' WHERE habit_id = ? AND status = 'scheduled'",
    [habitId],
  );
}

export async function markDeliveredByOsIdentifier(osIdentifier: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE notification_records SET status = 'delivered' WHERE os_identifier = ?",
    [osIdentifier],
  );
}

export async function pruneOldNotifications(olderThanIso: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "DELETE FROM notification_records WHERE status != 'scheduled' AND created_at < ?",
    [olderThanIso],
  );
}

export function notificationRecurrence(
  record: Pick<ScheduledNotification, 'recurrence'>,
): Recurrence | null {
  return parseJson<Recurrence | null>(
    record.recurrence ? JSON.stringify(record.recurrence) : null,
    null,
  );
}
