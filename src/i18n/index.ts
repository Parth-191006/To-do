/**
 * App-facing i18n. Resolves the device's language preferences via
 * `expo-localization` and hands every screen the same `t()` / `tPlural()`.
 *
 * Language resolution is lazy: the first `t()` call picks the table (and a
 * later `initLanguage()` on foreground can re-pick it). This keeps import
 * order irrelevant — a module-level `t()` in a screen can never run against
 * an unresolved locale.
 */
import { getLocales } from 'expo-localization';

import { pickLanguage, pluralKey, translate, type TranslateParams } from './core';
import { en, type StringKey } from './en';

export type { StringKey, TranslateParams };

/** Every table that ships with the app. English only, for now. */
const TABLES: Record<string, Readonly<Record<string, string>>> = { en };

export const SUPPORTED_LANGUAGES = Object.keys(TABLES);

let active: Readonly<Record<string, string>> | null = null;

/**
 * Picks the table matching the device's ordered language preferences.
 * Safe to call again on foreground — Android lets the user change language
 * while the app is running.
 *
 * @returns the language that was activated (e.g. `"en"`).
 */
export function initLanguage(): string {
  const preferred = getLocales().map((locale) => locale.languageCode);
  const language = pickLanguage(preferred, SUPPORTED_LANGUAGES);
  active = TABLES[language] ?? en;
  return language;
}

/** Translate a key, interpolating `{placeholders}` when params are given. */
export function t(key: StringKey, params?: TranslateParams): string {
  if (!active) initLanguage();
  return translate(active ?? en, en, key, params);
}

/**
 * Plural-aware translate: `base` must have matching `baseOne` / `baseMany`
 * entries in the table (the type enforces it), and the chosen variant is
 * interpolated with `{count}`.
 */
export function tPlural(base: PluralKey, count: number, params?: TranslateParams): string {
  if (!active) initLanguage();
  return translate(active ?? en, en, pluralKey(base, count), { count, ...params });
}

/**
 * A table key with `One`/`Many` siblings, minus the suffix (e.g.
 * `inbox.moveTitle`). Derived by stripping `One` from every `…One` key, so a
 * typo'd plural base fails typecheck at the call site. Pair completeness is
 * pinned by a test — the type alone would accept a base whose `Many` is
 * missing.
 */
export type PluralKey = PluralBase<StringKey>;

type PluralBase<K> = K extends `${infer Base}One`
  ? `${Base}Many` extends StringKey
    ? Base
    : never
  : never;
