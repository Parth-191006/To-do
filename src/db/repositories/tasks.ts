import type { Priority, Task, TaskStatus, TaskWithTags } from '@/domain/types';
import { createId, nowIso } from '@/utils/id';

import { getDatabase } from '../client';
import { buildFtsQuery, shouldUseFts } from '../fts';
import {
  serializeAttachments,
  serializeLocation,
  serializeRecurrence,
  toTask,
  type TaskRow,
} from '../mappers';
import {
  changedFields,
  MERGEABLE_TASK_FIELDS,
  parseFieldMeta,
  stampFields,
} from '@/services/sync/merge';

export interface TaskFilters {
  projectId?: string | null;
  parentId?: string | null;
  /** Pass 'all' to ignore status filtering. */
  status?: TaskStatus[] | 'all';
  includeCompleted?: boolean;
  tagId?: string;
  search?: string;
}

export type TaskDraft = Partial<
  Pick<
    Task,
    | 'projectId'
    | 'parentId'
    | 'title'
    | 'notes'
    | 'status'
    | 'priority'
    | 'dueAt'
    | 'remindAt'
    | 'recurrence'
    | 'locationReminder'
    | 'estimateMinutes'
    | 'attachments'
    | 'position'
  >
> & { tagIds?: string[] };

async function attachTags(tasks: Task[]): Promise<TaskWithTags[]> {
  if (tasks.length === 0) return [];
  const db = await getDatabase();
  const placeholders = tasks.map(() => '?').join(',');
  const rows = await db.getAllAsync<{ task_id: string; tag_id: string }>(
    `SELECT task_id, tag_id FROM task_tags WHERE task_id IN (${placeholders})`,
    tasks.map((t) => t.id),
  );
  const byTask = new Map<string, string[]>();
  for (const row of rows) {
    const list = byTask.get(row.task_id) ?? [];
    list.push(row.tag_id);
    byTask.set(row.task_id, list);
  }
  return tasks.map((task) => ({ ...task, tagIds: byTask.get(task.id) ?? [] }));
}

export async function listTasks(filters: TaskFilters = {}): Promise<TaskWithTags[]> {
  const db = await getDatabase();
  const where: string[] = ['t.deleted_at IS NULL'];
  const params: (string | number)[] = [];

  if (filters.projectId !== undefined) {
    if (filters.projectId === null) {
      where.push('t.project_id IS NULL');
    } else {
      where.push('t.project_id = ?');
      params.push(filters.projectId);
    }
  }

  if (filters.parentId !== undefined) {
    if (filters.parentId === null) {
      where.push('t.parent_id IS NULL');
    } else {
      where.push('t.parent_id = ?');
      params.push(filters.parentId);
    }
  }

  if (filters.status && filters.status !== 'all') {
    where.push(`t.status IN (${filters.status.map(() => '?').join(',')})`);
    params.push(...filters.status);
  } else if (!filters.includeCompleted) {
    where.push("t.status != 'archived'");
  }

  if (filters.tagId) {
    where.push('EXISTS (SELECT 1 FROM task_tags tt WHERE tt.task_id = t.id AND tt.tag_id = ?)');
    params.push(filters.tagId);
  }

  if (filters.search) {
    where.push('(t.title LIKE ? OR t.notes LIKE ?)');
    const like = `%${filters.search}%`;
    params.push(like, like);
  }

  const sql = `
    SELECT t.* FROM tasks t
    WHERE ${where.join(' AND ')}
    ORDER BY
      CASE t.status WHEN 'done' THEN 1 ELSE 0 END,
      COALESCE(t.due_at, '9999-12-31') ASC,
      t.position ASC,
      t.created_at ASC
  `;

  const rows = await db.getAllAsync<TaskRow>(sql, params);
  return attachTags(rows.map(toTask));
}

export async function getTask(id: string): Promise<TaskWithTags | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<TaskRow>('SELECT * FROM tasks WHERE id = ?', [id]);
  if (!row) return null;
  const [withTags] = await attachTags([toTask(row)]);
  return withTags ?? null;
}

/** All descendants of a task, breadth-first, for nested subtask rendering. */
export async function getTaskTree(rootId: string): Promise<TaskWithTags[]> {
  const db = await getDatabase();
  const all: Task[] = [];
  let frontier = [rootId];
  while (frontier.length > 0) {
    const placeholders = frontier.map(() => '?').join(',');
    const rows = await db.getAllAsync<TaskRow>(
      `SELECT * FROM tasks WHERE parent_id IN (${placeholders}) AND deleted_at IS NULL
       ORDER BY position ASC, created_at ASC`,
      frontier,
    );
    const mapped = rows.map(toTask);
    all.push(...mapped);
    frontier = mapped.map((t) => t.id);
  }
  return attachTags(all);
}

async function nextPosition(parentId: string | null, projectId: string | null): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ max_position: number | null }>(
    parentId
      ? 'SELECT MAX(position) as max_position FROM tasks WHERE parent_id = ?'
      : 'SELECT MAX(position) as max_position FROM tasks WHERE parent_id IS NULL AND project_id IS ?',
    [parentId ?? projectId],
  );
  return (row?.max_position ?? 0) + 1;
}

