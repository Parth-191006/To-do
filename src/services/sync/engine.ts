import { getDatabase } from '@/db/client';
import type { EntityKind } from '@/domain/types';
import { createId, nowIso } from '@/utils/id';

import { getCurrentUserId, getSupabase, isSupabaseConfigured } from '../supabase/client';
import { mergeFieldMeta, mergeRow, parseFieldMeta } from './merge';

/**
 * Offline-first sync engine.
 *
 * Strategy
 * --------
 * - SQLite is authoritative on device. Every mutation marks its row
 *   `sync_state = 'pending'` (and `deleted_at` for soft deletes), so a push is
 *   just "select the pending rows and upsert them".
 * - The Supabase schema mirrors the SQLite columns exactly (snake_case), so no
 *   field mapping layer is required on either direction.
 * - `task_tags` has no `updated_at`, so tag assignment is captured in
 *   `sync_outbox` as an explicit operation.
 * - Pulls are deltas by `updated_at` and merged **field by field** using the
 *   per-field write stamps in `tasks.field_meta` (see `./merge`). Two people
 *   editing different fields of the same task therefore keep both edits; the
 *   older whole-row rule is gone. Rows written before the stamps existed fall
 *   back to `updated_at` per field, which is exactly the old behaviour.
 *
 * With no Supabase credentials, every entry point is a cheap no-op.
 */

interface SyncTable {
  kind: EntityKind;
  table: string;
}

const SYNC_TABLES: SyncTable[] = [
  { kind: 'project', table: 'projects' },
  { kind: 'tag', table: 'tags' },
  { kind: 'task', table: 'tasks' },
  { kind: 'habit', table: 'habits' },
  { kind: 'habit_log', table: 'habit_logs' },
  { kind: 'focus_session', table: 'focus_sessions' },
];

const LAST_PULL_KEY = 'sync.last_pull_at';

export interface SyncSummary {
  pushed: number;
  pulled: number;
  skipped: boolean;
  reason?: string;
  errors: string[];
}

export async function getLastPulledAt(): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM sync_meta WHERE key = ?',
    [LAST_PULL_KEY],
  );
  return row?.value ?? null;
}

async function setLastPulledAt(value: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [LAST_PULL_KEY, value],
  );
}

/** Records a non-row operation (e.g. a tag assignment) for the next push. */
export async function enqueueOperation(
  entityKind: EntityKind,
  entityId: string,
  op: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO sync_outbox (id, entity_kind, entity_id, op, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [createId('out_'), entityKind, entityId, op, JSON.stringify(payload), nowIso()],
  );
}

async function pushPendingRows(): Promise<{ pushed: number; errors: string[] }> {
  const supabase = getSupabase();
  const db = await getDatabase();
  if (!supabase) return { pushed: 0, errors: [] };

  let pushed = 0;
  const errors: string[] = [];

  for (const { table } of SYNC_TABLES) {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM ${table} WHERE sync_state = 'pending'`,
    );
    if (rows.length === 0) continue;

    const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
    if (error) {
      errors.push(`${table}: ${error.message}`);
      continue;
    }

    const ids = rows.map((row) => row.id as string);
    await db.runAsync(
      `UPDATE ${table} SET sync_state = 'synced' WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids,
    );
    pushed += rows.length;
  }

  return { pushed, errors };
}

async function drainOutbox(): Promise<{ drained: number; errors: string[] }> {
  const supabase = getSupabase();
  const db = await getDatabase();
  if (!supabase) return { drained: 0, errors: [] };

  const entries = await db.getAllAsync<{
    id: string;
    entity_kind: string;
    entity_id: string;
    op: string;
    payload: string;
    attempts: number;
  }>('SELECT * FROM sync_outbox ORDER BY created_at ASC LIMIT 200');

  let drained = 0;
  const errors: string[] = [];

  for (const entry of entries) {
    const payload = JSON.parse(entry.payload) as Record<string, unknown>;

    if (entry.op === 'set_task_tags') {
      const tagIds = (payload.tagIds as string[]) ?? [];
      const deleteResult = await supabase.from('task_tags').delete().eq('task_id', entry.entity_id);
      if (deleteResult.error) {
        errors.push(`task_tags delete: ${deleteResult.error.message}`);
        await db.runAsync(
          'UPDATE sync_outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?',
          [deleteResult.error.message, entry.id],
        );
        continue;
      }
      if (tagIds.length > 0) {
        const insertResult = await supabase
          .from('task_tags')
          .insert(tagIds.map((tagId) => ({ task_id: entry.entity_id, tag_id: tagId })));
        if (insertResult.error) {
          errors.push(`task_tags insert: ${insertResult.error.message}`);
          await db.runAsync(
            'UPDATE sync_outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?',
            [insertResult.error.message, entry.id],
          );
          continue;
        }
      }
    }

    await db.runAsync('DELETE FROM sync_outbox WHERE id = ?', [entry.id]);
    drained += 1;
  }

  return { drained, errors };
}

