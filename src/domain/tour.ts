/**
 * The first-run tour.
 *
 * A first-time user lands on Today with an empty list and no idea that the text
 * bar parses dates, that the same day has four arrangements, or that the whole
 * thing works with no account. The tour says those four things once, on the
 * first launch only, and never again unless it is asked for.
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
    title: 'Capture a thought in one line',
    body: 'Type into the bar at the top of Today and TaskFlow reads it as you go — date, time, #tag, !priority, ~estimate and repeats each appear as a chip you can see. “Email the invoice tomorrow 5pm #Work !high ~45m” becomes a task with a due time, a tag, a priority and a 45-minute estimate.',
  },
  {
    id: 'views',
    icon: 'albums-outline',
    title: 'One day, four ways to see it',
    body: 'Today, Inbox, Focus, Habits and Insights are the five tabs. Inside Today the switch flips between List, Kanban, Agenda and Matrix — the same tasks, arranged for planning, dragging through stages, reading the clock, or deciding what is urgent and important.',
  },
  {
    id: 'focus',
    icon: 'timer-outline',
    title: 'Focus blocks and habits',
    body: 'Start a Pomodoro from Focus — or straight from a task’s own sheet — and the countdown keeps time against the wall clock, so locking the screen does not stop it. Habits track streaks and a heat map, one tap per check-in.',
  },
  {
    id: 'local',
    icon: 'lock-closed-outline',
    title: 'Yours, offline, no account',
    body: 'Everything lives in a local SQLite database on this phone: no sign-in, no telemetry, no network needed. Export a JSON or CSV copy whenever you like from Settings → Your data. Cloud sync, shared lists and the remote planner are optional extras you turn on by configuring a backend.',
  },
];

/** Keeps the step index inside the tour, so a stray tap cannot blank the screen. */
export function clampStep(index: number, total: number = TOUR_STEPS.length): number {
  if (!Number.isFinite(index)) return 0;
  if (total <= 0) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), total - 1);
}

/** Human label for the pager, e.g. `Step 2 of 4`. */
export function formatStepLabel(index: number, total: number = TOUR_STEPS.length): string {
  return `Step ${clampStep(index, total) + 1} of ${total}`;
}

/** The primary button's label — the last step is the one that starts the app. */
export function primaryActionLabel(index: number, total: number = TOUR_STEPS.length): string {
  return clampStep(index, total) === total - 1 ? 'Start using TaskFlow' : 'Next';
}
