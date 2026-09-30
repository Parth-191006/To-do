/**
 * Pure state machine behind the Pomodoro timer.
 *
 * Kept out of the component so the tricky parts — pause/resume, backgrounding,
 * expiry — are plain functions with no React and no `setInterval` involved, and
 * can therefore be verified in a plain Node process.
 *
 * The core idea: a running block is a *wall-clock deadline*, not a count of
 * ticks. React Native suspends JS timers when the app is backgrounded, so a
 * tick-counting clock silently loses time; a deadline cannot drift.
 */

export type ClockPhase = 'idle' | 'running' | 'paused';

export interface ClockState {
  phase: ClockPhase;
  /** Duration of the current block, frozen when the block begins. */
  blockMs: number;
  remainingMs: number;
  /** Absolute timestamp the block ends at, or null when not running. */
  deadline: number | null;
}

export function createClock(blockMs: number): ClockState {
  return { phase: 'idle', blockMs, remainingMs: blockMs, deadline: null };
}

/**
 * Begins — or *resumes* — a block.
 *
 * Resuming a paused clock keeps the remaining time and the original block
 * length. Only a fresh (idle) or expired clock is reset to a full block.
 */
export function startClock(state: ClockState, now: number, blockMs: number): ClockState {
  const fresh = state.phase === 'idle' || state.remainingMs <= 0;
  const nextBlock = fresh ? blockMs : state.blockMs;
  const remaining = fresh ? blockMs : state.remainingMs;
  return {
    phase: 'running',
    blockMs: nextBlock,
    remainingMs: Math.max(0, remaining),
    deadline: now + Math.max(0, remaining),
  };
}

/** Freezes the clock, keeping exactly the time that is left. */
export function pauseClock(state: ClockState, now: number): ClockState {
  if (state.phase !== 'running' || state.deadline === null) return state;
  return {
    ...state,
    phase: 'paused',
    remainingMs: Math.max(0, state.deadline - now),
    deadline: null,
  };
}

/** Re-reads the wall clock; a no-op unless a block is running. */
export function tickClock(state: ClockState, now: number): ClockState {
  if (state.phase !== 'running' || state.deadline === null) return state;
  const remainingMs = Math.max(0, state.deadline - now);
  if (remainingMs === state.remainingMs) return state;
  return { ...state, remainingMs };
}

/** True once a running block has reached zero. */
export function isExpired(state: ClockState): boolean {
  return state.phase === 'running' && state.remainingMs <= 0;
}

/** Milliseconds genuinely spent on the current block. */
export function elapsedMs(state: ClockState): number {
  return Math.max(0, state.blockMs - state.remainingMs);
}

/** 0..1 completion of the current block, for the progress ring. */
export function progressOf(state: ClockState): number {
  if (state.blockMs <= 0) return 0;
  const value = 1 - state.remainingMs / state.blockMs;
  return Math.min(1, Math.max(0, value));
}

/** `mm:ss`, rounded up, and never negative. */
export function clockLabel(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${`${minutes}`.padStart(2, '0')}:${`${seconds}`.padStart(2, '0')}`;
}
