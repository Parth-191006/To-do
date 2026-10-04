/**
 * SQLite schema for TaskFlow.
 *
 * Design notes
 * ------------
 * - Everything is local-first. SQLite is the source of truth on device; rows
 *   carry `sync_state` and `updated_at` so the sync engine can push an outbox
 *   and pull deltas from Supabase.
 * - Deleting is a soft delete (`deleted_at`) so deletions propagate to other
 *   collaborators instead of silently reappearing on the next pull.
 * - Recurrences and geofences are stored as JSON text; SQLite's JSON1
 *   functions can still query them when needed.
 * - `tasks` is a self-referencing tree (`parent_id`) giving infinite subtask
 *   nesting with a single table.
 * - `notification_records` mirrors what we asked the OS to schedule so we can
 *   cancel or reschedule deterministically after a restart.
 */

export const SCHEMA_VERSION = 3;

// NOTE: connection-wide pragmas (journal_mode, foreign_keys) are applied in
// `getDatabase` BEFORE this SQL runs, never here. Migrations execute inside a
// transaction, and SQLite rejects `PRAGMA journal_mode = WAL` inside one.
export const MIGRATION_001 = `
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  email        TEXT,
  display_name TEXT NOT NULL DEFAULT 'You',
  avatar_url   TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#0D9488',
  icon        TEXT NOT NULL DEFAULT 'folder',
  is_archived INTEGER NOT NULL DEFAULT 0,
  position    REAL NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT,
  sync_state  TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS tags (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color      TEXT NOT NULL DEFAULT '#0D9488',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sync_state TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS tasks (
  id                 TEXT PRIMARY KEY,
  project_id         TEXT REFERENCES projects(id) ON DELETE SET NULL,
  parent_id          TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  notes              TEXT NOT NULL DEFAULT '',
  status             TEXT NOT NULL DEFAULT 'todo',
  priority           TEXT NOT NULL DEFAULT 'none',
  due_at             TEXT,
  remind_at          TEXT,
  recurrence         TEXT,
  location_reminder  TEXT,
  estimate_minutes   INTEGER,
  attachments        TEXT NOT NULL DEFAULT '[]',
  position           REAL NOT NULL DEFAULT 0,
  completed_at       TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  deleted_at         TEXT,
  sync_state         TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_tasks_project   ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent    ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due       ON tasks(due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_status    ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_updated   ON tasks(updated_at);

CREATE TABLE IF NOT EXISTS task_tags (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id  TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);

CREATE TABLE IF NOT EXISTS habits (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  color             TEXT NOT NULL DEFAULT '#10B981',
  icon              TEXT NOT NULL DEFAULT 'flame',
  target_per_period INTEGER NOT NULL DEFAULT 1,
  cadence           TEXT NOT NULL DEFAULT 'daily',
  by_weekday        TEXT NOT NULL DEFAULT '[]',
  is_archived       INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  sync_state        TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS habit_logs (
  id         TEXT PRIMARY KEY,
  habit_id   TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date_key   TEXT NOT NULL,
  count      INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  sync_state TEXT NOT NULL DEFAULT 'pending',
  UNIQUE (habit_id, date_key)
);

CREATE INDEX IF NOT EXISTS idx_habit_logs_habit ON habit_logs(habit_id, date_key);

CREATE TABLE IF NOT EXISTS focus_sessions (
  id               TEXT PRIMARY KEY,
  task_id          TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  project_id       TEXT REFERENCES projects(id) ON DELETE SET NULL,
  started_at       TEXT NOT NULL,
  ended_at         TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  kind             TEXT NOT NULL DEFAULT 'focus',
  completed        INTEGER NOT NULL DEFAULT 0,
  sync_state       TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_focus_started ON focus_sessions(started_at);

CREATE TABLE IF NOT EXISTS notification_records (
  id            TEXT PRIMARY KEY,
  os_identifier TEXT,
  task_id       TEXT,
  habit_id      TEXT,
  kind          TEXT NOT NULL,
  title         TEXT NOT NULL DEFAULT '',
  body          TEXT NOT NULL DEFAULT '',
  trigger_at    TEXT,
  recurrence    TEXT,
  status        TEXT NOT NULL DEFAULT 'scheduled',
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notification_task ON notification_records(task_id);

CREATE TABLE IF NOT EXISTS activity_logs (
  id          TEXT PRIMARY KEY,
  entity_kind TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  actor_id    TEXT NOT NULL,
  action      TEXT NOT NULL,
  summary     TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_logs(entity_kind, entity_id);

CREATE TABLE IF NOT EXISTS list_members (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  role         TEXT NOT NULL DEFAULT 'viewer',
  joined_at    TEXT NOT NULL
);

-- Outbox for the offline-first sync engine. Every local mutation appends here
-- (or bumpers sync_state='pending' on the row) and the engine drains it.
CREATE TABLE IF NOT EXISTS sync_outbox (
  id          TEXT PRIMARY KEY,
  entity_kind TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  op          TEXT NOT NULL,
  payload     TEXT NOT NULL DEFAULT '{}',
  attempts    INTEGER NOT NULL DEFAULT 0,
  last_error  TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_outbox_created ON sync_outbox(created_at);

CREATE TABLE IF NOT EXISTS sync_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Full-text search over task titles + notes.
CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
  title,
  notes,
  content='tasks',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS tasks_fts_insert AFTER INSERT ON tasks BEGIN
  INSERT INTO tasks_fts(rowid, title, notes) VALUES (new.rowid, new.title, new.notes);
END;

CREATE TRIGGER IF NOT EXISTS tasks_fts_delete AFTER DELETE ON tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, title, notes) VALUES ('delete', old.rowid, old.title, old.notes);
END;

CREATE TRIGGER IF NOT EXISTS tasks_fts_update AFTER UPDATE ON tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, title, notes) VALUES ('delete', old.rowid, old.title, old.notes);
  INSERT INTO tasks_fts(rowid, title, notes) VALUES (new.rowid, new.title, new.notes);
END;
`;

export const MIGRATION_002 = `
ALTER TABLE habits ADD COLUMN reminder_hour INTEGER;
ALTER TABLE habits ADD COLUMN reminder_minute INTEGER;
`;

/**
 * Per-field write stamps, so two people editing different fields of the same
 * task both keep their change (see `src/services/sync/merge.ts`).
 */
export const MIGRATION_003 = `
ALTER TABLE tasks ADD COLUMN field_meta TEXT NOT NULL DEFAULT '{}';
`;

export const MIGRATIONS: { version: number; sql: string }[] = [
  { version: 1, sql: MIGRATION_001 },
  {
    version: 2,
    sql: MIGRATION_002,
  },
  {
    version: 3,
    sql: MIGRATION_003,
  },
];
