/**
 * Shared harness for `tests/sync-engine.test.ts`.
 *
 * The suite mocks two modules — `@/db/client` (a native module) and
 * `@/services/supabase/client` (an HTTP client) — and both of them have to end
 * up talking to *the same* throwaway database and the same fake backend. The
 * mock factories are hoisted and asynchronous, so instead of guessing which one
 * runs first, both import this module: one instance, one database, no ordering
 * assumptions.
 *
 * Not a `.test.ts` file, so Vitest never collects it as a suite.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { MIGRATIONS } from '@/db/schema';

export interface FakeCall {
  table: string;
  op: 'select' | 'upsert' | 'delete' | 'insert' | 'cleanup';
  rows?: Record<string, unknown>[];
  cleanup?: [string, unknown];
}

export interface SyncHarness {
  /** The throwaway database, created and migrated here. */
  db: DatabaseSync;
  directory: string;
  /** Rows the fake backend holds, keyed by table then id. */
  remote: Map<string, Map<string, Record<string, unknown>>>;
  /** Every backend interaction the engine performed, in order. */
  calls: FakeCall[];
  /** In-memory `task_tags`, so insert/delete round-trips are observable. */
  taskTags: Map<string, Set<string>>;
  adapter: {
    runAsync(sql: string, params?: unknown[]): Promise<unknown>;
    getFirstAsync(sql: string, params?: unknown[]): Promise<unknown>;
    getAllAsync(sql: string, params?: unknown[]): Promise<unknown[]>;
    execAsync(sql: string): Promise<void>;
    withTransactionAsync(fn: () => Promise<void>): Promise<void>;
  };
  reset(): void;
  drop(): void;
}

const directory = mkdtempSync(join(tmpdir(), 'taskflow-sync-'));
const db = new DatabaseSync(join(directory, 'taskflow.db'));
db.exec('PRAGMA foreign_keys = ON;');
for (const migration of MIGRATIONS) db.exec(migration.sql);

const remote = new Map<string, Map<string, Record<string, unknown>>>();
const calls: FakeCall[] = [];
const taskTags = new Map<string, Set<string>>();

export const harness: SyncHarness = {
  db,
  directory,
  remote,
  calls,
  taskTags,
  adapter: {
    runAsync: async (sql: string, params: unknown[] = []) =>
      db.prepare(sql).run(...(params as SQLInputValue[])),
    getFirstAsync: async (sql: string, params: unknown[] = []) =>
      db.prepare(sql).get(...(params as SQLInputValue[])) ?? null,
    getAllAsync: async (sql: string, params: unknown[] = []) =>
      db.prepare(sql).all(...(params as SQLInputValue[])),
    execAsync: async (sql: string) => {
      db.exec(sql);
    },
    withTransactionAsync: async (fn: () => Promise<void>) => {
      db.exec('BEGIN');
      try {
        await fn();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  },
  reset() {
    db.exec('PRAGMA foreign_keys = OFF;');
    for (const table of [
      'tasks',
      'task_tags',
      'activity_logs',
      'sync_outbox',
      'sync_meta',
      'projects',
      'tags',
      'habits',
      'habit_logs',
    ]) {
      db.exec(`DELETE FROM ${table};`);
    }
    db.exec('PRAGMA foreign_keys = ON;');
    remote.clear();
    taskTags.clear();
    calls.length = 0;
  },
  drop() {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  },
};

/**
 * Stand-in for the parts of the supabase-js query builder the engine uses.
 *
 * It is deliberately small: it records the call, keeps a row store, and answers
 * a `select ... gt('updated_at', since)` with the rows a real backend would
 * return. Everything else — the merge, the ordering, the outbox — is the real
 * code under test.
 */
export function fakeSupabase(): { from: (table: string) => FakeQuery } {
  return { from: (table: string) => new FakeQuery(table) };
}

export class FakeQuery implements PromiseLike<unknown> {
  private mode: FakeCall['op'] = 'select';
  private since: string | null = null;
  private payload: Record<string, unknown>[] = [];

  constructor(private table: string) {}

  select(): this {
    this.mode = 'select';
    return this;
  }

  gt(column: string, value: string): this {
    if (column === 'updated_at') this.since = value;
    return this;
  }

  order(): this {
    return this;
  }

  limit(): this {
    return this;
  }

  upsert(rows: Record<string, unknown>[]): Promise<{ error: null }> {
    this.mode = 'upsert';
    this.payload = rows;
    harness.calls.push({ table: this.table, op: 'upsert', rows });
    const bucket = harness.remote.get(this.table) ?? new Map();
    for (const row of rows) {
      bucket.set(row.id as string, { ...bucket.get(row.id as string), ...row });
    }
    harness.remote.set(this.table, bucket);
    return Promise.resolve({ error: null });
  }

  insert(rows: Record<string, unknown>[]): Promise<{ error: null }> {
    this.mode = 'insert';
    this.payload = rows;
    harness.calls.push({ table: this.table, op: 'insert', rows });
    const set = harness.taskTags.get((rows[0]?.task_id as string) ?? '') ?? new Set<string>();
    for (const row of rows) set.add(row.tag_id as string);
    harness.taskTags.set((rows[0]?.task_id as string) ?? '', set);
    return Promise.resolve({ error: null });
  }

  delete(): this {
    this.mode = 'delete';
    harness.calls.push({ table: this.table, op: 'delete' });
    return this;
  }

  eq(column: string, value: unknown): Promise<{ error: null }> {
    harness.calls.push({ table: this.table, op: 'cleanup', cleanup: [column, value] });
    if (this.table === 'task_tags') harness.taskTags.set(value as string, new Set());
    return Promise.resolve({ error: null });
  }

  private async execute(): Promise<{ data?: unknown; error: null }> {
    if (this.mode !== 'select') return { error: null };
    const rows = [...(harness.remote.get(this.table)?.values() ?? [])];
    const filtered = this.since
      ? rows.filter((row) => (row.updated_at as string) > this.since!)
      : rows;
    filtered.sort((a, b) => ((a.updated_at as string) > (b.updated_at as string) ? 1 : -1));
    return { data: filtered, error: null };
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}
