/**
 * Pure helpers for the words a screen reader hears and the heights that have
 * to grow with the OS font scale.
 *
 * The labels live here rather than inside the components because they are the
 * app's most literal copy: the same "mark complete / mark incomplete" pairing
 * appears on the card, on the detail screen and on the board, and a test can
 * only pin it down if it is built in one place.
 */

import type { Priority } from '@/domain/types';

export interface TaskSummary {
  title: string;
  priority?: Priority;
  done?: boolean;
}

/**
 * "Draft the brief, high priority, completed" — the state a sighted reader
 * gets from colour and strike-through, said out loud. Priority `none` stays
 * silent so the common case is just the title.
 */
export function describeTask({ title, priority = 'none', done = false }: TaskSummary): string {
  const bits = [title];
  if (priority !== 'none') bits.push(`${priority} priority`);
  if (done) bits.push('completed');
  return bits.join(', ');
}

/**
 * The verb flips with the state: a checked box announces what tapping it will
 * *undo*, which is what the user is about to hear next.
 */
export function toggleTaskLabel(title: string, done: boolean): string {
  return done ? `Mark “${title}” not complete` : `Mark “${title}” complete`;
}

/** Play/pause for a voice attachment — the visible name is the subject. */
export function playPauseLabel(name: string | null | undefined, playing: boolean): string {
  const subject = name ? `voice note ${name}` : 'voice note';
  return playing ? `Pause ${subject}` : `Play ${subject}`;
}

/** Base tab-bar height in dp at 1x text scale, safe-area excluded. */
export const BASE_TAB_BAR_HEIGHT = 58;

/**
 * Tab-bar height for the current OS font scale.
 *
 * The bar is chrome, but its labels scale with the system setting, so a fixed
 * 58dp clips "Insights" once the user raises text size. The scale is floored
 * at 1 (a smaller setting should not shrink the bar) and capped at 2.5 — past
 * that Android truncates labels itself and a taller bar would only steal
 * content space.
 */
export function tabBarHeight(fontScale: number, insetBottom: number): number {
  const scale = Number.isFinite(fontScale) ? Math.min(Math.max(fontScale, 1), 2.5) : 1;
  return Math.round(BASE_TAB_BAR_HEIGHT * scale) + Math.max(0, insetBottom);
}
