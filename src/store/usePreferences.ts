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

/** A deliberate tap always wins over a slow hydration read. */
let userTouched = false;

interface PreferencesState {
  /** When a focus block hits zero, start the break countdown immediately. */
  autoStartBreak: boolean;
  setAutoStartBreak: (next: boolean) => void;
}

export const usePreferences = create<PreferencesState>((set) => ({
  autoStartBreak: false,
  setAutoStartBreak: (next) => {
    userTouched = true;
    set({ autoStartBreak: next });
    AsyncStorage.setItem(AUTO_START_BREAK_KEY, next ? 'true' : 'false').catch(() => undefined);
  },
}));

AsyncStorage.getItem(AUTO_START_BREAK_KEY)
  .then((raw) => {
    if (userTouched || (raw !== 'true' && raw !== 'false')) return;
    usePreferences.setState({ autoStartBreak: raw === 'true' });
  })
  .catch(() => {
    // Non-fatal: the toggle simply stays at its default (off).
  });
