/**
 * Per-field sync merge suite.
 *
 * The whole point of `@/services/sync/merge` is a scenario the old whole-row
 * last-write-wins could not express: **two people editing different fields of
 * the same task**. Before this, whichever row was newer won outright and quietly
 * erased the other person's work. These tests pin that behaviour down.
 *
 * Pure module — no SQLite, no Supabase — so the suite runs in a plain Node env.
 */
import { describe, expect, it } from 'vitest';

import {
  MERGEABLE_TASK_FIELDS,
  changedFields,
  mergeFieldMeta,
  mergeRow,
  parseFieldMeta,
  sameValue,
  stampFields,
  type FieldMeta,
} from '@/services/sync/merge';

const T1 = '2026-10-04T10:00:00.000Z';
const T2 = '2026-10-04T11:00:00.000Z';
const T3 = '2026-10-04T12:00:00.000Z';

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task_1',
    // Every mergeable field, with the shape a real SQLite row has after
    // `createTask` — a merge must produce all of them, not only the interesting
    // ones.
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
    deleted_at: null,
    // Bookkeeping — never mergeable.
    updated_at: T1,
    sync_state: 'synced',
    ...overrides,
  };
}

describe('parseFieldMeta', () => {
  it('reads a valid JSON map', () => {
    expect(parseFieldMeta('{"title":"2026-10-04T10:00:00.000Z"}')).toEqual({ title: T1 });
  });

  it('reads an object as-is', () => {
    expect(parseFieldMeta({ notes: T1 })).toEqual({ notes: T1 });
  });

  it('treats malformed input as "no stamps" instead of throwing', () => {
    expect(parseFieldMeta('{not json')).toEqual({});
    expect(parseFieldMeta(null)).toEqual({});
    expect(parseFieldMeta(undefined)).toEqual({});
    expect(parseFieldMeta(42)).toEqual({});
    expect(parseFieldMeta('')).toEqual({});
  });

  it('rejects a map whose values are not timestamps', () => {
    expect(parseFieldMeta({ title: 17 })).toEqual({});
    expect(parseFieldMeta('{"title":17}')).toEqual({});
  });
});

describe('stampFields', () => {
  it('stamps only the requested fields', () => {
    const meta = stampFields({ title: T1 }, ['notes', 'status'], T2);
    expect(meta).toEqual({ title: T1, notes: T2, status: T2 });
  });

  it('does not mutate the input map', () => {
    const before: FieldMeta = { title: T1 };
    stampFields(before, ['notes'], T2);
    expect(before).toEqual({ title: T1 });
  });
});

