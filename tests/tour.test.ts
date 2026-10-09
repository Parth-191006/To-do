import { describe, expect, it } from 'vitest';

import { TOUR_STEPS, clampStep, formatStepLabel, primaryActionLabel } from '@/domain/tour';
import {
  BACKUP_INTERVAL_MS,
  BACKUP_KEEP,
  backupFileNameFor,
  isBackupDue,
  prunePlan,
} from '@/services/data/backupSchedule';

/**
 * Two small content/scheduling contracts.
 *
 * The tour is the first thing a new install shows, and the backup schedule is
 * the one thing that deletes files: both are cheap to get subtly wrong, and both
 * are pure, so they are pinned here.
 */
describe('first-run tour', () => {
  it('has steps, each with copy to show', () => {
    expect(TOUR_STEPS.length).toBeGreaterThanOrEqual(3);
    for (const step of TOUR_STEPS) {
      expect(step.id.length).toBeGreaterThan(0);
      expect(step.icon.length).toBeGreaterThan(0);
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body.length).toBeGreaterThan(40);
    }
  });

  it('uses unique ids', () => {
    expect(new Set(TOUR_STEPS.map((step) => step.id)).size).toBe(TOUR_STEPS.length);
  });

  it('never lets the pager fall off either end', () => {
    expect(clampStep(-3)).toBe(0);
    expect(clampStep(0)).toBe(0);
    expect(clampStep(TOUR_STEPS.length + 5)).toBe(TOUR_STEPS.length - 1);
    expect(clampStep(Number.NaN)).toBe(0);
    expect(clampStep(0, 0)).toBe(0);
  });

  it('labels the last step as the one that starts the app', () => {
    expect(formatStepLabel(0)).toBe(`Step 1 of ${TOUR_STEPS.length}`);
    expect(primaryActionLabel(0)).toBe('Next');
    expect(primaryActionLabel(TOUR_STEPS.length - 1)).toBe('Start using TaskFlow');
    expect(primaryActionLabel(99)).toBe('Start using TaskFlow');
  });
});

describe('weekly backup schedule', () => {
  const NOW = Date.parse('2026-10-09T09:00:00.000Z');

  it('is due the first time, and after a week', () => {
    expect(isBackupDue(null, NOW)).toBe(true);
    expect(isBackupDue('nonsense', NOW)).toBe(true);
    expect(isBackupDue(new Date(NOW - BACKUP_INTERVAL_MS).toISOString(), NOW)).toBe(true);
    expect(isBackupDue(new Date(NOW - BACKUP_INTERVAL_MS + 1).toISOString(), NOW)).toBe(false);
  });

  it('does not park backups in the future when the clock moves backwards', () => {
    expect(isBackupDue(new Date(NOW + 60_000).toISOString(), NOW)).toBe(true);
  });

  it('names the file after the local date', () => {
    expect(backupFileNameFor(new Date(2026, 9, 9))).toBe('taskflow-backup-2026-10-09.json');
    expect(backupFileNameFor(new Date(2026, 0, 3))).toBe('taskflow-backup-2026-01-03.json');
  });

  it('deletes only its own oldest files, and keeps four', () => {
    const own = [
      'taskflow-backup-2026-09-18.json',
      'taskflow-backup-2026-09-25.json',
      'taskflow-backup-2026-10-02.json',
      'taskflow-backup-2026-10-09.json',
    ];
    expect(prunePlan(own)).toEqual([]);
    expect(prunePlan([...own, 'taskflow-backup-2026-10-16.json'])).toEqual([
      'taskflow-backup-2026-09-18.json',
    ]);
    // Anything this app did not write is left alone.
    expect(prunePlan([...own, 'taskflow-backup.json', 'holiday-photo.jpg'])).toEqual([]);
    expect(prunePlan([...own, 'taskflow-backup-2026-10-16.json', 'notes.txt'])).toHaveLength(1);
    expect(BACKUP_KEEP).toBe(4);
  });
});
