// SDK 57 ships two file APIs: the new `File`/`Directory` classes at the package
// root, and the string-URI API under `/legacy`. The legacy surface is the one
// that matches this module's needs (write a string, stat a path, get a
// `documentDirectory`), and it is what `expo-sharing` expects a URI from.
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { getDatabase } from '@/db/client';
import { listAllHabitLogs, listHabits } from '@/db/repositories/habits';
import { listProjects } from '@/db/repositories/projects';
import { listTags } from '@/db/repositories/tags';
import { listTasks } from '@/db/repositories/tasks';
import type { Habit, HabitLog, Project, Tag, TaskWithTags } from '@/domain/types';
import { nowIso } from '@/utils/id';

/**
 * Export, import and local backup.
 *
 * Settings offered a "Reset local data" button and no way to get the data out
 * first — a real dead end for anyone switching phones or just wanting a copy.
 * Everything here is local: a JSON snapshot (the full, re-importable shape) and
 * a CSV (for spreadsheets), plus a rolling on-device backup that survives an
 * accidental reset.
 *
 * No backend, no account, no network call.
 */

export interface BackupBundle {
  version: 1;
  exportedAt: string;
  appVersion: string;
  projects: Project[];
  tasks: TaskWithTags[];
  tags: Tag[];
  habits: Habit[];
  habitLogs: HabitLog[];
}

export const BACKUP_FILENAME = 'taskflow-backup.json';

/** Directory for automatic backups — private to the app, never auto-deleted. */
function backupDir(): string {
  // `documentDirectory` is the app's private folder on both platforms.
  return `${FileSystem.documentDirectory ?? ''}backups/`;
}

/** Builds the full snapshot from SQLite. */
export async function buildBackup(): Promise<BackupBundle> {
  const [projects, tasks, tags, habits, habitLogs] = await Promise.all([
    listProjects(true),
    listTasks({ status: 'all', includeCompleted: true }),
    listTags(),
    listHabits(true),
    listAllHabitLogs(),
  ]);

  return {
    version: 1,
    exportedAt: nowIso(),
    appVersion: '1.2.3',
    projects,
    tasks,
    tags,
    habits,
    habitLogs,
  };
}

export function serializeBackup(bundle: BackupBundle): string {
  return JSON.stringify(bundle, null, 2);
}

/* -------------------------------------------------------------------------- */
/*                                    CSV                                     */
/* -------------------------------------------------------------------------- */

/** RFC-4180 escaping: quote everything that could break a spreadsheet. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const TASK_CSV_HEADER = [
  'id',
  'title',
  'notes',
  'status',
  'priority',
  'due_at',
  'remind_at',
  'recurrence',
  'estimate_minutes',
  'project_id',
  'parent_id',
  'completed_at',
  'tags',
  'created_at',
  'updated_at',
] as const;

/** Tasks as CSV — one row per task, tags flattened to `a;b`. */
export function tasksToCsv(
  tasks: TaskWithTags[],
  tagNameById: Map<string, string> = new Map(),
): string {
  const rows = tasks.map((task) =>
    [
      task.id,
      task.title,
      task.notes,
      task.status,
      task.priority,
      task.dueAt,
      task.remindAt,
      task.recurrence,
      task.estimateMinutes,
      task.projectId,
      task.parentId,
      task.completedAt,
      task.tagIds.map((id) => tagNameById.get(id) ?? id).join(';'),
      task.createdAt,
      task.updatedAt,
    ]
      .map(csvCell)
      .join(','),
  );
  return [TASK_CSV_HEADER.join(','), ...rows].join('\n');
}

/* -------------------------------------------------------------------------- */
/*                                  writing                                   */
/* -------------------------------------------------------------------------- */

export interface ExportResult {
  ok: boolean;
  uri?: string;
  shared?: boolean;
  reason?: string;
}

async function writeAndShare(
  filename: string,
  contents: string,
  mimeType: string,
  dialogTitle: string,
): Promise<ExportResult> {
  const target = `${backupDir()}${filename}`;
  try {
    await FileSystem.makeDirectoryAsync(backupDir(), { intermediates: true }).catch(
      () => undefined,
    );
    await FileSystem.writeAsStringAsync(target, contents);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'Could not write the file' };
  }

  // The share sheet is the only way out of the app sandbox without a backend,
  // and it is also how the user gets the file onto Drive or into an email.
  try {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(target, {
        mimeType,
        dialogTitle,
        UTI: mimeType === 'application/json' ? 'public.json' : 'public.comma-separated-values-text',
      });
      return { ok: true, uri: target, shared: true };
    }
  } catch {
    // Fall through: the file still exists on disk and the uri is reported.
  }
  return { ok: true, uri: target, shared: false };
}

export async function exportJson(): Promise<ExportResult> {
  const bundle = await buildBackup();
  return writeAndShare(BACKUP_FILENAME, serializeBackup(bundle), 'application/json', 'Export TaskFlow data');
}

