import type { Habit, HabitLog, Project, Tag, TaskWithTags } from '@/domain/types';

/**
 * The backup *format* — everything about an export or an import that does not
 * touch the disk or the database.
 *
 * Keeping it pure is what makes a backup trustworthy: validation, the version
 * gate, the dry-run count and the CSV writer can all be tested without a device,
 * and a file that fails validation can never half-apply.
 */

/** Bumped only when the file shape changes in a way older builds cannot read. */
export const BACKUP_VERSION = 1;

export interface BackupBundle {
  version: number;
  exportedAt: string;
  appVersion: string;
  projects: Project[];
  tasks: TaskWithTags[];
  tags: Tag[];
  habits: Habit[];
  habitLogs: HabitLog[];
}

export const BACKUP_FILENAME = 'taskflow-backup.json';

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
/*                                 validation                                 */
/* -------------------------------------------------------------------------- */

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Validates a parsed bundle.
 *
 * The version gate is the important half: a file written by a *newer* build can
 * contain fields this one would silently drop, so it is refused with an
 * explanation rather than imported into something subtly lossy. There is no
 * upper limit on what a future version may add — only on what this one claims to
 * understand.
 */
export function validateBundle(
  raw: unknown,
): { ok: true; bundle: BackupBundle } | { ok: false; reason: string } {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, reason: 'Not a TaskFlow backup file.' };
  }

  const candidate = raw as Partial<BackupBundle> & Record<string, unknown>;
  const version = typeof candidate.version === 'number' ? candidate.version : BACKUP_VERSION;

  if (!Number.isFinite(version) || version < 1) {
    return { ok: false, reason: 'The file does not declare a usable backup version.' };
  }
  if (version > BACKUP_VERSION) {
    return {
      ok: false,
      reason: `This backup was written by a newer version of TaskFlow (format ${version}; this build reads ${BACKUP_VERSION}). Update the app, then import it again.`,
    };
  }

  if (!Array.isArray(candidate.projects)) {
    return { ok: false, reason: 'The file has no list data.' };
  }
  if (!Array.isArray(candidate.tasks)) {
    return { ok: false, reason: 'The file has no task list.' };
  }

  const tasks = candidate.tasks as Partial<TaskWithTags>[];
  for (let index = 0; index < tasks.length; index += 1) {
    const task = tasks[index];
    if (typeof task?.id !== 'string' || task.id.length === 0) {
      return { ok: false, reason: `Task ${index + 1} has no id, so it cannot be matched up.` };
    }
    if (typeof task.title !== 'string' || task.title.trim().length === 0) {
      return { ok: false, reason: `Task ${index + 1} has no title.` };
    }
  }
  const projects = candidate.projects as Partial<Project>[];
  for (let index = 0; index < projects.length; index += 1) {
    if (typeof projects[index]?.id !== 'string' || typeof projects[index]?.name !== 'string') {
      return { ok: false, reason: `List ${index + 1} is missing its id or name.` };
    }
  }

  return {
    ok: true,
    bundle: {
      version,
      exportedAt: typeof candidate.exportedAt === 'string' ? candidate.exportedAt : '',
      appVersion: typeof candidate.appVersion === 'string' ? candidate.appVersion : 'unknown',
      projects: projects as Project[],
      tasks: tasks.map((task) => ({ ...task, tagIds: task.tagIds ?? [] })) as TaskWithTags[],
      tags: asArray<Tag>(candidate.tags),
      habits: asArray<Habit>(candidate.habits),
      habitLogs: asArray<HabitLog>(candidate.habitLogs),
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                              the dry run                                   */
/* -------------------------------------------------------------------------- */

export interface ImportCounts {
  projects: number;
  tasks: number;
  tags: number;
  habits: number;
  habitLogs: number;
}

export interface ExistingIds {
  projects: Set<string>;
  tasks: Set<string>;
  tags: Set<string>;
  habits: Set<string>;
  habitLogs: Set<string>;
}

export interface ImportPlan {
  /** Rows that would be inserted. */
  newCounts: ImportCounts;
  /** Rows already on this device (or repeated inside the file) — left alone. */
  existing: number;
  totalNew: number;
}

function classify<T extends { id?: string }>(
  rows: T[],
  known: Set<string>,
): { fresh: number; present: number } {
  let fresh = 0;
  let present = 0;
  const seen = new Set(known);
  for (const row of rows) {
    const id = String(row.id ?? '');
    if (id && seen.has(id)) {
      present += 1;
      continue;
    }
    if (id) seen.add(id);
    fresh += 1;
  }
  return { fresh, present };
}

/**
 * Works out what an import would actually change, without changing anything.
 *
 * Import is `INSERT OR IGNORE` by id, so "nothing happens twice" is already
 * true — but the user pressing Import deserves to know *before* it runs whether
 * the file holds new work or is the same backup they imported last week.
 */
export function planImport(bundle: BackupBundle, existing: ExistingIds): ImportPlan {
  const projects = classify(bundle.projects, existing.projects);
  const tasks = classify(bundle.tasks, existing.tasks);
  const tags = classify(bundle.tags, existing.tags);
  const habits = classify(bundle.habits, existing.habits);
  const habitLogs = classify(bundle.habitLogs, existing.habitLogs);

  const newCounts: ImportCounts = {
    projects: projects.fresh,
    tasks: tasks.fresh,
    tags: tags.fresh,
    habits: habits.fresh,
    habitLogs: habitLogs.fresh,
  };

  return {
    newCounts,
    existing: projects.present + tasks.present + tags.present + habits.present + habitLogs.present,
    totalNew:
      newCounts.projects + newCounts.tasks + newCounts.tags + newCounts.habits + newCounts.habitLogs,
  };
}

/** `1 task`, `3 tasks`. */
function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function joinParts(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** One line the user can act on, e.g. "Adds 12 tasks and 3 lists; 4 are already here." */
export function formatImportPlan(plan: ImportPlan): string {
  if (plan.totalNew === 0) {
    return plan.existing > 0
      ? `Nothing new — all ${plural(plan.existing, 'item')} here are already on this device.`
      : 'Nothing to import — the file has no tasks, lists, tags or habits.';
  }

  const parts = (
    [
      [plan.newCounts.tasks, 'task'],
      [plan.newCounts.projects, 'list'],
      [plan.newCounts.tags, 'tag'],
      [plan.newCounts.habits, 'habit'],
      [plan.newCounts.habitLogs, 'habit check-in'],
    ] as [number, string][]
  )
    .filter(([count]) => count > 0)
    .map(([count, noun]) => plural(count, noun));

  const head = `Adds ${joinParts(parts)}`;
  return plan.existing > 0
    ? `${head}; ${plural(plan.existing, 'item')} already here, kept as they are.`
    : `${head}.`;
}
