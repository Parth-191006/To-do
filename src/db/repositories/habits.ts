import type { Habit, HabitLog } from '@/domain/types';
import { createId, nowIso, toDateKey } from '@/utils/id';

import { getDatabase } from '../client';
import { toHabit, toHabitLog } from '../mappers';

export async function listHabits(includeArchived = false): Promise<Habit[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Parameters<typeof toHabit>[0]>(
    `SELECT * FROM habits ${includeArchived ? '' : 'WHERE is_archived = 0'}
     ORDER BY created_at ASC`,
  );
  return rows.map(toHabit);
}

export async function createHabit(input: {
  name: string;
  color?: string;
  icon?: string;
  cadence?: 'daily' | 'weekly';
  targetPerPeriod?: number;
  byWeekday?: number[];
}): Promise<Habit> {
  const db = await getDatabase();
  const now = nowIso();
  const habit: Habit = {
    id: createId('hab_'),
    name: input.name.trim() || 'New habit',
    color: input.color ?? '#10B981',
    icon: input.icon ?? 'flame',
    cadence: input.cadence ?? 'daily',
    targetPerPeriod: input.targetPerPeriod ?? 1,
    byWeekday: input.byWeekday ?? [],
    isArchived: false,
    createdAt: now,
    updatedAt: now,
    syncState: 'pending',
  };

  await db.runAsync(
    `INSERT INTO habits (id, name, color, icon, target_per_period, cadence, by_weekday,
       is_archived, created_at, updated_at, sync_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'pending')`,
    [
      habit.id,
      habit.name,
      habit.color,
      habit.icon,
      habit.targetPerPeriod,
      habit.cadence,
      JSON.stringify(habit.byWeekday),
      habit.createdAt,
      habit.updatedAt,
    ],
  );

  return habit;
}

export async function updateHabit(
  id: string,
  patch: Partial<Pick<Habit, 'name' | 'color' | 'icon' | 'cadence' | 'targetPerPeriod' | 'byWeekday' | 'isArchived'>>,
): Promise<void> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Parameters<typeof toHabit>[0]>('SELECT * FROM habits WHERE id = ?', [id]);
  if (!row) return;
  const merged = { ...toHabit(row), ...patch };

  await db.runAsync(
    `UPDATE habits SET name = ?, color = ?, icon = ?, target_per_period = ?, cadence = ?,
       by_weekday = ?, is_archived = ?, updated_at = ?, sync_state = 'pending' WHERE id = ?`,
    [
      merged.name,
      merged.color,
      merged.icon,
      merged.targetPerPeriod,
      merged.cadence,
      JSON.stringify(merged.byWeekday),
      merged.isArchived ? 1 : 0,
      nowIso(),
      id,
    ],
  );
}

/**
 * Increments (or clears) today's log for a habit.
 * Returns the new count so the UI can animate the ring.
 */
export async function bumpHabitLog(
  habitId: string,
  dateKey = toDateKey(),
  delta = 1,
): Promise<number> {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<{ id: string; count: number }>(
    'SELECT id, count FROM habit_logs WHERE habit_id = ? AND date_key = ?',
    [habitId, dateKey],
  );

  if (!existing) {
    if (delta <= 0) return 0;
    await db.runAsync(
      `INSERT INTO habit_logs (id, habit_id, date_key, count, created_at, sync_state)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [createId('hlog_'), habitId, dateKey, delta, nowIso()],
    );
    return delta;
  }

  const next = Math.max(0, existing.count + delta);
  if (next === 0) {
    await db.runAsync('DELETE FROM habit_logs WHERE id = ?', [existing.id]);
    return 0;
  }

  await db.runAsync(
    `UPDATE habit_logs SET count = ?, sync_state = 'pending' WHERE id = ?`,
    [next, existing.id],
  );
  return next;
}

export async function listHabitLogs(habitId: string, sinceDateKey?: string): Promise<HabitLog[]> {
  const db = await getDatabase();
  const rows = sinceDateKey
    ? await db.getAllAsync<Parameters<typeof toHabitLog>[0]>(
        'SELECT * FROM habit_logs WHERE habit_id = ? AND date_key >= ? ORDER BY date_key ASC',
        [habitId, sinceDateKey],
      )
    : await db.getAllAsync<Parameters<typeof toHabitLog>[0]>(
        'SELECT * FROM habit_logs WHERE habit_id = ? ORDER BY date_key ASC',
        [habitId],
      );
  return rows.map(toHabitLog);
}

export async function listAllHabitLogs(sinceDateKey?: string): Promise<HabitLog[]> {
  const db = await getDatabase();
  const rows = sinceDateKey
    ? await db.getAllAsync<Parameters<typeof toHabitLog>[0]>(
        'SELECT * FROM habit_logs WHERE date_key >= ? ORDER BY date_key ASC',
        [sinceDateKey],
      )
    : await db.getAllAsync<Parameters<typeof toHabitLog>[0]>(
        'SELECT * FROM habit_logs ORDER BY date_key ASC',
      );
  return rows.map(toHabitLog);
}

/**
 * Streak maths lives in `@/domain/habits` (pure, database-free); it is
 * re-exported here so existing imports keep working.
 */
export { computeStreak, longestStreak, habitToggleDelta, shiftDateKey } from '@/domain/habits';
