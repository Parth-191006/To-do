/**
 * The first-run tour.
 *
 * A first-time user lands on Today with an empty list and no idea that the text
 * bar parses dates, that the same day has four arrangements, or that the whole
 * thing works with no account. The tour says those three things once, on the
 * first launch only, and never again unless it is asked for.
 *
 * Three steps, one sentence each. An earlier version had four steps and a
 * paragraph per step — a manual shown before the first task exists, which is
 * the fastest way to make a simple app feel complicated. Everything trimmed
 * from here is still reachable: the parser is self-teaching from the empty
 * state, and Settings explains the rest where the user went looking for it.
 *
 * Content only — no React, no icons-by-import — so a test can hold it to its
 * promises (every step has real copy, ids are unique, the bounds of the pager
 * are correct).
 */

export interface TourStep {
  id: string;
  /** Ionicons glyph name; typed loosely so this module stays UI-free. */
  icon: string;
  title: string;
  body: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'capture',
    icon: 'sparkles-outline',
    title: 'Type it, don’t file it',
    body: '“Email the invoice tomorrow 5pm #Work !high” becomes a task with a due time, a tag and a priority. Nothing to fill in.',
  },
  {
    id: 'views',
    icon: 'albums-outline',
    title: 'One day, four ways',
    body: 'List, board, agenda and matrix arrange the same tasks four ways. Focus runs the timer, Habits keeps the streaks.',
  },
  {
    id: 'local',
    icon: 'lock-closed-outline',
    title: 'Yours, offline',
    body: 'Everything stays in a local database on this phone — no account, no sign-in, no tracking.',
  },
];

/** Keeps the step index inside the tour, so a stray tap cannot blank the screen. */
export function clampStep(index: number, total: number = TOUR_STEPS.length): number {
  if (!Number.isFinite(index)) return 0;
  if (total <= 0) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), total - 1);
}

/** Human label for the pager, e.g. `Step 2 of 3`. */
export function formatStepLabel(index: number, total: number = TOUR_STEPS.length): string {
  return `Step ${clampStep(index, total) + 1} of ${total}`;
}

/** The primary button's label — the last step is the one that starts the app. */
export function primaryActionLabel(index: number, total: number = TOUR_STEPS.length): string {
  return clampStep(index, total) === total - 1 ? 'Start using TaskFlow' : 'Next';
}
