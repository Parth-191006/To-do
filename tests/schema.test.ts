/**
 * Schema / migration suite (7 assertions ported from `scripts/verify-schema.ts`,
 * plus four for the v2 and v3 columns).
 *
 * This exists because a single line — `PRAGMA journal_mode = WAL;` at the top of
 * MIGRATION_001 — made every fresh install fail to open the database. If a stray
 * pragma ever creeps back into a migration, this fails loudly here instead of on
 * somebody's phone.
 *
 * It runs the real migrations against a throwaway database via `node:sqlite`,
 * exactly the way `src/db/client.ts` orders them.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterAll, describe, expect, it } from 'vitest';

import { MIGRATION_001, MIGRATIONS, SCHEMA_VERSION } from '@/db/schema';

const dir = mkdtempSync(join(tmpdir(), 'taskflow-schema-'));
const file = join(dir, 'taskflow.db');
const db = new DatabaseSync(file);

afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
  if (existsSync(file)) rmSync(file, { force: true });
});

describe('schema and migrations', () => {
  it('connection pragmas apply outside a transaction', () => {
    db.exec('PRAGMA journal_mode = WAL;');
    const mode = db.prepare('PRAGMA journal_mode;').get() as { journal_mode: string };
    expect(mode.journal_mode).toBe('wal');
    db.exec('PRAGMA foreign_keys = ON;');
  });

  it('the migration list matches the declared schema version', () => {
    expect(MIGRATIONS).toHaveLength(SCHEMA_VERSION);
    expect(MIGRATIONS[0]?.sql).toBe(MIGRATION_001);
    expect(MIGRATIONS.map((migration) => migration.version)).toEqual([1, 2, 3]);
  });

  it('no migration embeds a transaction-breaking pragma', () => {
    for (const migration of MIGRATIONS) {
      expect(/journal_mode/i.test(migration.sql)).toBe(false);
    }
  });

  it('every migration applies inside a transaction, in order', () => {
    db.exec('BEGIN');
    try {
      for (const migration of MIGRATIONS) db.exec(migration.sql);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
    const row = db.prepare('PRAGMA user_version;').get() as { user_version: number };
    expect(row.user_version).toBe(SCHEMA_VERSION);
  });

  it('every expected table exists', () => {
    const names = (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','virtual table')")
        .all() as { name: string }[]
    ).map((row) => row.name);
    for (const table of [
      'users',
      'projects',
      'tags',
      'tasks',
      'task_tags',
      'habits',
      'habit_logs',
      'focus_sessions',
      'notification_records',
      'activity_logs',
      'list_members',
      'sync_outbox',
      'sync_meta',
      'tasks_fts',
    ]) {
      expect(names).toContain(table);
    }
  });

  it('the default inbox seeds idempotently', () => {
    const now = new Date().toISOString();
    const insert = () =>
      db
        .prepare(
          `INSERT OR IGNORE INTO projects
             (id, name, color, icon, is_archived, position, created_at, updated_at, sync_state)
           VALUES (?, ?, ?, ?, 0, 0, ?, ?, 'pending')`,
        )
        .run('local-inbox', 'Inbox', '#0D9488', 'inbox', now, now);
    insert();
    insert();
    const count = db.prepare('SELECT COUNT(*) AS n FROM projects;').get() as { n: number };
    expect(count.n).toBe(1);
  });

  it('writing a task keeps the FTS index in sync', () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tasks (id, title, notes, status, created_at, updated_at)
       VALUES (?, ?, ?, 'todo', ?, ?)`,
    ).run('t1', 'Buy milk', 'two litres', now, now);
    const hit = db.prepare("SELECT rowid FROM tasks_fts WHERE tasks_fts MATCH 'milk';").get() as
      | { rowid: number }
      | undefined;
    expect(hit).toBeTruthy();
  });

  it('the FTS index answers prefix queries, which is what search uses', () => {
    const hit = db.prepare("SELECT rowid FROM tasks_fts WHERE tasks_fts MATCH 'mi*';").get() as
      | { rowid: number }
      | undefined;
    expect(hit?.rowid).toBe(1);
  });

  it('migration 2 added the habit reminder columns', () => {
    const columns = (db.prepare('PRAGMA table_info(habits);').all() as { name: string }[]).map(
      (column) => column.name,
    );
    expect(columns).toContain('reminder_hour');
    expect(columns).toContain('reminder_minute');
  });

  it('migration 3 added the per-field sync stamps', () => {
    const columns = (db.prepare('PRAGMA table_info(tasks);').all() as { name: string }[]).map(
      (column) => column.name,
    );
    expect(columns).toContain('field_meta');
    const row = db.prepare('SELECT field_meta FROM tasks WHERE id = ?').get('t1') as {
      field_meta: string;
    };
    expect(row.field_meta).toBe('{}');
  });
});
