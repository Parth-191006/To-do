import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { en } from '@/i18n/en';
import { interpolate, pickLanguage, pluralKey, translate } from '@/i18n/core';

/**
 * The i18n contract: interpolation must never leak `{braces}` or `undefined`
 * into the UI, language picking must survive real-world locale tags, and the
 * English table must stay structurally sound (plural pairs intact, no empty
 * copy) so a future translation can be dropped in key-for-key.
 *
 * The app-facing `t()` wrapper is deliberately not imported here — it pulls in
 * `expo-localization`, which has no meaning in node. Its logic is a thin
 * layer over these functions.
 */
describe('interpolate', () => {
  it('fills the placeholders it was given', () => {
    expect(interpolate('Move {count} task', { count: 3 })).toBe('Move 3 task');
    expect(interpolate('{a} and {b}', { a: 'x', b: 'y' })).toBe('x and y');
  });

  it('leaves an unknown placeholder as written, not as undefined', () => {
    expect(interpolate('Hello {name}', {})).toBe('Hello {name}');
    expect(interpolate('Hello {name}')).toBe('Hello {name}');
  });

  it('accepts numbers and coerces them', () => {
    expect(interpolate('{count} min', { count: 25 })).toBe('25 min');
  });
});

describe('pickLanguage', () => {
  const SUPPORTED = ['en', 'fr'];

  it('matches on the primary subtag, case-insensitively', () => {
    expect(pickLanguage(['fr-FR', 'en-US'], SUPPORTED)).toBe('fr');
    expect(pickLanguage(['EN-us'], SUPPORTED)).toBe('en');
  });

  it('skips languages we do not ship', () => {
    expect(pickLanguage(['de-DE', 'fr-CA'], SUPPORTED)).toBe('fr');
  });

  it('falls back to the first supported language when nothing matches', () => {
    expect(pickLanguage(['de-DE'], SUPPORTED)).toBe('en');
    expect(pickLanguage([], SUPPORTED)).toBe('en');
    expect(pickLanguage([null, undefined], SUPPORTED)).toBe('en');
    expect(pickLanguage([''], SUPPORTED)).toBe('en');
  });
});

describe('translate', () => {
  it('reads from the active table', () => {
    expect(translate({ a: 'Active' }, { a: 'Fallback' }, 'a')).toBe('Active');
  });

  it('falls back to English when the active table lacks the key', () => {
    expect(translate({}, { a: 'Fallback' }, 'a')).toBe('Fallback');
  });

  it('returns the key itself when neither table has it', () => {
    expect(translate({}, {}, 'missing.key')).toBe('missing.key');
  });

  it('interpolates on the way out', () => {
    expect(translate({ a: '{count} tasks' }, {}, 'a', { count: 2 })).toBe('2 tasks');
  });
});

describe('pluralKey', () => {
  it('picks One for exactly 1 and Many otherwise', () => {
    expect(pluralKey('inbox.moveTitle', 1)).toBe('inbox.moveTitleOne');
    expect(pluralKey('inbox.moveTitle', 0)).toBe('inbox.moveTitleMany');
    expect(pluralKey('inbox.moveTitle', 2)).toBe('inbox.moveTitleMany');
    expect(pluralKey('inbox.moveTitle', 99)).toBe('inbox.moveTitleMany');
  });
});

describe('English table', () => {
  const keys = Object.keys(en);

  it('has no empty copy', () => {
    for (const key of keys) {
      expect(en[key as keyof typeof en], `empty value for ${key}`).not.toBe('');
    }
  });

  it('keeps every plural base paired One/Many', () => {
    for (const key of keys) {
      if (key.endsWith('One')) {
        const base = key.slice(0, -3);
        expect(keys, `${base} has a One but no Many`).toContain(`${base}Many`);
      }
      if (key.endsWith('Many')) {
        const base = key.slice(0, -4);
        expect(keys, `${base} has a Many but no One`).toContain(`${base}One`);
      }
    }
  });

  it('keeps One and Many variants interpolatable with {count}', () => {
    for (const key of keys) {
      if (!key.endsWith('One')) continue;
      const many = `${key.slice(0, -3)}Many` as keyof typeof en;
      expect(en[key as keyof typeof en], `${key} lacks {count}`).toContain('{count}');
      expect(en[many], `${many} lacks {count}`).toContain('{count}');
    }
  });
});

/**
 * Static audit: every t()/tPlural() call in the extraction scope must resolve
 * against the table at runtime. `t()` is typed, but this catches casts and
 * computed keys, and it fails loudly if a screen regresses to a raw literal
 * key that was never added.
 */
describe('string extraction', () => {
  const roots = [join(process.cwd(), 'app', '(tabs)'), join(process.cwd(), 'app')];
  const files = [
    ...readdirSync(roots[0])
      .filter((name) => name.endsWith('.tsx'))
      .map((name) => join(roots[0], name)),
    join(roots[1], 'settings.tsx'),
  ];

  const KEY_CALL = /\btPlural\(\s*'([^']+)'|\bt\(\s*'([^']+)'/g;

  it('references only keys that exist in the table', () => {
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(KEY_CALL)) {
        const [full, pluralBase, plainKey] = match;
        if (pluralBase) {
          // tPlural takes a base; both siblings must exist for it to resolve.
          expect(
            Object.prototype.hasOwnProperty.call(en, `${pluralBase}One`),
            `${file} tPlural('${pluralBase}') has no ${pluralBase}One in the table`,
          ).toBe(true);
          expect(
            Object.prototype.hasOwnProperty.call(en, `${pluralBase}Many`),
            `${file} tPlural('${pluralBase}') has no ${pluralBase}Many in the table`,
          ).toBe(true);
          continue;
        }
        expect(
          Object.prototype.hasOwnProperty.call(en, plainKey!),
          `${file} references missing key '${plainKey}'`,
        ).toBe(true);
      }
    }
  });

  it('scans the expected number of files', () => {
    expect(files.length).toBeGreaterThanOrEqual(7);
  });
});
