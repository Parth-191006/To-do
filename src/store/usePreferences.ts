import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

/**
 * Small AsyncStorage-backed preferences that are not worth a SQLite table.
 *
 * Mirrors the theme preference in `ThemeProvider`: state lives in a store so
 * every screen reacts to it, while the disk copy is written best-effort — a
 * failed read or write simply leaves the default in place.
 */

const AUTO_START_BREAK_KEY = 'taskflow.focus.autoStartBreak';
const DAILY_GOAL_KEY = 'taskflow.focus.dailyGoalMinutes';
const LONG_BREAK_EVERY_KEY = 'taskflow.focus.longBreakEvery';
const LONG_BREAK_MINUTES_KEY = 'taskflow.focus.longBreakMinutes';
const ROUNDS_KEY = 'taskflow.focus.roundsCompleted';
const APP_LOCK_KEY = 'taskflow.security.appLock';
const WEEKLY_GOAL_KEY = 'taskflow.insights.weeklyGoalTasks';
const TEMPLATES_KEY = 'taskflow.capture.templates';
const LAST_TASK_KEY = 'taskflow.capture.lastTask';
const REVIEW_KEY = 'taskflow.review.lastDismissed';

/** A deliberate tap always wins over a slow hydration read. */
let userTouched = false;

interface PreferencesState {
  /** When a focus block hits zero, start the break countdown immediately. */
  autoStartBreak: boolean;
  setAutoStartBreak: (next: boolean) => void;

  /** Focus minutes per day the ring aims at ("today's focus" progress bar). */
  dailyGoalMinutes: number;
  setDailyGoalMinutes: (next: number) => void;

  /** Short-break cycle: every Nth completed focus round earns a long break. */
  longBreakEvery: number;
  setLongBreakEvery: (next: number) => void;
  longBreakMinutes: number;
  setLongBreakMinutes: (next: number) => void;

  /** Focus blocks finished today — the session counter, persisted. */
  roundsCompleted: number;
  setRoundsCompleted: (next: number) => void;
  hydrateRounds: (next: number) => void;

  /** Optional biometric/PIN lock on app open. */
  appLock: boolean;
  setAppLock: (next: boolean) => void;

  /** Weekly target for completed tasks (0 = no goal). */
  weeklyGoalTasks: number;
  setWeeklyGoalTasks: (next: number) => void;

  /** Reusable capture snippets, stored as the raw natural-language line. */
  templates: TaskTemplate[];
  saveTemplate: (text: string) => void;
  removeTemplate: (id: string) => void;

  /** The last thing captured, for the "repeat last task" shortcut. */
  lastTaskText: string | null;
  setLastTaskText: (next: string | null) => void;

  /** `${dateKey}:${kind}` of the last review card the user dismissed. */
  lastReviewDismissed: string | null;
  setLastReviewDismissed: (next: string) => void;
}

/** A saved capture line, replayed through the same parser as typed input. */
export interface TaskTemplate {
  id: string;
  /** Human label — the cleaned title of the original input. */
  label: string;
  /** The raw input, so dates and tags are re-parsed on use. */
  text: string;
  createdAt: string;
}

function persist(key: string, value: string): void {
  AsyncStorage.setItem(key, value).catch(() => undefined);
}

