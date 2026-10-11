/**
 * Crash-report shaping — the pure half of the opt-in crash log.
 *
 * The rule this module exists to enforce: a crash report may carry *technical*
 * context and nothing else. No task titles, no notes, no email addresses, no
 * long tokens that could be a session id. Scrubbing happens here, before
 * anything is written to disk or posted, so it is testable and so a future
 * caller cannot accidentally skip it.
 *
 * No native imports: Node runs this suite directly.
 */

/** One captured crash, already scrubbed. */
export interface CrashReport {
  /** Stable-ish id for dedupe: message + first stack frame, hashed. */
  fingerprint: string;
  message: string;
  stack: string;
  /** `fatal` = the global handler saw it; `handled` = reported by code. */
  severity: 'fatal' | 'handled';
  /** App version at capture time, e.g. `1.2.3`. */
  appVersion: string;
  /** `ios` | `android` | `web` | … */
  platform: string;
  /** ISO timestamp. */
  at: string;
}

/** Caps that keep a runaway loop from filling the disk or the POST body. */
export const MAX_MESSAGE_LENGTH = 300;
export const MAX_STACK_LENGTH = 2_000;
export const MAX_QUEUED_REPORTS = 20;

const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
/** Long hex or base64-ish runs: session tokens, ids, hashes. */
const TOKEN_PATTERN = /\b[A-Za-z0-9+/=_-]{24,}\b/g;
/** Bare 10+ digit runs, optional leading +: phone numbers, card-like strings. */
const LONG_DIGIT_PATTERN = /\+?\d{10,}/g;

/**
 * Removes the three shapes that can carry PII inside an otherwise technical
 * message: email addresses, long token-like runs, and long digit sequences.
 * Short identifiers (a task id is ~20 chars of base36) are deliberately kept —
 * they are what makes a report actionable, and they identify nothing on their
 * own.
 */
export function scrubCrashText(text: string): string {
  return text
    .replace(EMAIL_PATTERN, '[redacted-email]')
    .replace(TOKEN_PATTERN, '[redacted-token]')
    .replace(LONG_DIGIT_PATTERN, '[redacted-digits]');
}

/**
 * A short, stable fingerprint so identical crashes dedupe instead of piling
 * up: scrubbed message plus the first stack frame, both truncated, then a
 * simple FNV-1a hash. Not cryptographic — it never leaves the device as an
 * identifier of anything but the crash itself.
 */
export function fingerprintCrash(message: string, stack: string): string {
  const firstFrame = stack.split('\n').find((line) => line.trim().length > 0) ?? '';
  const seed = `${message}|${firstFrame}`.slice(0, 400).toLowerCase();
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export interface BuildCrashInput {
  error: unknown;
  severity: 'fatal' | 'handled';
  appVersion: string;
  platform: string;
  now?: Date;
}

/**
 * Turns a thrown value into a scrubbed report. Accepts `unknown` because
 * JavaScript can throw anything, and a crash reporter that itself throws on a
 * string rejection is worse than no reporter.
 */
export function buildCrashReport(input: BuildCrashInput): CrashReport {
  const { error } = input;
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Unknown error';
  const rawStack = error instanceof Error && error.stack ? error.stack : '';

  const message = scrubCrashText(rawMessage).slice(0, MAX_MESSAGE_LENGTH);
  const stack = scrubCrashText(rawStack).slice(0, MAX_STACK_LENGTH);

  return {
    fingerprint: fingerprintCrash(message, stack),
    message,
    stack,
    severity: input.severity,
    appVersion: input.appVersion,
    platform: input.platform,
    at: (input.now ?? new Date()).toISOString(),
  };
}

/**
 * Appends to the local queue, newest first, deduping by fingerprint (an
 * incrementing loop would otherwise store the same crash twenty times) and
 * capping the length. Pure: returns a new array, mutates nothing.
 */
export function queueCrashReport(
  existing: CrashReport[],
  report: CrashReport,
): CrashReport[] {
  const withoutDupes = existing.filter((entry) => entry.fingerprint !== report.fingerprint);
  return [report, ...withoutDupes].slice(0, MAX_QUEUED_REPORTS);
}

/** Human-readable form for the "share my crash reports" escape hatch. */
export function formatCrashReports(reports: CrashReport[]): string {
  if (reports.length === 0) return 'No crash reports.';
  return reports
    .map(
      (report) =>
        `[${report.at}] ${report.severity.toUpperCase()} · v${report.appVersion} · ${report.platform}\n${report.message}\n${report.stack}`,
    )
    .join('\n\n---\n\n');
}
