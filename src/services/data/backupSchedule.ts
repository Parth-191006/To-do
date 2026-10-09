/**
 * When the automatic backup runs, and which dated copies survive.
 *
 * Pure on purpose: "has a week passed?" and "which files do we delete?" are the
 * two decisions that can quietly destroy data, so they are testable without a
 * device, a clock or a file system.
 *
 * The app has no background worker (a weekly timer that wakes a phone to write a
 * file the user cannot see is not worth the battery), so the check runs when the
 * app is opened: due once seven days have passed since the last one.
 */

export const BACKUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/** How many dated copies to keep. Four weeks is a month of undo. */
export const BACKUP_KEEP = 4;

export const WEEKLY_BACKUP_PREFIX = 'taskflow-backup-';

/** True when a backup is due — including the first run, which has no stamp. */
export function isBackupDue(lastBackupAt: string | null, now: number): boolean {
  if (!lastBackupAt) return true;
  const last = Date.parse(lastBackupAt);
  if (Number.isNaN(last)) return true;
  // A clock that moved backwards (timezone change, manual set) must not park
  // backups in the future forever: treat it as due.
  if (last > now) return true;
  return now - last >= BACKUP_INTERVAL_MS;
}

/** `taskflow-backup-2026-10-09.json` — the local date, not a timestamp. */
export function backupFileNameFor(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${WEEKLY_BACKUP_PREFIX}${year}-${month}-${day}.json`;
}

/**
 * Which dated backups to delete, oldest first.
 *
 * Only files this app wrote are considered: anything else in the backup
 * directory is left alone, and a directory holding fewer than `keep` copies
 * loses nothing.
 */
export function prunePlan(files: string[], keep: number = BACKUP_KEEP): string[] {
  const ours = files
    .filter((name) => name.startsWith(WEEKLY_BACKUP_PREFIX) && name.endsWith('.json'))
    .sort();
  if (ours.length <= keep) return [];
  return ours.slice(0, ours.length - keep);
}
