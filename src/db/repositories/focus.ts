import type { FocusSession } from '@/domain/types';
import { createId, nowIso, toDateKey } from '@/utils/id';

import { getDatabase } from '../client';
import { toFocusSession } from '../mappers';

export async function startFocusSession(input: {
  taskId?: string | null;
  projectId?: string | null;
  kind?: 'focus' | 'break';
}): Promise<FocusSession> {
  const db = await getDatabase();
  const session: FocusSession = {
    id: createId('focus_'),
    taskId: input.taskId ?? null,
    projectId: input.projectId ?? null,
    startedAt: nowIso(),
    endedAt: null,
    durationSeconds: 0,
    kind: input.kind ?? 'focus',
    completed: false,
    syncState: 'pending',
  };

  await db.runAsync(
    `INSERT INTO focus_sessions (id, task_id, project_id, started_at, ended_at,
       duration_seconds, kind, completed, sync_state)
     VALUES (?, ?, ?, ?, NULL, 0, ?, 0, 'pending')`,
    [session.id, session.taskId, session.projectId, session.startedAt, session.kind],
  );

  return session;
}

export async function endFocusSession(
  id: string,
  input: { durationSeconds: number; completed: boolean },
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE focus_sessions SET ended_at = ?, duration_seconds = ?, completed = ?, sync_state = 'pending'
     WHERE id = ?`,
    [nowIso(), Math.round(input.durationSeconds), input.completed ? 1 : 0, id],
  );
}

export async function listFocusSessions(sinceIso?: string): Promise<FocusSession[]> {
  const db = await getDatabase();
  const rows = sinceIso
    ? await db.getAllAsync<Parameters<typeof toFocusSession>[0]>(
        'SELECT * FROM focus_sessions WHERE started_at >= ? ORDER BY started_at DESC',
        [sinceIso],
      )
    : await db.getAllAsync<Parameters<typeof toFocusSession>[0]>(
        'SELECT * FROM focus_sessions ORDER BY started_at DESC',
      );
  return rows.map(toFocusSession);
}

export interface DailyFocusStat {
  dateKey: string;
  focusSeconds: number;
  sessions: number;
}

/** Focus minutes per local day — powers the analytics bar chart + heatmap. */
export async function focusByDay(days = 30): Promise<DailyFocusStat[]> {
  const db = await getDatabase();
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const rows = await db.getAllAsync<{ started_at: string; duration_seconds: number }>(
    `SELECT started_at, duration_seconds FROM focus_sessions
     WHERE started_at >= ? AND kind = 'focus' ORDER BY started_at ASC`,
    [since.toISOString()],
  );

  const buckets = new Map<string, DailyFocusStat>();
  for (const row of rows) {
    const key = toDateKey(row.started_at);
    const bucket = buckets.get(key) ?? { dateKey: key, focusSeconds: 0, sessions: 0 };
    bucket.focusSeconds += row.duration_seconds;
    bucket.sessions += 1;
    buckets.set(key, bucket);
  }
  return Array.from(buckets.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

export async function focusByProject(): Promise<
  { projectId: string | null; focusSeconds: number }[]
> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ project_id: string | null; total: number }>(
    `SELECT project_id, SUM(duration_seconds) AS total FROM focus_sessions
     WHERE kind = 'focus' GROUP BY project_id ORDER BY total DESC`,
  );
  return rows.map((row) => ({ projectId: row.project_id, focusSeconds: row.total ?? 0 }));
}

export async function totalFocusSeconds(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ total: number | null }>(
    "SELECT SUM(duration_seconds) AS total FROM focus_sessions WHERE kind = 'focus'",
  );
  return row?.total ?? 0;
}

/** Number of focus sessions completed for a task (shown on the task card). */
export async function sessionCountForTask(taskId: string): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM focus_sessions WHERE task_id = ? AND completed = 1',
    [taskId],
  );
  return row?.count ?? 0;
}
