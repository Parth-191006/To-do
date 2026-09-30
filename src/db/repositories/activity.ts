import type { ActivityLog, EntityKind } from '@/domain/types';
import { createId, nowIso } from '@/utils/id';

import { getDatabase } from '../client';

const LOCAL_ACTOR = 'local-user';

export async function logActivity(input: {
  entityKind: EntityKind;
  entityId: string;
  action: string;
  summary: string;
  actorId?: string;
}): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO activity_logs (id, entity_kind, entity_id, actor_id, action, summary, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      createId('act_'),
      input.entityKind,
      input.entityId,
      input.actorId ?? LOCAL_ACTOR,
      input.action,
      input.summary,
      nowIso(),
    ],
  );
}

export async function listActivity(
  entityKind: EntityKind,
  entityId: string,
  limit = 50,
): Promise<ActivityLog[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    entity_kind: string;
    entity_id: string;
    actor_id: string;
    action: string;
    summary: string;
    created_at: string;
  }>(
    `SELECT * FROM activity_logs WHERE entity_kind = ? AND entity_id = ?
     ORDER BY created_at DESC LIMIT ?`,
    [entityKind, entityId, limit],
  );

  return rows.map((row) => ({
    id: row.id,
    entityKind: row.entity_kind as EntityKind,
    entityId: row.entity_id,
    actorId: row.actor_id,
    action: row.action,
    summary: row.summary,
    createdAt: row.created_at,
  }));
}

export async function listRecentActivity(limit = 30): Promise<ActivityLog[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    entity_kind: string;
    entity_id: string;
    actor_id: string;
    action: string;
    summary: string;
    created_at: string;
  }>('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT ?', [limit]);

  return rows.map((row) => ({
    id: row.id,
    entityKind: row.entity_kind as EntityKind,
    entityId: row.entity_id,
    actorId: row.actor_id,
    action: row.action,
    summary: row.summary,
    createdAt: row.created_at,
  }));
}
