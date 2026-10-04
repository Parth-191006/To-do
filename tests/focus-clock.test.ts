/**
 * Focus-timer suite (13 assertions, ported from `scripts/verify-focus-clock.ts`).
 *
 * These exist because the shipped build had a pause button that behaved like a
 * restart button, and a clock that stalled whenever Android suspended JS timers.
 */
import { describe, expect, it } from 'vitest';

import {
  clockLabel,
  createClock,
  elapsedMs,
  isExpired,
  pauseClock,
  progressOf,
  startClock,
  tickClock,
} from '@/utils/focusClock';

const MINUTE = 60_000;
/** A fixed, monotonic "now" so nothing depends on the real clock. */
const T0 = new Date(2026, 5, 10, 9, 0, 0, 0).getTime();

describe('focus clock', () => {
  it('a fresh clock is idle and full', () => {
    const clock = createClock(25 * MINUTE);
    expect(clock.phase).toBe('idle');
    expect(clock.remainingMs).toBe(25 * MINUTE);
    expect(clock.deadline).toBeNull();
    expect(progressOf(clock)).toBe(0);
  });

  it('starting a block sets a wall-clock deadline', () => {
    const started = startClock(createClock(25 * MINUTE), T0, 25 * MINUTE);
    expect(started.phase).toBe('running');
    expect(started.deadline).toBe(T0 + 25 * MINUTE);
    expect(started.remainingMs).toBe(25 * MINUTE);
  });

  it('ticking consumes real elapsed time', () => {
    const started = startClock(createClock(25 * MINUTE), T0, 25 * MINUTE);
    const afterTen = tickClock(started, T0 + 10 * MINUTE);
    expect(afterTen.remainingMs).toBe(15 * MINUTE);
    expect(elapsedMs(afterTen)).toBe(10 * MINUTE);
    expect(isExpired(afterTen)).toBe(false);
  });

  it('PAUSING KEEPS THE REMAINING TIME (regression: pause used to reset)', () => {
    const started = startClock(createClock(25 * MINUTE), T0, 25 * MINUTE);
    const paused = pauseClock(tickClock(started, T0 + 10 * MINUTE), T0 + 10 * MINUTE);
    expect(paused.phase).toBe('paused');
    expect(paused.remainingMs).toBe(15 * MINUTE);
    expect(paused.blockMs).toBe(25 * MINUTE);
    expect(paused.deadline).toBeNull();
  });

  it('ticking a paused clock changes nothing', () => {
    const started = startClock(createClock(25 * MINUTE), T0, 25 * MINUTE);
    const paused = pauseClock(tickClock(started, T0 + 10 * MINUTE), T0 + 10 * MINUTE);
    const later = tickClock(paused, T0 + 60 * MINUTE);
    expect(later.remainingMs).toBe(15 * MINUTE);
    expect(later.phase).toBe('paused');
  });

  it('resuming continues from where it stopped', () => {
    const started = startClock(createClock(25 * MINUTE), T0, 25 * MINUTE);
    const paused = pauseClock(tickClock(started, T0 + 10 * MINUTE), T0 + 10 * MINUTE);
    const resumed = startClock(paused, T0 + 30 * MINUTE, 25 * MINUTE);
    expect(resumed.phase).toBe('running');
    expect(resumed.remainingMs).toBe(15 * MINUTE);
    expect(resumed.deadline).toBe(T0 + 30 * MINUTE + 15 * MINUTE);
  });

  it('a paused block can still be completed end to end', () => {
    const started = startClock(createClock(25 * MINUTE), T0, 25 * MINUTE);
    const paused = pauseClock(tickClock(started, T0 + 10 * MINUTE), T0 + 10 * MINUTE);
    const resumed = startClock(paused, T0 + 30 * MINUTE, 25 * MINUTE);
    const done = tickClock(resumed, T0 + 45 * MINUTE);
    expect(done.remainingMs).toBe(0);
    expect(isExpired(done)).toBe(true);
    expect(elapsedMs(done)).toBe(25 * MINUTE);
  });

  it('SURVIVES BACKGROUNDING: a suspended app still lands on zero', () => {
    const started = startClock(createClock(25 * MINUTE), T0, 25 * MINUTE);
    // No ticks happen while the process is suspended; time simply passes.
    const onReturn = tickClock(started, T0 + 40 * MINUTE);
    expect(onReturn.remainingMs).toBe(0);
    expect(isExpired(onReturn)).toBe(true);
  });

  it('remaining time never goes negative', () => {
    const started = startClock(createClock(5 * MINUTE), T0, 5 * MINUTE);
    expect(tickClock(started, T0 + 999 * MINUTE).remainingMs).toBe(0);
    expect(progressOf(tickClock(started, T0 + 999 * MINUTE))).toBe(1);
  });

  it('an expired clock can be started again', () => {
    const expired = tickClock(startClock(createClock(5 * MINUTE), T0, 5 * MINUTE), T0 + 9 * MINUTE);
    expect(isExpired(expired)).toBe(true);
    const restarted = startClock(expired, T0 + 9 * MINUTE, 15 * MINUTE);
    expect(restarted.remainingMs).toBe(15 * MINUTE);
    expect(restarted.phase).toBe('running');
  });

  it('progress tracks the block', () => {
    const started = startClock(createClock(20 * MINUTE), T0, 20 * MINUTE);
    expect(progressOf(tickClock(started, T0 + 5 * MINUTE))).toBe(0.25);
    expect(progressOf(tickClock(started, T0 + 10 * MINUTE))).toBe(0.5);
  });

  it('the label rounds up, pads and never shows a negative', () => {
    expect(clockLabel(25 * MINUTE)).toBe('25:00');
    expect(clockLabel(59_400)).toBe('01:00');
    expect(clockLabel(9_000)).toBe('00:09');
    expect(clockLabel(1)).toBe('00:01');
    expect(clockLabel(0)).toBe('00:00');
    expect(clockLabel(-5_000)).toBe('00:00');
  });

  it('a state transition never mutates its input', () => {
    const original = createClock(25 * MINUTE);
    const snapshot = { ...original };
    startClock(original, T0, 25 * MINUTE);
    pauseClock(original, T0);
    tickClock(original, T0 + MINUTE);
    expect(original).toEqual(snapshot);
  });
});
