/**
 * Pure habit logic — streaks and check-in toggling.
 *
 * Deliberately kept out of `@/db/repositories/habits` so it can be exercised
 * without opening SQLite (and therefore verified in a plain Node process).
 */
import type { HabitLog } from './types';

/** Any object carrying the minimum fields the streak maths needs. */
export type HabitLogLike = Pick<HabitLog, 'habitId' | 'dateKey' | 'count'>;

/**
 * Local `YYYY-MM-DD` calendar key.
 *
 * This deliberately mirrors `toDateKey` from `@/utils/id` instead of importing
 * it: the whole point of this module is that it is dependency-free, so it can be
 * loaded straight from `scripts/` by Node's type stripping (which knows nothing
 * about Metro's `@/` alias). `verify-habits.ts` asserts the two agree, so they
 * cannot drift apart silently.
 */
function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** `today` is optional purely for convenience inside the app. */
export function todayKey(): string {
  return localDateKey(new Date());
}

export function shiftDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

/**
 * Current consecutive-day streak. Today is "in progress" — a gap of one day
 * does not break the streak until the day is over.
 */
export function computeStreak(logs: HabitLogLike[], today = todayKey()): number {
  const completed = new Set(logs.filter((log) => log.count > 0).map((log) => log.dateKey));
  if (completed.size === 0) return 0;

  let cursor = completed.has(today) ? today : shiftDateKey(today, -1);
  if (!completed.has(cursor)) return 0;

  let streak = 0;
  while (completed.has(cursor)) {
    streak += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return streak;
}

export function longestStreak(logs: HabitLogLike[]): number {
  const days = Array.from(new Set(logs.filter((log) => log.count > 0).map((log) => log.dateKey))).sort();
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of days) {
    run = previous && shiftDateKey(previous, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  return best;
}

/**
 * Which way a tap on a habit's checkmark should move today's count.
 *
 * Checking a habit in logs it; tapping the same (already ticked) habit undoes
 * it. The shipped build only ever incremented, so a habit could never be
 * un-checked — the button was a one-way ratchet.
 */
export function habitToggleDelta(
  logs: HabitLogLike[],
  habitId: string,
  dateKey = todayKey(),
): 1 | -1 {
  const existing = logs.find((log) => log.habitId === habitId && log.dateKey === dateKey);
  return (existing?.count ?? 0) > 0 ? -1 : 1;
}