export const usePreferences = create<PreferencesState>((set) => ({
  autoStartBreak: false,
  setAutoStartBreak: (next) => {
    userTouched = true;
    set({ autoStartBreak: next });
    persist(AUTO_START_BREAK_KEY, next ? 'true' : 'false');
  },

  dailyGoalMinutes: 60,
  setDailyGoalMinutes: (next) => {
    userTouched = true;
    set({ dailyGoalMinutes: next });
    persist(DAILY_GOAL_KEY, String(next));
  },

  longBreakEvery: 4,
  setLongBreakEvery: (next) => {
    userTouched = true;
    set({ longBreakEvery: next });
    persist(LONG_BREAK_EVERY_KEY, String(next));
  },
  longBreakMinutes: 15,
  setLongBreakMinutes: (next) => {
    userTouched = true;
    set({ longBreakMinutes: next });
    persist(LONG_BREAK_MINUTES_KEY, String(next));
  },

  roundsCompleted: 0,
  setRoundsCompleted: (next) => {
    userTouched = true;
    set({ roundsCompleted: next });
    persist(ROUNDS_KEY, String(next));
  },
  /** Used when the store catches up with the display; must not mark a tap. */
  hydrateRounds: (next) => set({ roundsCompleted: next }),

  appLock: false,
  setAppLock: (next) => {
    userTouched = true;
    set({ appLock: next });
    persist(APP_LOCK_KEY, next ? 'true' : 'false');
  },

  weeklyGoalTasks: 0,
  setWeeklyGoalTasks: (next) => {
    userTouched = true;
    set({ weeklyGoalTasks: next });
    persist(WEEKLY_GOAL_KEY, String(next));
  },

  templates: [],
  saveTemplate: (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    userTouched = true;
    set((state) => {
      // Identical snippets are not worth a second chip.
      if (state.templates.some((template) => template.text === trimmed)) return state;
      const next: TaskTemplate[] = [
        {
          id: `tpl_${Date.now().toString(36)}`,
          label: trimmed.length > 22 ? `${trimmed.slice(0, 20)}…` : trimmed,
          text: trimmed,
          createdAt: new Date().toISOString(),
        },
        ...state.templates,
      ].slice(0, 6);
      persist(TEMPLATES_KEY, JSON.stringify(next));
      return { templates: next };
    });
  },
  removeTemplate: (id) => {
    userTouched = true;
    set((state) => {
      const next = state.templates.filter((template) => template.id !== id);
      persist(TEMPLATES_KEY, JSON.stringify(next));
      return { templates: next };
    });
  },

  lastTaskText: null,
  setLastTaskText: (next) => {
    userTouched = true;
    set({ lastTaskText: next });
    persist(LAST_TASK_KEY, next ?? '');
  },

  lastReviewDismissed: null,
  setLastReviewDismissed: (next) => {
    userTouched = true;
    set({ lastReviewDismissed: next });
    persist(REVIEW_KEY, next);
  },
}));

/**
 * Restores the persisted slice. Read as one batch so a slow disk cannot apply
 * half the preferences and then be overwritten by a user tap.
 */
Promise.all([
  AsyncStorage.getItem(AUTO_START_BREAK_KEY),
  AsyncStorage.getItem(DAILY_GOAL_KEY),
  AsyncStorage.getItem(LONG_BREAK_EVERY_KEY),
  AsyncStorage.getItem(LONG_BREAK_MINUTES_KEY),
  AsyncStorage.getItem(ROUNDS_KEY),
  AsyncStorage.getItem(APP_LOCK_KEY),
  AsyncStorage.getItem(WEEKLY_GOAL_KEY),
  AsyncStorage.getItem(TEMPLATES_KEY),
  AsyncStorage.getItem(LAST_TASK_KEY),
  AsyncStorage.getItem(REVIEW_KEY),
])
  .then(([autoStart, goal, every, longMinutes, rounds, lock, weeklyGoal, templates, lastTask, review]) => {
    if (userTouched) return;
    const patch: Partial<PreferencesState> = {};
    if (autoStart === 'true' || autoStart === 'false') patch.autoStartBreak = autoStart === 'true';
    if (goal && Number.isFinite(Number(goal))) patch.dailyGoalMinutes = Number(goal);
    if (every && Number.isFinite(Number(every))) patch.longBreakEvery = Number(every);
    if (longMinutes && Number.isFinite(Number(longMinutes))) {
      patch.longBreakMinutes = Number(longMinutes);
    }
    if (rounds && Number.isFinite(Number(rounds))) patch.roundsCompleted = Number(rounds);
    if (lock === 'true' || lock === 'false') patch.appLock = lock === 'true';
    if (weeklyGoal && Number.isFinite(Number(weeklyGoal))) {
      patch.weeklyGoalTasks = Number(weeklyGoal);
    }
    if (templates) {
      try {
        const parsed = JSON.parse(templates) as TaskTemplate[];
        if (Array.isArray(parsed)) patch.templates = parsed.slice(0, 6);
      } catch {
        // A corrupt list simply reads as "no templates".
      }
    }
    if (lastTask) patch.lastTaskText = lastTask;
    if (review) patch.lastReviewDismissed = review;
    usePreferences.setState(patch);
  })
  .catch(() => {
    // Non-fatal: every preference simply stays at its default.
  });
