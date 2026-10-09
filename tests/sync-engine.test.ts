/**
 * Sync engine suite — the four cases a sync layer has to get right.
 *
 * `tests/merge.test.ts` pins the merge rule in isolation. This file drives the
 * **real** `runSync` instead: a throwaway SQLite database (through `node:sqlite`,
 * exactly like the schema suite) and a fake Supabase that records what the
 * engine sent it. That is the only way to test the parts that are not pure — the
 * order pull and push happen in, what a push actually contains, how the outbox
 * is drained, and whether a merge leaves a note behind when it discards a local
 * write.
 *
 * It used to be a `scripts/verify-sync.ts` runner; the verify scripts moved to
 * Vitest with the rest of the suite, so `npm run verify` covers it.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { type SyncHarness } from './support/syncHarness';

const OWNER = '11111111-1111-4111-8111-111111111111';
const T1 = '2026-10-04T10:00:00.000Z';
const T2 = '2026-10-04T11:00:00.000Z';
const T3 = '2026-10-04T12:00:00.000Z';

const harnessRef = { current: null as SyncHarness | null };

vi.mock('@/db/client', async () => {
  const { harness } = await import('./support/syncHarness');
  harnessRef.current = harness;
  return { getDatabase: async () => harness.adapter };
});

vi.mock('@/services/supabase/client', async () => {
  const { fakeSupabase } = await import('./support/syncHarness');
  return {
    getSupabase: () => fakeSupabase(),
    getCurrentUserId: async () => '11111111-1111-4111-8111-111111111111',
    isSupabaseConfigured: true,
  };
});

const { runSync, pendingChangeCount, enqueueOperation } = await import('@/services/sync/engine');
const { harness } = await import('./support/syncHarness');

afterAll(() => {
  harness.drop();
});

function seedTask(overrides: Record<string, unknown> = {}): void {
  const row: Record<string, unknown> = {
    id: 'task_1',
    project_id: null,
    parent_id: null,
    title: 'Write the report',
    notes: 'first draft',
    status: 'todo',
    priority: 'medium',
    due_at: null,
    remind_at: null,
    recurrence: null,
    location_reminder: null,
    estimate_minutes: null,
    attachments: '[]',
    position: 1,
    completed_at: null,
    created_at: T1,
    updated_at: T1,
    deleted_at: null,
    field_meta: '{}',
    sync_state: 'synced',
    ...overrides,
  };
  const columns = Object.keys(row);
  harness.db
    .prepare(
      `INSERT OR REPLACE INTO tasks (${columns.join(', ')})
       VALUES (${columns.map(() => '?').join(', ')})`,
    )
    .run(...columns.map((column) => row[column] as never));
}

function seedRemoteTask(overrides: Record<string, unknown> = {}): void {
  const bucket = harness.remote.get('tasks') ?? new Map<string, Record<string, unknown>>();
  bucket.set('task_1', {
    id: 'task_1',
    owner_id: OWNER,
    title: 'Write the report',
    notes: 'first draft',
    status: 'todo',
    priority: 'medium',
    updated_at: T1,
    deleted_at: null,
    field_meta: {},
    ...overrides,
  });
  harness.remote.set('tasks', bucket);
}

function localTask(): Record<string, unknown> {
  return harness.db.prepare('SELECT * FROM tasks WHERE id = ?').get('task_1') as Record<
    string,
    unknown
  >;
}

function activity(): Record<string, unknown>[] {
  return harness.db
    .prepare('SELECT * FROM activity_logs ORDER BY created_at ASC')
    .all() as Record<string, unknown>[];
}

/** The first row the engine sent up for `tasks`, i.e. what a push contained. */
function pushedTask(): Record<string, unknown> | undefined {
  const upsert = harness.calls.find((call) => call.table === 'tasks' && call.op === 'upsert');
  return upsert?.rows?.[0];
}

beforeEach(() => {
  harness.reset();
});