export async function exportCsv(): Promise<ExportResult> {
  const [tasks, tags] = await Promise.all([listTasks({ status: 'all', includeCompleted: true }), listTags()]);
  const names = new Map(tags.map((tag) => [tag.id, tag.name]));
  return writeAndShare('taskflow-tasks.csv', tasksToCsv(tasks, names), 'text/csv', 'Export tasks as CSV');
}

/**
 * Writes the rolling backup. Called after every mutation batch from the store,
 * and before a reset — so "clear my data" can always be undone.
 */
export async function writeLocalBackup(): Promise<string | null> {
  const bundle = await buildBackup();
  const target = `${backupDir()}${BACKUP_FILENAME}`;
  try {
    await FileSystem.makeDirectoryAsync(backupDir(), { intermediates: true }).catch(
      () => undefined,
    );
    await FileSystem.writeAsStringAsync(target, serializeBackup(bundle));
    return target;
  } catch {
    return null;
  }
}

export async function localBackupPath(): Promise<string> {
  return `${backupDir()}${BACKUP_FILENAME}`;
}

export async function localBackupExists(): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(`${backupDir()}${BACKUP_FILENAME}`);
    return info.exists;
  } catch {
    return false;
  }
}

/** Reads the rolling backup for display (size + timestamp) in Settings. */
export async function readLocalBackupInfo(): Promise<{ exists: boolean; modifiedAt?: number }> {
  try {
    const info = await FileSystem.getInfoAsync(`${backupDir()}${BACKUP_FILENAME}`);
    if (!info.exists) return { exists: false };
    return { exists: true, modifiedAt: info.modificationTime };
  } catch {
    return { exists: false };
  }
}

/* -------------------------------------------------------------------------- */
/*                                  importing                                 */
/* -------------------------------------------------------------------------- */

export interface ImportSummary {
  projects: number;
  tasks: number;
  tags: number;
  habits: number;
  habitLogs: number;
  skipped: number;
}

/**
 * Validates a parsed bundle. Import must never half-apply: either the file has
 * the shape we wrote, or nothing changes.
 */
export function validateBundle(raw: unknown): { ok: true; bundle: BackupBundle } | { ok: false; reason: string } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'Not a TaskFlow backup file.' };
  const candidate = raw as Partial<BackupBundle>;
  if (!Array.isArray(candidate.tasks)) return { ok: false, reason: 'The file has no task list.' };
  if (!Array.isArray(candidate.projects)) return { ok: false, reason: 'The file has no list data.' };

  return {
    ok: true,
    bundle: {
      version: 1,
      exportedAt: typeof candidate.exportedAt === 'string' ? candidate.exportedAt : nowIso(),
      appVersion: typeof candidate.appVersion === 'string' ? candidate.appVersion : 'unknown',
      projects: candidate.projects as Project[],
      tasks: candidate.tasks.map((task) => ({ ...task, tagIds: task.tagIds ?? [] })),
      tags: Array.isArray(candidate.tags) ? (candidate.tags as Tag[]) : [],
      habits: Array.isArray(candidate.habits) ? (candidate.habits as Habit[]) : [],
      habitLogs: Array.isArray(candidate.habitLogs) ? (candidate.habitLogs as HabitLog[]) : [],
    },
  };
}

/**
 * Applies a bundle. Rows are upserted by id, so importing your own export is a
 * no-op and importing a merge from another phone adds what is missing instead of
 * wiping what is here (`INSERT OR IGNORE` for existing ids).
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

  await db.withTransactionAsync(async () => {
    for (const project of bundle.projects) {
      await db.runAsync(
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
      summary.projects += 1;
    }

    for (const tag of bundle.tags) {
      await db.runAsync(
        `INSERT OR IGNORE INTO tags (id, name, color, created_at, updated_at, sync_state)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [tag.id, tag.name, tag.color, tag.createdAt, tag.updatedAt],
      );
      summary.tags += 1;
    }

    for (const task of bundle.tasks) {
      await db.runAsync(
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
      for (const tagId of task.tagIds ?? []) {
        await db.runAsync('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)', [
          task.id,
          tagId,
        ]);
      }
      summary.tasks += 1;
    }

    for (const habit of bundle.habits) {
      await db.runAsync(
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
      summary.habits += 1;
    }

    for (const log of bundle.habitLogs) {
      await db.runAsync(
        `INSERT OR IGNORE INTO habit_logs (id, habit_id, date_key, count, created_at, sync_state)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [log.id, log.habitId, log.dateKey, log.count, log.createdAt],
      );
      summary.habitLogs += 1;
    }
  });

  return summary;
}

/** Parses + validates + applies, returning a human-readable summary line. */
export async function importFromJsonText(text: string): Promise<{ ok: boolean; message: string }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, message: 'That file is not valid JSON.' };
  }
  const validated = validateBundle(parsed);
  if (!validated.ok) return { ok: false, message: validated.reason };

  const summary = await importBundle(validated.bundle);
  return {
    ok: true,
    message: `Imported ${summary.tasks} tasks, ${summary.projects} lists, ${summary.tags} tags, ${summary.habits} habits (${Platform.OS}).`,
  };
}
