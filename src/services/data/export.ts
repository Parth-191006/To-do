// SDK 57 ships two file APIs: the new `File`/`Directory` classes at the package
// root, and the string-URI API under `/legacy`. The legacy surface is the one
// that matches this module's needs (write a string, stat a path, get a
// `documentDirectory`), and it is what `expo-sharing` expects a URI from.
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { listAllHabitLogs, listHabits } from '@/db/repositories/habits';
import { listProjects } from '@/db/repositories/projects';
import { listTags } from '@/db/repositories/tags';
import { listTasks } from '@/db/repositories/tasks';
import { nowIso } from '@/utils/id';

import { backupFileNameFor, prunePlan } from './backupSchedule';
import {
  BACKUP_FILENAME,
  BACKUP_VERSION,
  serializeBackup,
  tasksToCsv,
  type BackupBundle,
} from './backupFormat';

/**
 * Export, backup and restore — the file half.
 *
 * Settings offered a "Reset local data" button and no way to get the data out
 * first, which was a real dead end for anyone switching phones or just wanting a
 * copy. Everything here is local: a JSON snapshot (the full, re-importable
 * shape), a CSV for spreadsheets, and a rolling on-device backup that survives
 * an accidental reset.
 *
 * The format itself (validation, the version gate, the CSV writer) lives in
 * `./backupFormat`, and the write path in `./importBundle`: both are free of
 * native imports, so a plain Node test proves a round trip is lossless and that
 * re-importing creates nothing twice.
 *
 * No backend, no account, no network call.
 */

export * from './backupFormat';
export * from './importBundle';

export interface ExportResult {
  ok: boolean;
  uri?: string;
  shared?: boolean;
  reason?: string;
}

/** Directory for backups — private to the app, never auto-deleted. */
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
    version: BACKUP_VERSION,
    exportedAt: nowIso(),
    appVersion: Constants.expoConfig?.version ?? '0.0.0',
    projects,
    tasks,
    tags,
    habits,
    habitLogs,
  };
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
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Could not write the file',
    };
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

/** Writes the rolling backup and returns its path, or null if the disk refused. */
async function writeLocalFile(filename: string, contents: string): Promise<string | null> {
  const target = `${backupDir()}${filename}`;
  try {
    await FileSystem.makeDirectoryAsync(backupDir(), { intermediates: true }).catch(
      () => undefined,
    );
    await FileSystem.writeAsStringAsync(target, contents);
    return target;
  } catch {
    return null;
  }
}

export async function exportJson(): Promise<ExportResult> {
  const bundle = await buildBackup();
  return writeAndShare(
    BACKUP_FILENAME,
    serializeBackup(bundle),
    'application/json',
    'Export TaskFlow data',
  );
}

export async function exportCsv(): Promise<ExportResult> {
  const [tasks, tags] = await Promise.all([
    listTasks({ status: 'all', includeCompleted: true }),
    listTags(),
  ]);
  const names = new Map(tags.map((tag) => [tag.id, tag.name]));
  return writeAndShare(
    'taskflow-tasks.csv',
    tasksToCsv(tasks, names),
    'text/csv',
    'Export tasks as CSV',
  );
}

/**
 * Writes the rolling backup. Called after every mutation batch from the store,
 * and before a reset — so "clear my data" can always be undone.
 */
export async function writeLocalBackup(): Promise<string | null> {
  const bundle = await buildBackup();
  return writeLocalFile(BACKUP_FILENAME, serializeBackup(bundle));
}

/**
 * Writes one dated copy for the weekly automatic backup and prunes the old ones.
 *
 * A dated file rather than the rolling one, so a bad week does not overwrite the
 * good copy a user might still need. Returns the file name, or null on failure.
 *
 * **Trade-off, stated plainly:** this lands in the app's own folder. Writing into
 * the phone's *shared* storage without asking is not possible from Expo without
 * a heavier dependency (the Storage Access Framework, or a media library), and
 * popping the share sheet every week would be worse than not backing up at all.
 * So the automatic copy is local and pruned; the share sheet is still one tap
 * away in Settings for a copy somewhere else.
 */
export async function writeWeeklyBackup(): Promise<string | null> {
  const bundle = await buildBackup();
  const name = backupFileNameFor();
  const written = await writeLocalFile(name, serializeBackup(bundle));
  if (!written) return null;

  try {
    const files = await FileSystem.readDirectoryAsync(backupDir());
    for (const stale of prunePlan(files)) {
      await FileSystem.deleteAsync(`${backupDir()}${stale}`, { idempotent: true }).catch(
        () => undefined,
      );
    }
  } catch {
    // Pruning is housekeeping; the new backup is already on disk.
  }
  return name;
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

/** Reads the rolling backup back as text (the restore button). */
export async function readLocalBackupText(): Promise<string | null> {
  try {
    return await FileSystem.readAsStringAsync(`${backupDir()}${BACKUP_FILENAME}`);
  } catch {
    return null;
  }
}