describe('sync engine — non-overlapping edits', () => {
  it('keeps the other device’s field and ours, and pushes the merged row', async () => {
    seedTask({
      notes: 'my notes',
      updated_at: T3,
      field_meta: JSON.stringify({ notes: T3 }),
      sync_state: 'pending',
    });
    seedRemoteTask({ title: 'Their title', updated_at: T2, field_meta: { title: T2 } });

    const summary = await runSync();

    expect(summary.errors).toEqual([]);
    const merged = localTask();
    expect(merged.title).toBe('Their title');
    expect(merged.notes).toBe('my notes');
    expect(merged.sync_state).toBe('synced');
    // Pull ran first, so what went up already contained their title: a push
    // that had gone first would have overwritten it with our stale copy.
    expect(pushedTask()?.title).toBe('Their title');
    expect(await pendingChangeCount()).toBe(0);
  });
});

describe('sync engine — same-field conflicts', () => {
  it('keeps the newest value and records the exchange in the activity log', async () => {
    seedTask({
      title: 'My title',
      updated_at: T1,
      field_meta: JSON.stringify({ title: T1 }),
      sync_state: 'pending',
    });
    seedRemoteTask({ title: 'Their title', updated_at: T3, field_meta: { title: T3 } });

    await runSync();

    expect(localTask().title).toBe('Their title');
    const entries = activity();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.action).toBe('conflict_resolved');
    expect(entries[0]?.entity_id).toBe('task_1');
    expect(entries[0]?.summary).toBe(
      'Conflicting edit merged: kept the newer title from another device.',
    );
  });

  it('says nothing when the local edit was already shared', async () => {
    seedTask({
      title: 'My old title',
      updated_at: T1,
      field_meta: JSON.stringify({ title: T1 }),
      sync_state: 'synced',
    });
    seedRemoteTask({ title: 'Their title', updated_at: T3, field_meta: { title: T3 } });

    await runSync();

    expect(localTask().title).toBe('Their title');
    expect(activity()).toEqual([]);
  });
});

describe('sync engine — offline queue', () => {
  it('replays queued operations in the order they were made', async () => {
    await enqueueOperation('task', 'task_1', 'set_task_tags', { tagIds: ['tag_first'] });
    await enqueueOperation('task', 'task_1', 'set_task_tags', { tagIds: ['tag_second'] });

    const summary = await runSync();

    expect(summary.pushed).toBe(2);
    const tagCalls = harness.calls.filter((call) => call.table === 'task_tags');
    // delete → (eq) → insert, twice, in creation order, so the last write to
    // the backend is the one the user made last.
    expect(tagCalls.map((call) => call.op)).toEqual([
      'delete',
      'cleanup',
      'insert',
      'delete',
      'cleanup',
      'insert',
    ]);
    expect(tagCalls[2]?.rows?.[0]?.tag_id).toBe('tag_first');
    expect(tagCalls[5]?.rows?.[0]?.tag_id).toBe('tag_second');
    expect([...harness.taskTags.get('task_1') ?? []]).toEqual(['tag_second']);
    expect(await pendingChangeCount()).toBe(0);
  });
});

describe('sync engine — deletes against edits', () => {
  it('applies a remote tombstone instead of resurrecting the task, and reports the lost rename', async () => {
    seedTask({
      title: 'Renamed offline',
      updated_at: T1,
      field_meta: JSON.stringify({ title: T1 }),
      sync_state: 'pending',
    });
    seedRemoteTask({ deleted_at: T2, updated_at: T2, field_meta: { deleted_at: T2 } });

    await runSync();

    const merged = localTask();
    expect(merged.deleted_at).toBe(T2);
    expect(merged.title).toBe('Write the report');
    expect(String(activity()[0]?.summary)).toContain('title');
  });

  it('pushes the tombstone itself, never a resurrecting copy of the row', async () => {
    seedTask({ sync_state: 'pending', updated_at: T3 });
    seedRemoteTask({ deleted_at: T2, updated_at: T2, field_meta: { deleted_at: T2 } });

    await runSync();

    // The row still owed the server a local write, so it goes up — carrying the
    // delete it just took on, not a stale "deleted_at: null" that would have
    // brought the task back on every other device.
    expect(localTask().deleted_at).toBe(T2);
    expect(localTask().sync_state).toBe('synced');
    expect(pushedTask()?.deleted_at).toBe(T2);
  });
});
