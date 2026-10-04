/**
 * Per-field merge for the sync engine.
 *
 * The engine used to resolve conflicts with **whole-row last-write-wins**: it
 * compared `updated_at` and took the newer row outright. That is wrong the
 * moment two people edit different parts of the same task — one renaming the
 * title while the other writes notes — because whichever row is newer silently
 * erases the other person's field.
 *
 * This module keeps a timestamp *per field* instead. Every field the local user
 * actually changed is stamped in `field_meta` (a small JSON map on the row), and
 * a pull compares field by field: the newer write wins, field by field, so both
 * edits survive. Fields with no recorded local write fall back to the row's
 * `updated_at` on both sides, which makes the merge degrade exactly to the old
 * behaviour for rows written before this existed.
 *
 * Pure by design — no SQLite, no Supabase — so it is unit-testable.
 */

/** `{ "notes": "2026-10-04T10:00:00.000Z", … }` */
export type FieldMeta = Record<string, string>;

/** Columns that participate in a merge (everything except identity/bookkeeping). */
export const MERGEABLE_TASK_FIELDS = [
  'project_id',
  'parent_id',
  'title',
  'notes',
  'status',
  'priority',
  'due_at',
  'remind_at',
  'recurrence',
  'location_reminder',
  'estimate_minutes',
  'attachments',
  'position',
  'completed_at',
  'deleted_at',
] as const;

export type MergeableField = (typeof MERGEABLE_TASK_FIELDS)[number];

/** Parses `field_meta` defensively — a bad value reads as "no field stamps". */
export function parseFieldMeta(raw: unknown): FieldMeta {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return isFieldMeta(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return isFieldMeta(raw) ? raw : {};
}

function isFieldMeta(value: unknown): value is FieldMeta {
  if (typeof value !== 'object' || value === null) return false;
  return Object.values(value as Record<string, unknown>).every((entry) => typeof entry === 'string');
}

/**
 * Stamps a set of fields as written right now.
 *
 * Returns a new map; the caller stores it back in `tasks.field_meta`.
 */
export function stampFields(meta: FieldMeta, fields: string[], at: string): FieldMeta {
  const next: FieldMeta = { ...meta };
  for (const field of fields) next[field] = at;
  return next;
}

/** Which mergeable fields actually differ between two rows. */
export function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: readonly string[] = MERGEABLE_TASK_FIELDS,
): string[] {
  return fields.filter((field) => !sameValue(before[field], after[field]));
}

/**
 * Loose equality used for "did this field change?".
 *
 * Values arrive from two places (SQLite rows as numbers/strings, Supabase rows as
 * JSON) and mean the same thing in both, so `1`/`'1'` and `null`/`undefined`
 * must not count as a change.
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    // SQLite stores booleans as 0/1 while Postgres returns true/false.
    return Number(a) === Number(b);
  }
  if (typeof a === 'object' || typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return String(a) === String(b);
}

export interface MergeInput {
  /** The row as it exists locally. */
  local: Record<string, unknown>;
  /** The row as it arrived from the backend. */
  remote: Record<string, unknown>;
  /** Local per-field stamps. */
  localMeta: FieldMeta;
  /** Remote per-field stamps (from the mirrored `field_meta` column). */
  remoteMeta: FieldMeta;
  /** Row-level timestamps, used when a field carries no stamp. */
  localUpdatedAt: string;
  remoteUpdatedAt: string;
}

export interface MergeResult {
  /** Merged values keyed by `MERGEABLE_TASK_FIELDS`. */
  merged: Record<string, unknown>;
  /** Fields where the local value won (kept as-is). */
  keptLocal: string[];
  /** Fields where the remote value won (must be written back). */
  tookRemote: string[];
}

/**
 * Merges one row field by field.
 *
 * The rule, per field: whichever side *wrote* that field more recently wins; a
 * tie goes to the remote (the other device's write is the new information).
 */
export function mergeRow(input: MergeInput): MergeResult {
  const { local, remote, localMeta, remoteMeta, localUpdatedAt, remoteUpdatedAt } = input;
  const merged: Record<string, unknown> = {};
  const keptLocal: string[] = [];
  const tookRemote: string[] = [];

  for (const field of MERGEABLE_TASK_FIELDS) {
    const localAt = localMeta[field] ?? localUpdatedAt;
    const remoteAt = remoteMeta[field] ?? remoteUpdatedAt;
    const localHas = field in local;
    const remoteHas = field in remote;

    if (!remoteHas) {
      // Nothing to compare — keep whatever we hold.
      if (localHas) merged[field] = local[field];
      keptLocal.push(field);
      continue;
    }

    if (remoteAt >= localAt) {
      // Remote is at least as new for this field.
      if (remoteHas && (!localHas || !sameValue(local[field], remote[field]))) {
        merged[field] = remote[field];
        tookRemote.push(field);
      } else if (localHas) {
        merged[field] = local[field];
        keptLocal.push(field);
      }
      continue;
    }

    // Local write is strictly newer for this field — never clobber it.
    if (localHas) merged[field] = local[field];
    keptLocal.push(field);
  }

  return { merged, keptLocal, tookRemote };
}

/**
 * Merges the two `field_meta` maps so the result can be stored on the merged
 * row: the later stamp wins per field.
 */
export function mergeFieldMeta(localMeta: FieldMeta, remoteMeta: FieldMeta): FieldMeta {
  const next: FieldMeta = { ...remoteMeta };
  for (const [field, at] of Object.entries(localMeta)) {
    const remoteAt = next[field];
    if (!remoteAt || at > remoteAt) next[field] = at;
  }
  return next;
}
