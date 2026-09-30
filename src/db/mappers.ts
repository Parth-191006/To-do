import type {
  Attachment,
  FocusSession,
  Habit,
  HabitLog,
  LocationReminder,
  Project,
  Recurrence,
  ScheduledNotification,
  SyncState,
  Tag,
  Task,
  TaskStatus,
  Priority,
} from '@/domain/types';

export interface TaskRow {
  id: string;
  project_id: string | null;
  parent_id: string | null;
  title: string;
  notes: string;
  status: string;
  priority: string;
  due_at: string | null;
  remind_at: string | null;
  recurrence: string | null;
  location_reminder: string | null;
  estimate_minutes: number | null;
  attachments: string;
  position: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_state: string;
}

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    projectId: row.project_id,
    parentId: row.parent_id,
    title: row.title,
    notes: row.notes ?? '',
    status: row.status as TaskStatus,
    priority: row.priority as Priority,
    dueAt: row.due_at,
    remindAt: row.remind_at,
    recurrence: parseJson<Recurrence | null>(row.recurrence, null),
    locationReminder: parseJson<LocationReminder | null>(row.location_reminder, null),
    estimateMinutes: row.estimate_minutes,
    attachments: parseJson<Attachment[]>(row.attachments, []),
    position: row.position,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    syncState: row.sync_state as SyncState,
  };
}

export function serializeRecurrence(value: Recurrence | null): string | null {
  return value ? JSON.stringify(value) : null;
}

export function serializeLocation(value: LocationReminder | null): string | null {
  return value ? JSON.stringify(value) : null;
}

export function serializeAttachments(value: Attachment[]): string {
  return JSON.stringify(value ?? []);
}

export function toProject(row: {
  id: string;
  name: string;
  color: string;
  icon: string;
  is_archived: number;
  position: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_state: string;
}): Project {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    isArchived: row.is_archived === 1,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    syncState: row.sync_state as SyncState,
  };
}

export function toTag(row: {
  id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
  sync_state: string;
}): Tag {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncState: row.sync_state as SyncState,
  };
}

export function toHabit(row: {
  id: string;
  name: string;
  color: string;
  icon: string;
  target_per_period: number;
  cadence: string;
  by_weekday: string;
  is_archived: number;
  created_at: string;
  updated_at: string;
  sync_state: string;
}): Habit {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    targetPerPeriod: row.target_per_period,
    cadence: row.cadence === 'weekly' ? 'weekly' : 'daily',
    byWeekday: parseJson<number[]>(row.by_weekday, []),
    isArchived: row.is_archived === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncState: row.sync_state as SyncState,
  };
}

export function toHabitLog(row: {
  id: string;
  habit_id: string;
  date_key: string;
  count: number;
  created_at: string;
  sync_state: string;
}): HabitLog {
  return {
    id: row.id,
    habitId: row.habit_id,
    dateKey: row.date_key,
    count: row.count,
    createdAt: row.created_at,
    syncState: row.sync_state as SyncState,
  };
}

export function toFocusSession(row: {
  id: string;
  task_id: string | null;
  project_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  kind: string;
  completed: number;
  sync_state: string;
}): FocusSession {
  return {
    id: row.id,
    taskId: row.task_id,
    projectId: row.project_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
    kind: row.kind === 'break' ? 'break' : 'focus',
    completed: row.completed === 1,
    syncState: row.sync_state as SyncState,
  };
}

export function toScheduledNotification(row: {
  id: string;
  os_identifier: string | null;
  task_id: string | null;
  habit_id: string | null;
  kind: string;
  title: string;
  body: string;
  trigger_at: string | null;
  recurrence: string | null;
  status: string;
  created_at: string;
}): ScheduledNotification {
  return {
    id: row.id,
    osIdentifier: row.os_identifier,
    taskId: row.task_id,
    habitId: row.habit_id,
    kind: row.kind as ScheduledNotification['kind'],
    title: row.title,
    body: row.body,
    triggerAt: row.trigger_at,
    recurrence: parseJson<Recurrence | null>(row.recurrence, null),
    status: row.status as ScheduledNotification['status'],
    createdAt: row.created_at,
  };
}
