/**
 * Pure i18n core — no native imports, so the verify suite can exercise it in
 * plain node. The app-facing wrapper lives in `./index`.
 *
 * English is the only shipped table today; the point of the scaffold is that
 * adding a language becomes "write one table, add one import", not "touch
 * every screen".
 */

export type StringTable = Readonly<Record<string, string>>;
export type TranslateParams = Readonly<Record<string, string | number>>;

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Replaces `{name}` placeholders. An unknown placeholder stays as written
 * rather than becoming "undefined" — a broken template should still read like
 * language, and the braces make the mistake obvious in a screenshot.
 */
export function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(PLACEHOLDER, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole,
  );
}

/**
 * English stores a singular/plural pair per phrase: `base + "One"` and
 * `base + "Many"` ("Move 1 task" / "Move 2 tasks"). Keeping the choice in the
 * table rather than a ternary in the screen is what lets a real locale bring
 * its own CLDR rules later without touching any JSX.
 */
export function pluralKey(base: string, count: number): string {
  return `${base}${count === 1 ? 'One' : 'Many'}`;
}

/**
 * The first preferred language we ship, compared case-insensitively on the
 * primary subtag ("pt-BR" matches "pt"). Falls back to the first supported
 * language — English — when nothing matches.
 */
export function pickLanguage(
  preferred: readonly (string | null | undefined)[],
  supported: readonly string[],
): string {
  for (const raw of preferred) {
    const code = raw?.toLowerCase().split('-')[0];
    if (code && supported.includes(code)) return code;
  }
  return supported[0] ?? 'en';
}

/**
 * Looks the key up in the active table, then the fallback (English), and
 * finally returns the key itself. A missing translation is a bug, not a
 * crash: showing `settings.title` in the UI is louder than showing nothing.
 */
export function translate(
  table: StringTable,
  fallback: StringTable,
  key: string,
  params?: TranslateParams,
): string {
  const template = table[key] ?? fallback[key];
  if (template === undefined) return key;
  return interpolate(template, params);
}
