/**
 * Focus-timer verification.
 *
 * Run with:  npm run verify:clock
 *
 * These checks exist because the shipped build had a pause button that behaved
 * like a restart button, and a clock that silently stalled whenever Android
 * suspended JS timers. Both regressions are encoded here so they cannot come
 * back unnoticed.
 */
import assert from 'node:assert/strict';

import {
  clockLabel,
  createClock,
  elapsedMs,
  isExpired,
  pauseClock,
  progressOf,
  startClock,
  tickClock,
} from '../src/utils/focusClock.ts';

const MINUTE = 60_000;
/** A fixed, monotonic "now" so nothing depends on the real clock. */
const T0 = new Date(2026, 5, 10, 9, 0, 0, 0).getTime();

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

check('a fresh clock is idle and full', () => {
  const clock = createClock(25 * MINUTE);
  assert.equal(clock.phase, 'idle');
  assert.equal(clock.remainingMs, 25 * MINUTE);
  assert.equal(clock.deadline, null);
  assert.equal(progressOf(clock), 0);
});

check('starting a block sets a wall-clock deadline', () => {
  const started = startClock(createClock(25 * MINUTE), T0, 25 * MINUTE);
  assert.equal(started.phase, 'running');
  assert.equal(started.deadline, T0 + 25 * MINUTE);
  assert.equal(started.remainingMs, 25 * MINUTE);
});

check('ticking consumes real elapsed time', () => {
  const started = startClock(createClock(25 * MINUTE), T0, 25 * MINUTE);
  const afterTen = tickClock(started, T0 + 10 * MINUTE);
  assert.equal(afterTen.remainingMs, 15 * MINUTE);
  assert.equal(elapsedMs(afterTen), 10 * MINUTE);
  assert.equal(isExpired(afterTen), false);
});

check('PAUSING KEEPS THE REMAINING TIME (regression: pause used to reset)', () => {
  const started = startClock(createClock(25 * MINUTE), T0, 25 * MINUTE);
  const paused = pauseClock(tickClock(started, T0 + 10 * MINUTE), T0 + 10 * MINUTE);
  assert.equal(paused.phase, 'paused');
  assert.equal(paused.remainingMs, 15 * MINUTE, 'pause must not restore the full block');
  assert.equal(paused.blockMs, 25 * MINUTE, 'pause must not change the block length');
  assert.equal(paused.deadline, null);
});

check('ticking a paused clock changes nothing', () => {
  const started = startClock(createClock(25 * MINUTE), T0, 25 * MINUTE);
  const paused = pauseClock(tickClock(started, T0 + 10 * MINUTE), T0 + 10 * MINUTE);
  const later = tickClock(paused, T0 + 60 * MINUTE);
  assert.equal(later.remainingMs, 15 * MINUTE);
  assert.equal(later.phase, 'paused');
});

check('resuming continues from where it stopped', () => {
  const started = startClock(createClock(25 * MINUTE), T0, 25 * MINUTE);
  const paused = pauseClock(tickClock(started, T0 + 10 * MINUTE), T0 + 10 * MINUTE);
  const resumed = startClock(paused, T0 + 30 * MINUTE, 25 * MINUTE);
  assert.equal(resumed.phase, 'running');
  assert.equal(resumed.remainingMs, 15 * MINUTE);
  assert.equal(resumed.deadline, T0 + 30 * MINUTE + 15 * MINUTE);
});

check('a paused block can still be completed end to end', () => {
  const started = startClock(createClock(25 * MINUTE), T0, 25 * MINUTE);
  const paused = pauseClock(tickClock(started, T0 + 10 * MINUTE), T0 + 10 * MINUTE);
  const resumed = startClock(paused, T0 + 30 * MINUTE, 25 * MINUTE);
  const done = tickClock(resumed, T0 + 45 * MINUTE);
  assert.equal(done.remainingMs, 0);
  assert.equal(isExpired(done), true);
  assert.equal(elapsedMs(done), 25 * MINUTE, 'a full block reports a full 25 minutes');
});

check('SURVIVES BACKGROUNDING: a suspended app still lands on zero', () => {
  const started = startClock(createClock(25 * MINUTE), T0, 25 * MINUTE);
  // No ticks happen while the process is suspended; time simply passes.
  const onReturn = tickClock(started, T0 + 40 * MINUTE);
  assert.equal(onReturn.remainingMs, 0);
  assert.equal(isExpired(onReturn), true);
});

check('remaining time never goes negative', () => {
  const started = startClock(createClock(5 * MINUTE), T0, 5 * MINUTE);
  assert.equal(tickClock(started, T0 + 999 * MINUTE).remainingMs, 0);
  assert.equal(progressOf(tickClock(started, T0 + 999 * MINUTE)), 1);
});

check('an expired clock can be started again', () => {
  const expired = tickClock(startClock(createClock(5 * MINUTE), T0, 5 * MINUTE), T0 + 9 * MINUTE);
  assert.equal(isExpired(expired), true);
  const restarted = startClock(expired, T0 + 9 * MINUTE, 15 * MINUTE);
  assert.equal(restarted.remainingMs, 15 * MINUTE);
  assert.equal(restarted.phase, 'running');
});

check('progress tracks the block', () => {
  const started = startClock(createClock(20 * MINUTE), T0, 20 * MINUTE);
  assert.equal(progressOf(tickClock(started, T0 + 5 * MINUTE)), 0.25);
  assert.equal(progressOf(tickClock(started, T0 + 10 * MINUTE)), 0.5);
});

check('the label rounds up, pads and never shows a negative', () => {
  assert.equal(clockLabel(25 * MINUTE), '25:00');
  assert.equal(clockLabel(59_400), '01:00');
  assert.equal(clockLabel(9_000), '00:09');
  assert.equal(clockLabel(1), '00:01');
  assert.equal(clockLabel(0), '00:00');
  assert.equal(clockLabel(-5_000), '00:00');
});

check('a state transition never mutates its input', () => {
  const original = createClock(25 * MINUTE);
  const snapshot = { ...original };
  startClock(original, T0, 25 * MINUTE);
  pauseClock(original, T0);
  tickClock(original, T0 + MINUTE);
  assert.deepEqual(original, snapshot);
});

console.log(`\n${passed} checks passed`);