async function pullDeltas(): Promise<{ pulled: number; errors: string[] }> {
  const supabase = getSupabase();
  const db = await getDatabase();
  if (!supabase) return { pulled: 0, errors: [] };

  const since = (await getLastPulledAt()) ?? '1970-01-01T00:00:00.000Z';
  let pulled = 0;
  const errors: string[] = [];
  let highWater = since;

  for (const { table } of SYNC_TABLES) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .gt('updated_at', since)
      .order('updated_at', { ascending: true })
      .limit(500);

    if (error) {
      errors.push(`${table}: ${error.message}`);
      continue;
    }
    if (!data || data.length === 0) continue;

    for (const remote of data as Record<string, unknown>[]) {
      const id = remote.id as string;
      const remoteUpdatedAt = remote.updated_at as string;
      const local = await db.getFirstAsync<Record<string, unknown> & { field_meta?: string }>(
        `SELECT * FROM ${table} WHERE id = ?`,
        [id],
      );

      if (!local) {
        // Never seen here: insert the remote row as-is.
        const columns = Object.keys(remote).filter((column) => column !== 'field_meta');
        const values = columns.map((column) => toSqliteValue(remote[column]));
        await db.runAsync(
          `INSERT OR REPLACE INTO ${table} (${columns.join(', ')})
           VALUES (${columns.map(() => '?').join(', ')})`,
          values,
        );
        pulled += 1;
        if (remoteUpdatedAt > highWater) highWater = remoteUpdatedAt;
        continue;
      }

      if (table !== 'tasks') {
        // Other tables have no per-field stamps; row-level last-write-wins is
        // still the right rule for them (a document either exists or it does
        // not), with the local pending copy protected as before.
        if (local.sync_state === 'pending' && (local.updated_at as string) > remoteUpdatedAt) {
          continue;
        }
        const columns = Object.keys(remote).filter((column) => column !== 'field_meta');
        const values = columns.map((column) => toSqliteValue(remote[column]));
        await db.runAsync(
          `INSERT OR REPLACE INTO ${table} (${columns.join(', ')})
           VALUES (${columns.map(() => '?').join(', ')})`,
          values,
        );
        pulled += 1;
        if (remoteUpdatedAt > highWater) highWater = remoteUpdatedAt;
        continue;
      }

      // Tasks: field-level merge so concurrent edits to different fields both
      // survive. `tookRemote` is empty when this device simply wins.
      const localMeta = parseFieldMeta(local.field_meta);
      const remoteMeta = parseFieldMeta(remote.field_meta);
      const result = mergeRow({
        local,
        remote,
        localMeta,
        remoteMeta,
        localUpdatedAt: (local.updated_at as string) ?? remoteUpdatedAt,
        remoteUpdatedAt,
      });

      if (result.tookRemote.length === 0) {
        // Nothing changed locally — record the new high-water mark and move on
        // rather than rewriting an identical row.
        if (remoteUpdatedAt > highWater) highWater = remoteUpdatedAt;
        continue;
      }

      const mergedMeta = mergeFieldMeta(localMeta, remoteMeta);
      const assignments = result.tookRemote.map((field) => `${field} = ?`);
      const values = result.tookRemote.map((field) => toSqliteValue(result.merged[field]));
      await db.runAsync(
        `UPDATE tasks SET ${assignments.join(', ')}, field_meta = ?, sync_state = 'synced'
         WHERE id = ?`,
        [...values, JSON.stringify(mergedMeta), id],
      );
      pulled += 1;
      if (remoteUpdatedAt > highWater) highWater = remoteUpdatedAt;
    }
  }

  if (highWater !== since) await setLastPulledAt(highWater);
  return { pulled, errors };
}

/** SQLite only stores strings, numbers and nulls — flatten everything else. */
function toSqliteValue(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'object') return JSON.stringify(value);
  return value as string | number;
}

/** Removes outbox rows that have failed too many times so they stop blocking. */
async function prunePoisonedOutbox(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM sync_outbox WHERE attempts >= 8');
}

export async function runSync(): Promise<SyncSummary> {
  if (!isSupabaseConfigured) {
    return { pushed: 0, pulled: 0, skipped: true, reason: 'Supabase not configured', errors: [] };
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return { pushed: 0, pulled: 0, skipped: true, reason: 'Not signed in', errors: [] };
  }

  const errors: string[] = [];
  try {
    await prunePoisonedOutbox();
    const push = await pushPendingRows();
    const outbox = await drainOutbox();
    const pull = await pullDeltas();
    errors.push(...push.errors, ...outbox.errors, ...pull.errors);

    return {
      pushed: push.pushed + outbox.drained,
      pulled: pull.pulled,
      skipped: false,
      errors,
    };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Unknown sync error');
    return { pushed: 0, pulled: 0, skipped: false, errors };
  }
}

/** Number of local changes waiting to go up. Drives the "unsynced" badge. */
export async function pendingChangeCount(): Promise<number> {
  const db = await getDatabase();
  let total = 0;
  for (const { table } of SYNC_TABLES) {
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${table} WHERE sync_state = 'pending'`,
    );
    total += row?.count ?? 0;
  }
  const outbox = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM sync_outbox',
  );
  return total + (outbox?.count ?? 0);
}
