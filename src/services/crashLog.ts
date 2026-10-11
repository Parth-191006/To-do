import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import {
  buildCrashReport,
  queueCrashReport,
  type CrashReport,
} from '@/domain/crashLog';

/**
 * Opt-in crash log.
 *
 * TaskFlow ships no crash *reporter* — nothing is uploaded, ever, because
 * there is no endpoint to upload to and inventing one would be a lie in the
 * privacy statement. What exists instead is a crash *log*: when the user turns
 * it on (Settings → Diagnostics, off by default), uncaught JS errors are captured
 * through the global handler, scrubbed of PII by `src/domain/crashLog`, and
 * kept on this device — viewable and shareable through the OS share sheet, so
 * a person can send a report to whoever maintains their build.
 *
 * Turning the toggle off stops capture immediately; it does not delete what
 * was already logged — clearing is a separate, explicit action, because silent
 * deletion of data the user chose to keep is the same dishonesty in reverse.
 *
 * The handler is installed regardless of the preference (installing is free
 * and swapping it later is not possible once errors are flying), but the
 * preference is read at *capture* time, so the toggle is honest even before
 * hydration settles: default off means nothing is stored.
 */

const QUEUE_KEY = 'taskflow.crash.reports';

let installed = false;
let reports: CrashReport[] = [];
let hydrated = false;

function appVersion(): string {
  return Constants.expoConfig?.version ?? '0.0.0';
}

/** Reads the queue once; every later call reads the in-memory copy. */
async function hydrate(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as CrashReport[];
    if (Array.isArray(parsed)) reports = parsed;
  } catch {
    // A corrupt queue simply reads as "no reports" — never block app start.
  }
}

async function persist(): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(reports)).catch(() => undefined);
}

/**
 * The caller's decision, read live from the preference store. Imported lazily
 * so this module has no import cycle with the preferences store and so Node
 * tests can load the pure half without pulling in AsyncStorage.
 */
async function isCaptureEnabled(): Promise<boolean> {
  try {
    const { usePreferences } = await import('@/store/usePreferences');
    return usePreferences.getState().crashLogEnabled;
  } catch {
    return false;
  }
}

/**
 * Captures one error, if the user has opted in. Never throws: a crash logger
 * that crashes is a bug factory.
 */
async function capture(error: unknown, severity: 'fatal' | 'handled'): Promise<void> {
  try {
    if (!(await isCaptureEnabled())) return;
    await hydrate();
    const report = buildCrashReport({
      error,
      severity,
      appVersion: appVersion(),
      platform: Platform.OS,
    });
    reports = queueCrashReport(reports, report);
    await persist();
  } catch {
    // Swallow: capturing must never mask the original error path.
  }
}

/**
 * Installs the global handler. Idempotent, and it chains the previous handler
 * so the red screen in development (and any host handler) still runs.
 */
export function installCrashLog(): void {
  if (installed) return;
  installed = true;
  void hydrate();

  const globalHandler = (global as { ErrorUtils?: { getGlobalHandler?: () => ((error: Error, isFatal?: boolean) => void) | undefined; setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void } }).ErrorUtils;
  if (!globalHandler?.getGlobalHandler || !globalHandler.setGlobalHandler) return;

  const previous = globalHandler.getGlobalHandler();
  globalHandler.setGlobalHandler((error, isFatal) => {
    void capture(error, isFatal ? 'fatal' : 'handled');
    previous?.(error, isFatal);
  });
}

/** Explicit capture for a caught-but-notable failure. */
export function reportCrash(error: unknown): void {
  void capture(error, 'handled');
}

/** The current queue, newest first. Loads from disk on first call. */
export async function getCrashReports(): Promise<CrashReport[]> {
  await hydrate();
  return reports;
}

export async function clearCrashReports(): Promise<void> {
  await hydrate();
  reports = [];
  await persist();
}

/** True when a toggle-on has actually captured something. */
export async function hasCrashReports(): Promise<boolean> {
  await hydrate();
  return reports.length > 0;
}
