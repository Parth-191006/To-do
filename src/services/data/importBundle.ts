import { getDatabase } from '@/db/client';

import {
  BACKUP_FILENAME,
  formatImportPlan,
  planImport,
  validateBundle,
  type BackupBundle,
  type ExistingIds,
  type ImportPlan,
} from './backupFormat';

/**
 * Applying a backup — the half that writes.
 *
 * Kept apart from `./export` (which pulls in the file system and the share
 * sheet) so this can be exercised in a plain Node test with a throwaway SQLite
 * database: the round-trip guarantee — import the same file twice and nothing is
 * created twice — is exactly the kind of thing that should be proven, not
 * asserted in a comment.
 */

export interface ImportSummary {
  projects: number;
  tasks: number;
  tags: number;
  habits: number;
  habitLogs: number;
  skipped: number;
}

/** Reads the ids already on this device, for the dry-run comparison. */
export async function loadExistingIds(): Promise<ExistingIds> {
  const db = await getDatabase();
  const ids = async (table: string): Promise<Set<string>> => {
    const rows = await db.getAllAsync<{ id: string }>(`SELECT id FROM ${table}`);
    return new Set(rows.map((row) => row.id));
  };

  return {
    projects: await ids('projects'),
    tasks: await ids('tasks'),
    tags: await ids('tags'),
    habits: await ids('habits'),
    habitLogs: await ids('habit_logs'),
  };
}

/**
 * Parses, validates and reports what the import *would* do. Writes nothing.
 *
 * The Settings sheet shows this before the second tap: a backup that turns out
 * to be the one already on the phone should not look like twelve new tasks about
 * to arrive.
 */
export async function previewImport(
  text: string,
): Promise<{ ok: true; bundle: BackupBundle; plan: ImportPlan; message: string } | { ok: false; message: string }> {
  const parsed = parseJson(text);
  if (!parsed.ok) return parsed;

  const validated = validateBundle(parsed.value);
  if (!validated.ok) return { ok: false, message: validated.reason };

  const plan = planImport(validated.bundle, await loadExistingIds());
  return { ok: true, bundle: validated.bundle, plan, message: formatImportPlan(plan) };
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false; message: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, message: 'That file is not valid JSON.' };
  }
}

/**
 * Applies a bundle. Rows are inserted by id, so importing your own export is a
 * no-op and importing a merge from another phone adds what is missing instead of
 * wiping what is here.
 */
export async function importBundle(bundle: BackupBundle): Promise<ImportSummary> {
  const db = await getDatabase();
  const summary: ImportSummary = {
    projects: 0,
    tasks: 0,
    tags: 0,
    habits: 0,
    habitLogs: 0,
    skipped: 0,
  };

  /** An ignored row (a duplicate) reports `changes: 0`. */
  const inserted = (result: { changes?: number | bigint } | undefined): boolean =>
    Number(result?.changes ?? 0) > 0;

  await db.withTransactionAsync(async () => {
    for (const project of bundle.projects) {
      const result = await db.runAsync(
        `INSERT OR IGNORE INTO projects
           (id, name, color, icon, is_archived, position, created_at, updated_at, deleted_at, sync_state)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          project.id,
          project.name,
          project.color,
          project.icon ?? 'folder',
          project.isArchived ? 1 : 0,
          project.position ?? 0,
          project.createdAt,
          project.updatedAt,
          project.deletedAt ?? null,
        ],
      );
      if (inserted(result)) summary.projects += 1;
      else summary.skipped += 1;
    }

    for (const tag of bundle.tags) {
      const result = await db.runAsync(
        `INSERT OR IGNORE INTO tags (id, name, color, created_at, updated_at, sync_state)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [tag.id, tag.name, tag.color, tag.createdAt, tag.updatedAt],
      );
      if (inserted(result)) summary.tags += 1;
      else summary.skipped += 1;
    }

    for (const task of bundle.tasks) {
      const result = await db.runAsync(
        `INSERT OR IGNORE INTO tasks
           (id, project_id, parent_id, title, notes, status, priority, due_at, remind_at,
            recurrence, location_reminder, estimate_minutes, attachments, position,
            completed_at, created_at, updated_at, deleted_at, sync_state)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          task.id,
          task.projectId ?? null,
          task.parentId ?? null,
          task.title,
          task.notes ?? '',
          task.status ?? 'todo',
          task.priority ?? 'none',
          task.dueAt ?? null,
          task.remindAt ?? null,
          task.recurrence ? JSON.stringify(task.recurrence) : null,
          task.locationReminder ? JSON.stringify(task.locationReminder) : null,
          task.estimateMinutes ?? null,
          JSON.stringify(task.attachments ?? []),
          task.position ?? 0,
          task.completedAt ?? null,
          task.createdAt,
          task.updatedAt,
          task.deletedAt ?? null,
        ],
      );
      if (inserted(result)) summary.tasks += 1;
      else summary.skipped += 1;

      for (const tagId of task.tagIds ?? []) {
        await db.runAsync('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)', [
          task.id,
          tagId,
        ]);
      }
    }

    for (const habit of bundle.habits) {
      const result = await db.runAsync(
        `INSERT OR IGNORE INTO habits
           (id, name, color, icon, target_per_period, cadence, by_weekday, reminder_hour,
            reminder_minute, is_archived, created_at, updated_at, sync_state)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          habit.id,
          habit.name,
          habit.color,
          habit.icon ?? 'flame',
          habit.targetPerPeriod ?? 1,
          habit.cadence ?? 'daily',
          JSON.stringify(habit.byWeekday ?? []),
          habit.reminderHour ?? null,
          habit.reminderMinute ?? null,
          habit.isArchived ? 1 : 0,
          habit.createdAt,
          habit.updatedAt,
        ],
      );
      if (inserted(result)) summary.habits += 1;
      else summary.skipped += 1;
    }

    for (const log of bundle.habitLogs) {
      const result = await db.runAsync(
        `INSERT OR IGNORE INTO habit_logs (id, habit_id, date_key, count, created_at, sync_state)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [log.id, log.habitId, log.dateKey, log.count, log.createdAt],
      );
      if (inserted(result)) summary.habitLogs += 1;
      else summary.skipped += 1;
    }
  });

  return summary;
}

/** Parses + validates + applies, returning a human-readable summary line. */
export async function importFromJsonText(text: string): Promise<{ ok: boolean; message: string }> {
  const preview = await previewImport(text);
  if (!preview.ok) return { ok: false, message: preview.message };

  const summary = await importBundle(preview.bundle);
  const added =
    summary.tasks + summary.projects + summary.tags + summary.habits + summary.habitLogs;
  return {
    ok: true,
    message:
      added === 0
        ? `Nothing to do — everything in ${BACKUP_FILENAME} is already on this device.`
        : `Imported ${summary.tasks} tasks, ${summary.projects} lists, ${summary.tags} tags, ${summary.habits} habits and ${summary.habitLogs} habit check-ins.`,
  };
}