export async function createTask(draft: TaskDraft): Promise<TaskWithTags> {
  const db = await getDatabase();
  const now = nowIso();
  const id = createId('task_');
  const position =
    draft.position ?? (await nextPosition(draft.parentId ?? null, draft.projectId ?? null));

  const task: Task = {
    id,
    projectId: draft.projectId ?? null,
    parentId: draft.parentId ?? null,
    title: (draft.title ?? '').trim() || 'Untitled task',
    notes: draft.notes ?? '',
    status: draft.status ?? 'todo',
    priority: (draft.priority ?? 'none') as Priority,
    dueAt: draft.dueAt ?? null,
    remindAt: draft.remindAt ?? null,
    recurrence: draft.recurrence ?? null,
    locationReminder: draft.locationReminder ?? null,
    estimateMinutes: draft.estimateMinutes ?? null,
    attachments: draft.attachments ?? [],
    position,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    syncState: 'pending',
  };

  // A brand-new row is "written" by this device in every field, so stamp them
  // all. That is what lets a later remote edit merge field by field instead of
  // treating the whole row as one indivisible unit.
  const fieldMeta = stampFields({}, [...MERGEABLE_TASK_FIELDS], now);

  await db.runAsync(
    `INSERT INTO tasks (
       id, project_id, parent_id, title, notes, status, priority, due_at, remind_at,
       recurrence, location_reminder, estimate_minutes, attachments, position,
       completed_at, created_at, updated_at, deleted_at, sync_state, field_meta
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending', ?)`,
    [
      task.id,
      task.projectId,
      task.parentId,
      task.title,
      task.notes,
      task.status,
      task.priority,
      task.dueAt,
      task.remindAt,
      serializeRecurrence(task.recurrence),
      serializeLocation(task.locationReminder),
      task.estimateMinutes,
      serializeAttachments(task.attachments),
      task.position,
      task.completedAt,
      task.createdAt,
      task.updatedAt,
      JSON.stringify(fieldMeta),
    ],
  );

  if (draft.tagIds?.length) {
    for (const tagId of draft.tagIds) {
      await db.runAsync('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)', [
        task.id,
        tagId,
      ]);
    }
  }

  const created = await getTask(task.id);
  if (!created) throw new Error('Failed to create task');
  return created;
}

export async function updateTask(id: string, patch: TaskDraft): Promise<TaskWithTags | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<TaskRow & { field_meta?: string }>(
    'SELECT * FROM tasks WHERE id = ?',
    [id],
  );
  if (!row) return null;
  const existing = toTask(row);

  const merged: Task = { ...existing, ...patch, updatedAt: nowIso() };

  // Only the fields this edit actually touched are stamped, so a later remote
  // write to a *different* field still wins.
  const touched = changedFields(
    row as unknown as Record<string, unknown>,
    {
      project_id: merged.projectId,
      parent_id: merged.parentId,
      title: merged.title,
      notes: merged.notes,
      status: merged.status,
      priority: merged.priority,
      due_at: merged.dueAt,
      remind_at: merged.remindAt,
      recurrence: merged.recurrence,
      location_reminder: merged.locationReminder,
      estimate_minutes: merged.estimateMinutes,
      attachments: merged.attachments,
      position: merged.position,
      completed_at: merged.completedAt,
      deleted_at: merged.deletedAt,
    },
  );
  const fieldMeta = stampFields(parseFieldMeta(row.field_meta), touched, merged.updatedAt);

  await db.runAsync(
    `UPDATE tasks SET
       project_id = ?, parent_id = ?, title = ?, notes = ?, status = ?, priority = ?,
       due_at = ?, remind_at = ?, recurrence = ?, location_reminder = ?,
       estimate_minutes = ?, attachments = ?, position = ?, updated_at = ?,
       sync_state = 'pending', field_meta = ?
     WHERE id = ?`,
    [
      merged.projectId,
      merged.parentId,
      merged.title,
      merged.notes,
      merged.status,
      merged.priority,
      merged.dueAt,
      merged.remindAt,
      serializeRecurrence(merged.recurrence),
      serializeLocation(merged.locationReminder),
      merged.estimateMinutes,
      serializeAttachments(merged.attachments),
      merged.position,
      merged.updatedAt,
      JSON.stringify(fieldMeta),
      id,
    ],
  );

  if (patch.tagIds) {
    await db.runAsync('DELETE FROM task_tags WHERE task_id = ?', [id]);
    for (const tagId of patch.tagIds) {
      await db.runAsync('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)', [
        id,
        tagId,
      ]);
    }
  }

  return getTask(id);
}

export async function setTaskStatus(id: string, status: TaskStatus): Promise<void> {
  const db = await getDatabase();
  const completedAt = status === 'done' ? nowIso() : null;
  await db.runAsync(
    `UPDATE tasks SET status = ?, completed_at = ?, updated_at = ?, sync_state = 'pending'
     WHERE id = ?`,
    [status, completedAt, nowIso(), id],
  );
}

