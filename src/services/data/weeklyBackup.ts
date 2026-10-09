import { usePreferences } from '@/store/usePreferences';

import { isBackupDue } from './backupSchedule';
import { writeWeeklyBackup } from './export';

/**
 * The automatic weekly backup.
 *
 * Runs when the app is opened (there is no background worker — see
 * `./backupSchedule`) and only when the user has switched it on. It never
 * interrupts: a failure returns a reason, and Settings simply still shows the
 * previous backup's date.
 */
export type WeeklyBackupOutcome = 'disabled' | 'skipped' | 'written' | 'failed';

export async function runWeeklyBackupIfDue(now: number = Date.now()): Promise<WeeklyBackupOutcome> {
  const { weeklyBackup, lastBackupAt } = usePreferences.getState();
  if (!weeklyBackup) return 'disabled';
  if (!isBackupDue(lastBackupAt, now)) return 'skipped';
  return runWeeklyBackupNow();
}

/** Ignores the due check — the "Back up now" button. */
export async function runWeeklyBackupNow(): Promise<WeeklyBackupOutcome> {
  const name = await writeWeeklyBackup().catch(() => null);
  if (!name) return 'failed';
  usePreferences.getState().markBackupDone(new Date().toISOString());
  return 'written';
}