describe('sameValue', () => {
  it('treats null and undefined as the same absence', () => {
    expect(sameValue(null, undefined)).toBe(true);
    expect(sameValue(undefined, null)).toBe(true);
    expect(sameValue(null, '')).toBe(false);
  });

  it('treats SQLite 0/1 and Postgres false/true as equal', () => {
    expect(sameValue(1, true)).toBe(true);
    expect(sameValue(0, false)).toBe(true);
    expect(sameValue(1, false)).toBe(false);
  });

  it('does not confuse a number with its string form', () => {
    expect(sameValue(1, '1')).toBe(true);
    expect(sameValue('1', '1')).toBe(true);
    expect(sameValue('01', '1')).toBe(false);
  });

  it('compares structured values as JSON', () => {
    expect(sameValue({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
    expect(sameValue({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameValue(['x'], ['x'])).toBe(true);
  });
});

describe('changedFields', () => {
  it('lists only the fields that actually changed', () => {
    const before = baseRow();
    const after = baseRow({ title: 'Write the report v2', notes: 'first draft' });
    expect(changedFields(before, after)).toEqual(['title']);
  });

  it('reports nothing when only bookkeeping columns differ', () => {
    const before = baseRow();
    const after = baseRow({ updated_at: T2, sync_state: 'pending' });
    expect(changedFields(before, after)).toEqual([]);
  });

  it('never reports identity columns, even if they differ', () => {
    const before = baseRow();
    const after = baseRow({ id: 'other', created_at: T3 });
    expect(changedFields(before, after)).toEqual([]);
  });

  it('counts a null that became a real value as a change', () => {
    const before = baseRow({ due_at: null });
    const after = baseRow({ due_at: T2 });
    expect(changedFields(before, after)).toEqual(['due_at']);
  });
});

describe('mergeRow', () => {
  it('keeps both edits when two people change different fields', () => {
    // The flow the feature exists for: device A renamed the task, device B
    // pulled that rename (so it carries the same `title` stamp) and then
    // rewrote the notes afterwards. Neither edit may erase the other.
    const local = baseRow({ title: 'Write the report — v2' });
    const remote = baseRow({
      title: 'Write the report — v2',
      notes: 'include the charts',
    });

    const result = mergeRow({
      local,
      remote,
      localMeta: { title: T2 },
      remoteMeta: { title: T2, notes: T3 },
      localUpdatedAt: T2,
      remoteUpdatedAt: T3,
    });

    expect(result.merged.title).toBe('Write the report — v2');
    expect(result.merged.notes).toBe('include the charts');
    expect(result.keptLocal).toContain('title');
    expect(result.tookRemote).toContain('notes');
  });

  it('takes the remote value when the other device rewrote a field we never stamped', () => {
    // A row last written by a client still on schema v2 has no per-field stamps,
    // so its row timestamp is the only evidence of when it was touched. That
    // makes pre-v3 rows degrade to the old whole-row behaviour, which is the
    // documented contract — not a silent regression.
    const local = baseRow({ title: 'Mine' });
    const remote = baseRow({ title: 'Theirs' });

    const result = mergeRow({
      local,
      remote,
      localMeta: { title: T1 },
      remoteMeta: {},
      localUpdatedAt: T1,
      remoteUpdatedAt: T3,
    });

    expect(result.merged.title).toBe('Theirs');
    expect(result.tookRemote).toContain('title');
  });

  it('takes the remote value when it wrote that field last', () => {
    const local = baseRow({ title: 'Mine' });
    const remote = baseRow({ title: 'Theirs' });

    const result = mergeRow({
      local,
      remote,
      localMeta: { title: T1 },
      remoteMeta: { title: T3 },
      localUpdatedAt: T1,
      remoteUpdatedAt: T3,
    });

    expect(result.merged.title).toBe('Theirs');
    expect(result.tookRemote).toEqual(['title']);
  });

  it('keeps the local value when it wrote that field last', () => {
    const local = baseRow({ notes: 'mine' });
    const remote = baseRow({ notes: 'theirs' });

    const result = mergeRow({
      local,
      remote,
      localMeta: { notes: T3 },
      remoteMeta: { notes: T1 },
      localUpdatedAt: T3,
      remoteUpdatedAt: T1,
    });

    expect(result.merged.notes).toBe('mine');
    expect(result.keptLocal).toContain('notes');
    expect(result.tookRemote).not.toContain('notes');
  });

  it('gives a tie to the remote write, which is the newer information', () => {
    const local = baseRow({ priority: 'low' });
    const remote = baseRow({ priority: 'urgent' });

    const result = mergeRow({
      local,
      remote,
      localMeta: { priority: T2 },
      remoteMeta: { priority: T2 },
      localUpdatedAt: T2,
      remoteUpdatedAt: T2,
    });

    expect(result.merged.priority).toBe('urgent');
    expect(result.tookRemote).toEqual(['priority']);
  });

  it('falls back to the row timestamps when neither side stamped the field', () => {
    // Rows written before `field_meta` existed: whole-row behaviour, unchanged.
    const local = baseRow({ title: 'Local' });
    const remote = baseRow({ title: 'Remote' });

    const newer = mergeRow({
      local,
      remote,
      localMeta: {},
      remoteMeta: {},
      localUpdatedAt: T1,
      remoteUpdatedAt: T3,
    });
    expect(newer.merged.title).toBe('Remote');

    const older = mergeRow({
      local,
      remote,
      localMeta: {},
      remoteMeta: {},
      localUpdatedAt: T3,
      remoteUpdatedAt: T1,
    });
    expect(older.merged.title).toBe('Local');
  });

  it('keeps local values for fields the remote row does not carry', () => {
    const local = baseRow({ notes: 'local only' });
    const remote: Record<string, unknown> = { ...baseRow() };
    delete remote.notes;

    const result = mergeRow({
      local,
      remote,
      localMeta: {},
      remoteMeta: {},
      localUpdatedAt: T3,
      remoteUpdatedAt: T1,
    });

    expect(result.merged.notes).toBe('local only');
    expect(result.keptLocal).toContain('notes');
    expect(result.tookRemote).not.toContain('notes');
  });

  it('copies every mergeable field into the merged row', () => {
    const result = mergeRow({
      local: baseRow(),
      remote: baseRow(),
      localMeta: {},
      remoteMeta: {},
      localUpdatedAt: T1,
      remoteUpdatedAt: T1,
    });

    for (const field of MERGEABLE_TASK_FIELDS) {
      expect(result.merged).toHaveProperty(field);
    }
  });

  it('takes a remote deletion only if it is the newer write', () => {
    const local = baseRow({ deleted_at: null });
    const remote = baseRow({ deleted_at: T3 });

    const deleted = mergeRow({
      local,
      remote,
      localMeta: { deleted_at: T1 },
      remoteMeta: { deleted_at: T3 },
      localUpdatedAt: T1,
      remoteUpdatedAt: T3,
    });
    expect(deleted.merged.deleted_at).toBe(T3);

    const restored = mergeRow({
      local: baseRow({ deleted_at: null }),
      remote: baseRow({ deleted_at: T1 }),
      localMeta: { deleted_at: T3 },
      remoteMeta: { deleted_at: T1 },
      localUpdatedAt: T3,
      remoteUpdatedAt: T1,
    });
    expect(restored.merged.deleted_at).toBeNull();
  });
});

describe('mergeFieldMeta', () => {
  it('keeps the later stamp for each field', () => {
    expect(mergeFieldMeta({ title: T3, notes: T1 }, { title: T2, notes: T2 })).toEqual({
      title: T3,
      notes: T2,
    });
  });

  it('adopts stamps only the remote side has', () => {
    expect(mergeFieldMeta({}, { due_at: T1 })).toEqual({ due_at: T1 });
  });

  it('does not mutate either input', () => {
    const local: FieldMeta = { title: T3 };
    const remote: FieldMeta = { title: T2 };
    mergeFieldMeta(local, remote);
    expect(local).toEqual({ title: T3 });
    expect(remote).toEqual({ title: T2 });
  });
});
