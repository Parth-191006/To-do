import * as SQLite from 'expo-sqlite';

import { MIGRATIONS, SCHEMA_VERSION } from './schema';

const DB_NAME = 'taskflow.db';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  if (current >= SCHEMA_VERSION) return;

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    await db.withTransactionAsync(async () => {
      await db.execAsync(migration.sql);
    });
  }

  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

/**
 * Opens (once) and migrates the SQLite database. Safe to call from anywhere —
 * the promise is memoised so concurrent callers share a single connection.
 */
export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync('PRAGMA foreign_keys = ON;');
      await runMigrations(db);
      await seedDefaults(db);
      return db;
    })().catch((error) => {
      // Reset so a later retry can attempt to open the connection again.
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

/** Creates the local user row + an inbox project on a fresh install. */
async function seedDefaults(db: SQLite.SQLiteDatabase): Promise<void> {
  const now = new Date().toISOString();
  const existing = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM projects',
  );
  if ((existing?.count ?? 0) > 0) return;

  await db.runAsync(
    `INSERT OR IGNORE INTO projects
       (id, name, color, icon, is_archived, position, created_at, updated_at, sync_state)
     VALUES (?, ?, ?, ?, 0, 0, ?, ?, 'pending')`,
    ['local-inbox', 'Inbox', '#6C5CE7', 'inbox', now, now],
  );
}

export async function resetDatabase(): Promise<void> {
  const db = await getDatabase();
  const tables = [
    'sync_outbox',
    'sync_meta',
    'activity_logs',
    'notification_records',
    'focus_sessions',
    'habit_logs',
    'habits',
    'task_tags',
    'tasks_fts',
    'tasks',
    'tags',
    'list_members',
    'projects',
    'users',
  ];
  for (const table of tables) {
    await db.execAsync(`DROP TABLE IF EXISTS ${table};`);
  }
  await db.execAsync('PRAGMA user_version = 0;');
  databasePromise = null;
}

/** Test/dev helper: verifies the connection is live. */
export async function pingDatabase(): Promise<boolean> {
  try {
    const db = await getDatabase();
    await db.getFirstAsync('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
