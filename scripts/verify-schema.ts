/**
 * Schema / migration regression suite.
 *
 * This exists because a single line — `PRAGMA journal_mode = WAL;` sitting at the
 * top of MIGRATION_001 — made every fresh install fail to open the database.
 * Migrations run inside a transaction, and SQLite refuses to switch journal
 * modes while one is open, so the very first `getDatabase()` threw and the app
 * showed a runtime-error screen instead of a task list.
 *
 * The test below opens a throwaway file database, applies the connection pragmas
 * the same way `getDatabase` does (outside any transaction), then runs the real
 * `MIGRATION_001` inside BEGIN/COMMIT. If a stray pragma ever creeps back into a
 * migration, this fails loudly instead of on somebody's phone.
 *
 * Run with: npm run verify:schema
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { MIGRATION_001, MIGRATIONS, SCHEMA_VERSION } from '../src/db/schema.ts';

let passed = 0;
function check(label: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ok  ${label}`);
}

const dir = mkdtempSync(join(tmpdir(), 'taskflow-schema-'));
const file = join(dir, 'taskflow.db');

try {
  const db = new DatabaseSync(file);

  // Same order as src/db/client.ts: pragmas first, outside the transaction.
  check('connection pragmas apply outside a transaction', () => {
    db.exec('PRAGMA journal_mode = WAL;');
    const mode = db.prepare('PRAGMA journal_mode;').get() as { journal_mode: string };
    assert.equal(mode.journal_mode, 'wal');
    db.exec('PRAGMA foreign_keys = ON;');
  });

  check('the migration list matches the declared schema version', () => {
    assert.equal(MIGRATIONS.length, SCHEMA_VERSION);
    assert.equal(MIGRATIONS[0]?.sql, MIGRATION_001);
  });

  check('no migration embeds a transaction-breaking pragma', () => {
    for (const migration of MIGRATIONS) {
      assert.ok(
        !/journal_mode/i.test(migration.sql),
        `migration ${migration.version} sets journal_mode inside a transaction`,
      );
    }
  });

  check('MIGRATION_001 applies inside a transaction', () => {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATION_001);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
    const row = db.prepare('PRAGMA user_version;').get() as { user_version: number };
    assert.equal(row.user_version, SCHEMA_VERSION);
  });

  check('every expected table exists', () => {
    const names = (
      db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','virtual table')").all() as {
        name: string;
      }[]
    ).map((r) => r.name);
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
      assert.ok(names.includes(table), `missing table: ${table}`);
    }
  });

  check('the default inbox seeds idempotently', () => {
    const now = new Date().toISOString();
    const insert = () =>
      db
        .prepare(
          `INSERT OR IGNORE INTO projects
             (id, name, color, icon, is_archived, position, created_at, updated_at, sync_state)
           VALUES (?, ?, ?, ?, 0, 0, ?, ?, 'pending')`,
        )
        .run('local-inbox', 'Inbox', '#6C5CE7', 'inbox', now, now);
    insert();
    insert();
    const count = db.prepare('SELECT COUNT(*) AS n FROM projects;').get() as { n: number };
    assert.equal(count.n, 1);
  });

  check('writing a task keeps the FTS index in sync', () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tasks (id, title, notes, status, created_at, updated_at)
       VALUES (?, ?, ?, 'todo', ?, ?)`,
    ).run('t1', 'Buy milk', 'two litres', now, now);
    const hit = db
      .prepare("SELECT rowid FROM tasks_fts WHERE tasks_fts MATCH 'milk';")
      .get() as { rowid: number } | undefined;
    assert.ok(hit, 'FTS index did not pick up the inserted task');
  });

  db.close();
  console.log(`\nverify-schema: ${passed} checks passed`);
} finally {
  rmSync(dir, { recursive: true, force: true });
  if (existsSync(file)) rmSync(file, { force: true });
}
