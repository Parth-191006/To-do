/**
 * Export / import suite.
 *
 * A backup is only worth having if it comes *back*: the same tasks, the same
 * lists, the same habit check-ins, and importing the same file twice must not
 * double anything. The format half (`./backupFormat`) is pure and tested
 * directly; the write half (`./importBundle`) runs against the same throwaway
 * SQLite database the sync suite uses.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BackupBundle } from '@/services/data/backupFormat';

vi.mock('@/db/client', async () => {
  const { harness } = await import('./support/syncHarness');
  return { getDatabase: async () => harness.adapter };
});

const {
  BACKUP_VERSION,
  csvCell,
  formatImportPlan,
  planImport,
  serializeBackup,
  tasksToCsv,
  TASK_CSV_HEADER,
  validateBundle,
} = await import('@/services/data/backupFormat');
const { importBundle, importFromJsonText, previewImport } = await import(
  '@/services/data/importBundle'
);
const { harness } = await import('./support/syncHarness');

const AT = '2026-10-04T10:00:00.000Z';

afterAll(() => {
  harness.drop();
});

beforeEach(() => {
  harness.reset();
});

function fixture(): BackupBundle {
  return {
    version: BACKUP_VERSION,
    exportedAt: AT,
    appVersion: '1.2.3',
    projects: [
      {
        id: 'project_1',
        name: 'Work',
        color: '#0D9488',
        icon: 'folder',
        isArchived: false,
        position: 0,
        createdAt: AT,
        updatedAt: AT,
        deletedAt: null,
        syncState: 'pending',
      },
    ],
    tags: [{ id: 'tag_1', name: 'urgent', color: '#F43F5E', createdAt: AT, updatedAt: AT, syncState: 'pending' }],
    tasks: [
      {
        id: 'task_1',
        projectId: 'project_1',
        parentId: null,
        title: 'Write "the" report, carefully',
        notes: 'line one\nline two',
        status: 'todo',
        priority: 'high',
        dueAt: AT,
        remindAt: null,
        recurrence: null,
        locationReminder: null,
        estimateMinutes: 45,
        attachments: [],
        position: 1,
        completedAt: null,
        createdAt: AT,
        updatedAt: AT,
        deletedAt: null,
        syncState: 'pending',
        tagIds: ['tag_1'],
      },
    ],
    habits: [
      {
        id: 'habit_1',
        name: 'Read',
        color: '#10B981',
        icon: 'flame',
        targetPerPeriod: 1,
        cadence: 'daily',
        byWeekday: [],
        reminderHour: 8,
        reminderMinute: 30,
        isArchived: false,
        createdAt: AT,
        updatedAt: AT,
        syncState: 'pending',
      },
    ],
    habitLogs: [
      { id: 'log_1', habitId: 'habit_1', dateKey: '2026-10-04', count: 1, createdAt: AT, syncState: 'pending' },
    ],
  };
}

function count(table: string): number {
  const row = harness.db.prepare(`SELECT COUNT(*) as n FROM ${table}`).get() as { n: number };
  return Number(row.n);
}

describe('backup format', () => {
  it('ships a version this build reads', () => {
    const result = validateBundle(fixture());
    expect(result.ok).toBe(true);
  });

  it('refuses a file written by a newer build, with an explanation', () => {
    const result = validateBundle({ ...fixture(), version: BACKUP_VERSION + 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('newer version of TaskFlow');
      expect(result.reason).toContain(`format ${BACKUP_VERSION + 1}`);
    }
  });

  it('accepts a file that predates the version field, as version 1', () => {
    const { version, ...legacy } = fixture();
    void version;
    const result = validateBundle(legacy);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bundle.version).toBe(BACKUP_VERSION);
  });

  it('refuses a task with no title, naming it', () => {
    const bundle = fixture();
    const result = validateBundle({
      ...bundle,
      tasks: [{ ...bundle.tasks[0], title: '   ' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('Task 1 has no title.');
  });

  it('refuses something that is not a backup at all', () => {
    expect(validateBundle({ hello: 'world' }).ok).toBe(false);
    expect(validateBundle(null).ok).toBe(false);
    expect(validateBundle('{').ok).toBe(false);
  });

  it('plans new rows against what is already on the device', () => {
    const plan = planImport(fixture(), {
      projects: new Set(['project_1']),
      tasks: new Set<string>(),
      tags: new Set(['tag_1']),
      habits: new Set<string>(),
      habitLogs: new Set<string>(),
    });
    expect(plan.newCounts).toEqual({ projects: 0, tasks: 1, tags: 0, habits: 1, habitLogs: 1 });
    expect(plan.totalNew).toBe(3);
    expect(plan.existing).toBe(2);
    expect(formatImportPlan(plan)).toBe(
      'Adds 1 task, 1 habit and 1 habit check-in; 2 items already here, kept as they are.',
    );
  });

  it('says plainly when there is nothing to do', () => {
    const bundle = fixture();
    const plan = planImport(bundle, {
      projects: new Set(['project_1']),
      tasks: new Set(['task_1']),
      tags: new Set(['tag_1']),
      habits: new Set(['habit_1']),
      habitLogs: new Set(['log_1']),
    });
    expect(plan.totalNew).toBe(0);
    expect(formatImportPlan(plan)).toBe('Nothing new — all 5 items here are already on this device.');
  });

  it('writes CSV that survives commas, quotes and newlines', () => {
    const bundle = fixture();
    const csv = tasksToCsv(bundle.tasks, new Map([['tag_1', 'urgent']]));
    const lines = csv.split('\n');
    expect(lines[0]).toBe(TASK_CSV_HEADER.join(','));
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('');
    // The title and the multi-line notes are quoted, so the row still has the
    // header's column count once the quoted cells are taken out of the count.
    const withoutQuoted = lines.slice(1).join('\n').replace(/"(?:[^"]|"")*"/g, 'Q');
    expect(withoutQuoted.split(',').length).toBe(TASK_CSV_HEADER.length);
  });
});

describe('import', () => {
  it('round-trips a backup into an empty database', async () => {
    const summary = await importBundle(fixture());

    expect(summary).toEqual({
      projects: 1,
      tasks: 1,
      tags: 1,
      habits: 1,
      habitLogs: 1,
      skipped: 0,
    });
    expect(count('tasks')).toBe(1);
    expect(count('projects')).toBe(1);
    expect(count('task_tags')).toBe(1);
    const task = harness.db.prepare('SELECT * FROM tasks WHERE id = ?').get('task_1') as Record<
      string,
      unknown
    >;
    expect(task.title).toBe('Write "the" report, carefully');
    expect(task.notes).toBe('line one\nline two');
    expect(task.estimate_minutes).toBe(45);
    expect(task.due_at).toBe(AT);
  });

  it('creates nothing twice when the same file is imported again', async () => {
    await importBundle(fixture());
    const second = await importBundle(fixture());

    expect(second).toEqual({
      projects: 0,
      tasks: 0,
      tags: 0,
      habits: 0,
      habitLogs: 0,
      skipped: 5,
    });
    expect(count('tasks')).toBe(1);
    expect(count('projects')).toBe(1);
    expect(count('tags')).toBe(1);
    expect(count('habits')).toBe(1);
    expect(count('habit_logs')).toBe(1);
  });

  it('reports an import that would change nothing instead of applying it blind', async () => {
    await importBundle(fixture());

    const preview = await previewImport(serializeBackup(fixture()));

    expect(preview.ok).toBe(true);
    if (preview.ok) {
      expect(preview.plan.totalNew).toBe(0);
      expect(preview.message).toBe('Nothing new — all 5 items here are already on this device.');
    }
    const result = await importFromJsonText(serializeBackup(fixture()));
    expect(result.ok).toBe(true);
    expect(result.message).toContain('already on this device');
  });

  it('imports an empty database from a file with no rows at all', async () => {
    const empty: BackupBundle = {
      version: BACKUP_VERSION,
      exportedAt: AT,
      appVersion: '1.2.3',
      projects: [],
      tags: [],
      tasks: [],
      habits: [],
      habitLogs: [],
    };
    const preview = await previewImport(serializeBackup(empty));
    expect(preview.ok).toBe(true);
    if (preview.ok) expect(preview.message).toBe('Nothing to import — the file has no tasks, lists, tags or habits.');
  });

  it('rejects malformed JSON with a message the user can act on', async () => {
    const result = await previewImport('{not json');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe('That file is not valid JSON.');
  });
});