/** Toggles done/todo and cascades completion to child subtasks. */
export async function toggleTaskComplete(id: string): Promise<TaskStatus> {
  const db = await getDatabase();
  const current = await db.getFirstAsync<{ status: string }>(
    'SELECT status FROM tasks WHERE id = ?',
    [id],
  );
  const next: TaskStatus = current?.status === 'done' ? 'todo' : 'done';
  const now = nowIso();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE tasks SET status = ?, completed_at = ?, updated_at = ?, sync_state = 'pending'
       WHERE id = ?`,
      [next, next === 'done' ? now : null, now, id],
    );
    if (next === 'done') {
      await db.runAsync(
        `UPDATE tasks SET status = 'done', completed_at = ?, updated_at = ?, sync_state = 'pending'
         WHERE parent_id = ? AND deleted_at IS NULL`,
        [now, now, id],
      );
    }
  });

  return next;
}

export async function softDeleteTask(id: string): Promise<void> {
  const db = await getDatabase();
  const now = nowIso();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE tasks SET deleted_at = ?, updated_at = ?, sync_state = 'pending' WHERE id = ?`,
      [now, now, id],
    );
    // Cascade the soft delete down the subtask tree.
    let frontier = [id];
    while (frontier.length > 0) {
      const placeholders = frontier.map(() => '?').join(',');
      const children = await db.getAllAsync<{ id: string }>(
        `SELECT id FROM tasks WHERE parent_id IN (${placeholders}) AND deleted_at IS NULL`,
        frontier,
      );
      if (children.length === 0) break;
      await db.runAsync(
        `UPDATE tasks SET deleted_at = ?, updated_at = ?, sync_state = 'pending'
         WHERE id IN (${children.map(() => '?').join(',')})`,
        [now, now, ...children.map((c) => c.id)],
      );
      frontier = children.map((c) => c.id);
    }
  });
}

/**
 * Full-text search over titles and notes.
 *
 * Primary path is the `tasks_fts` FTS5 index (prefix-matched, so it keeps up
 * with a user typing). Two fallbacks keep it honest:
 *
 *  - short queries go straight to LIKE — a two-character prefix matches nearly
 *    every row, so the index buys nothing;
 *  - when the index returns nothing we retry with LIKE, which also catches
 *    infix matches (searching "ilk" still finds "milk"), something FTS5's
 *    token model cannot do.
 */
/**
 * Reverses {@link softDeleteTask}: clears `deleted_at` down the whole subtree.
 * Powers the swipe-to-delete undo, so the restore must be as complete as the
 * delete was.
 */
export async function restoreTask(id: string): Promise<void> {
  const db = await getDatabase();
  const now = nowIso();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE tasks SET deleted_at = NULL, updated_at = ?, sync_state = 'pending' WHERE id = ?`,
      [now, id],
    );
    let frontier = [id];
    while (frontier.length > 0) {
      const placeholders = frontier.map(() => '?').join(',');
      const children = await db.getAllAsync<{ id: string }>(
        `SELECT id FROM tasks WHERE parent_id IN (${placeholders}) AND deleted_at IS NOT NULL`,
        frontier,
      );
      if (children.length === 0) break;
      await db.runAsync(
        `UPDATE tasks SET deleted_at = NULL, updated_at = ?, sync_state = 'pending'
         WHERE id IN (${children.map(() => '?').join(',')})`,
        [now, ...children.map((c) => c.id)],
      );
      frontier = children.map((c) => c.id);
    }
  });
}

export async function searchTasks(query: string, limit = 25): Promise<TaskWithTags[]> {
  const db = await getDatabase();
  const trimmed = query.trim();
  if (!trimmed) return [];

  const ftsQuery = shouldUseFts(trimmed) ? buildFtsQuery(trimmed) : null;
  if (ftsQuery) {
    try {
      // `rank` orders by FTS5's bm25 score (most relevant first).
      const rows = await db.getAllAsync<TaskRow>(
        `SELECT t.* FROM tasks_fts f
         JOIN tasks t ON t.rowid = f.rowid
         WHERE tasks_fts MATCH ? AND t.deleted_at IS NULL
         ORDER BY rank LIMIT ?`,
        [ftsQuery, limit],
      );
      if (rows.length > 0) return attachTags(rows.map(toTask));
    } catch {
      // Malformed expression for this SQLite build — fall through to LIKE.
    }
  }

  const rows = await db.getAllAsync<TaskRow>(
    `SELECT t.* FROM tasks t
     WHERE t.deleted_at IS NULL AND (t.title LIKE ? OR t.notes LIKE ?)
     ORDER BY t.updated_at DESC LIMIT ?`,
    [`%${trimmed}%`, `%${trimmed}%`, limit],
  );
  return attachTags(rows.map(toTask));
}

export async function countOpenTasks(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM tasks WHERE deleted_at IS NULL AND status NOT IN ('done','archived')",
  );
  return row?.count ?? 0;
}


