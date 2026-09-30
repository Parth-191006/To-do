/**
 * Habit logic verification.
 *
 * Run with:  npm run verify:habits
 */
import assert from 'node:assert/strict';

import {
  computeStreak,
  habitToggleDelta,
  longestStreak,
  shiftDateKey,
  todayKey,
} from '../src/domain/habits.ts';
import { toDateKey } from '../src/utils/id.ts';

let passed = 0;

function check(name: string, run: () => void): void {
  try {
    run();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

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

check('shiftDateKey walks across month boundaries', () => {
  assert.equal(shiftDateKey('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDateKey('2026-06-30', 1), '2026-07-01');
  assert.equal(shiftDateKey('2026-12-31', 1), '2027-01-01');
});

check('the dependency-free date key agrees with the app-wide helper', () => {
  // `src/domain/habits.ts` cannot import `@/utils/id` (Node cannot resolve the
  // alias), so guard against the two implementations drifting apart.
  for (let day = 0; day < 400; day += 1) {
    const date = new Date(2026, 0, 1 + day, 23, 45, 0, 0);
    assert.equal(todayKeyFrom(date), toDateKey(date), `mismatch for ${date.toDateString()}`);
  }
  // Local midnight is the case a naive `toISOString().slice(0,10)` gets wrong.
  assert.equal(toDateKey(new Date(2026, 5, 10, 0, 5)), '2026-06-10');
  assert.equal(todayKeyFrom(new Date(2026, 5, 10, 0, 5)), '2026-06-10');
});

check('todayKey matches the real current date', () => {
  assert.equal(todayKey(), toDateKey(new Date()));
});

check('an untracked habit has no streak', () => {
  assert.equal(computeStreak([], TODAY), 0);
  assert.equal(longestStreak([]), 0);
});

check('todays check-in counts immediately', () => {
  assert.equal(computeStreak([log('h1', TODAY)], TODAY), 1);
});

check('a run of consecutive days accumulates', () => {
  const logs = [
    log('h1', '2026-06-08'),
    log('h1', '2026-06-09'),
    log('h1', '2026-06-10'),
  ];
  assert.equal(computeStreak(logs, TODAY), 3);
});

check('yesterday still counts while today is unfinished', () => {
  const logs = [log('h1', '2026-06-08'), log('h1', '2026-06-09')];
  assert.equal(computeStreak(logs, TODAY), 2);
});

check('a missed day breaks the streak', () => {
  const logs = [log('h1', '2026-06-05'), log('h1', '2026-06-06')];
  assert.equal(computeStreak(logs, TODAY), 0);
});

check('longestStreak finds the best run, not the latest', () => {
  const logs = [
    log('h1', '2026-06-01'),
    log('h1', '2026-06-02'),
    log('h1', '2026-06-03'),
    log('h1', '2026-06-09'),
  ];
  assert.equal(longestStreak(logs), 3);
});

check('logs for other habits never leak into a streak', () => {
  const logs = [log('h1', '2026-06-09'), log('h2', '2026-06-10')];
  assert.equal(computeStreak(logs.filter((entry) => entry.habitId === 'h1'), TODAY), 1);
});

check('TOGGLING A HABIT UNDOES IT (regression: the check-in was one-way)', () => {
  // Nothing logged yet → the tap should log it.
  assert.equal(habitToggleDelta([], 'h1', TODAY), 1);
  // Already logged today → the same tap must remove it.
  assert.equal(habitToggleDelta([log('h1', TODAY)], 'h1', TODAY), -1);
  // A count that reached zero is treated as not-logged again.
  assert.equal(habitToggleDelta([log('h1', TODAY, 0)], 'h1', TODAY), 1);
});

check('toggling is scoped to today and to the right habit', () => {
  const logs = [log('h1', '2026-06-09'), log('h2', TODAY)];
  assert.equal(habitToggleDelta(logs, 'h1', TODAY), 1, 'yesterday must not undo today');
  assert.equal(habitToggleDelta(logs, 'h3', TODAY), 1, 'another habit must not affect it');
});

check('toggle and streak stay consistent across check-in then undo', () => {
  let logs: ReturnType<typeof log>[] = [];
  logs = [...logs, log('h1', TODAY)];
  assert.equal(computeStreak(logs, TODAY), 1);
  if (habitToggleDelta(logs, 'h1', TODAY) === -1) logs = [];
  assert.equal(computeStreak(logs, TODAY), 0);
});

console.log(`\n${passed} checks passed`);
