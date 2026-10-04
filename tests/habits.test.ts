/** Habit logic suite (13 assertions, ported from `scripts/verify-habits.ts`). */
import { describe, expect, it } from 'vitest';

import { computeStreak, habitToggleDelta, longestStreak, shiftDateKey, todayKey } from '@/domain/habits';
import { toDateKey } from '@/utils/id';

function log(habitId: string, dateKey: string, count = 1) {
  return { habitId, dateKey, count };
}

/** Mirrors the private helper inside the module under test. */
function todayKeyFrom(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const TODAY = '2026-06-10';

describe('habit streaks', () => {
  it('shiftDateKey walks across month boundaries', () => {
    expect(shiftDateKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDateKey('2026-06-30', 1)).toBe('2026-07-01');
    expect(shiftDateKey('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('the dependency-free date key agrees with the app-wide helper', () => {
    for (let day = 0; day < 400; day += 1) {
      const date = new Date(2026, 0, 1 + day, 23, 45, 0, 0);
      expect(todayKeyFrom(date)).toBe(toDateKey(date));
    }
    // Local midnight is the case a naive `toISOString().slice(0,10)` gets wrong.
    expect(toDateKey(new Date(2026, 5, 10, 0, 5))).toBe('2026-06-10');
    expect(todayKeyFrom(new Date(2026, 5, 10, 0, 5))).toBe('2026-06-10');
  });

  it('todayKey matches the real current date', () => {
    expect(todayKey()).toBe(toDateKey(new Date()));
  });

  it('an untracked habit has no streak', () => {
    expect(computeStreak([], TODAY)).toBe(0);
    expect(longestStreak([])).toBe(0);
  });

  it("today's check-in counts immediately", () => {
    expect(computeStreak([log('h1', TODAY)], TODAY)).toBe(1);
  });

  it('a run of consecutive days accumulates', () => {
    const logs = [log('h1', '2026-06-08'), log('h1', '2026-06-09'), log('h1', '2026-06-10')];
    expect(computeStreak(logs, TODAY)).toBe(3);
  });

  it('yesterday still counts while today is unfinished', () => {
    const logs = [log('h1', '2026-06-08'), log('h1', '2026-06-09')];
    expect(computeStreak(logs, TODAY)).toBe(2);
  });

  it('a missed day breaks the streak', () => {
    const logs = [log('h1', '2026-06-05'), log('h1', '2026-06-06')];
    expect(computeStreak(logs, TODAY)).toBe(0);
  });

  it('longestStreak finds the best run, not the latest', () => {
    const logs = [
      log('h1', '2026-06-01'),
      log('h1', '2026-06-02'),
      log('h1', '2026-06-03'),
      log('h1', '2026-06-09'),
    ];
    expect(longestStreak(logs)).toBe(3);
  });

  it('logs for other habits never leak into a streak', () => {
    const logs = [log('h1', '2026-06-09'), log('h2', '2026-06-10')];
    expect(computeStreak(logs.filter((entry) => entry.habitId === 'h1'), TODAY)).toBe(1);
  });

  it('TOGGLING A HABIT UNDOES IT (regression: the check-in was one-way)', () => {
    expect(habitToggleDelta([], 'h1', TODAY)).toBe(1);
    expect(habitToggleDelta([log('h1', TODAY)], 'h1', TODAY)).toBe(-1);
    expect(habitToggleDelta([log('h1', TODAY, 0)], 'h1', TODAY)).toBe(1);
  });

  it('toggling is scoped to today and to the right habit', () => {
    const logs = [log('h1', '2026-06-09'), log('h2', TODAY)];
    expect(habitToggleDelta(logs, 'h1', TODAY)).toBe(1);
    expect(habitToggleDelta(logs, 'h3', TODAY)).toBe(1);
  });

  it('toggle and streak stay consistent across check-in then undo', () => {
    let logs: ReturnType<typeof log>[] = [];
    logs = [...logs, log('h1', TODAY)];
    expect(computeStreak(logs, TODAY)).toBe(1);
    if (habitToggleDelta(logs, 'h1', TODAY) === -1) logs = [];
    expect(computeStreak(logs, TODAY)).toBe(0);
  });
});
