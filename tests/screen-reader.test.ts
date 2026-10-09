import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { typography } from '@/theme/tokens';
import {
  BASE_TAB_BAR_HEIGHT,
  describeTask,
  playPauseLabel,
  tabBarHeight,
  toggleTaskLabel,
} from '@/utils/a11y';

/* -------------------------------------------------------------------------- */
/*                          Pure screen-reader copy                            */
/* -------------------------------------------------------------------------- */

describe('verify screen-reader task descriptions', () => {
  it('keeps the plain title when nothing else is set', () => {
    expect(describeTask({ title: 'Draft the brief' })).toBe('Draft the brief');
  });

  it('adds priority only when it is not none', () => {
    expect(describeTask({ title: 'Draft the brief', priority: 'high' })).toBe(
      'Draft the brief, high priority',
    );
    expect(describeTask({ title: 'Draft the brief', priority: 'none' })).toBe('Draft the brief');
  });

  it('announces completion', () => {
    expect(describeTask({ title: 'Draft the brief', done: true })).toBe(
      'Draft the brief, completed',
    );
  });

  it('orders title, priority, completion — the same order every surface uses', () => {
    expect(describeTask({ title: 'Ship it', priority: 'urgent', done: true })).toBe(
      'Ship it, urgent priority, completed',
    );
  });

  it('reads the title verbatim, including punctuation and emoji', () => {
    expect(describeTask({ title: 'Water the 🌱 plants!!' })).toBe('Water the 🌱 plants!!');
  });
});

describe('verify the completion toggle announces the opposite verb', () => {
  it('offers to complete an undone task', () => {
    expect(toggleTaskLabel('Draft the brief', false)).toBe('Mark “Draft the brief” complete');
  });

  it('offers to un-complete a done task', () => {
    expect(toggleTaskLabel('Draft the brief', true)).toBe('Mark “Draft the brief” not complete');
  });

  it('keeps the quoted title intact', () => {
    expect(toggleTaskLabel('Buy "milk" & eggs', false)).toBe('Mark “Buy "milk" & eggs” complete');
  });
});

describe('verify voice-note play/pause labels flip with state', () => {
  it('says Play when stopped', () => {
    expect(playPauseLabel('note.m4a', false)).toBe('Play voice note note.m4a');
  });

  it('says Pause while playing', () => {
    expect(playPauseLabel('note.m4a', true)).toBe('Pause voice note note.m4a');
  });

  it('falls back to a generic subject when the file has no name', () => {
    expect(playPauseLabel(null, false)).toBe('Play voice note');
    expect(playPauseLabel(undefined, true)).toBe('Pause voice note');
  });
});

/* -------------------------------------------------------------------------- */
/*                          Font-scale-aware layout                           */
/* -------------------------------------------------------------------------- */

describe('verify the tab bar grows with the OS text scale', () => {
  it('matches the old fixed height at the default scale', () => {
    expect(tabBarHeight(1, 0)).toBe(BASE_TAB_BAR_HEIGHT);
    expect(tabBarHeight(1, 24)).toBe(BASE_TAB_BAR_HEIGHT + 24);
  });

  it('grows proportionally so labels never clip', () => {
    expect(tabBarHeight(1.5, 0)).toBe(Math.round(BASE_TAB_BAR_HEIGHT * 1.5));
    expect(tabBarHeight(2, 0)).toBe(BASE_TAB_BAR_HEIGHT * 2);
    expect(tabBarHeight(2, 0)).toBeGreaterThan(tabBarHeight(1, 0));
  });

  it('never shrinks below the base height when the user picks smaller text', () => {
    expect(tabBarHeight(0.8, 0)).toBe(BASE_TAB_BAR_HEIGHT);
    expect(tabBarHeight(0, 0)).toBe(BASE_TAB_BAR_HEIGHT);
  });

  it('caps the growth so extreme scales do not eat the whole screen', () => {
    expect(tabBarHeight(10, 0)).toBe(Math.round(BASE_TAB_BAR_HEIGHT * 2.5));
  });

  it('survives nonsense input and negative insets', () => {
    // Non-finite scales are nonsense input, not a real text setting: fall
    // back to the base height rather than trusting them.
    expect(tabBarHeight(Number.NaN, 0)).toBe(BASE_TAB_BAR_HEIGHT);
    expect(tabBarHeight(Number.POSITIVE_INFINITY, 0)).toBe(BASE_TAB_BAR_HEIGHT);
    expect(tabBarHeight(1, -10)).toBe(BASE_TAB_BAR_HEIGHT);
  });
});

describe('verify typography stays scalable', () => {
  it('sets no fixed line heights, which would clip enlarged text', () => {
    for (const [name, style] of Object.entries(typography)) {
      expect((style as Record<string, unknown>).lineHeight, `${name} lineHeight`).toBeUndefined();
    }
  });
});

/* -------------------------------------------------------------------------- */
/*                     Static audit: roles and labels exist                   */
/* -------------------------------------------------------------------------- */

function collectTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectTsx(full, out);
    else if (full.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/**
 * Opening tags of `<tag ... >`, stopping at the first `>` outside braces.
 * Each entry carries the index just past the tag so children can be sliced
 * from the right place even when two tags are byte-identical.
 */
function openingTags(source: string, tag: string): { tag: string; after: number }[] {
  const tags: { tag: string; after: number }[] = [];
  let idx = 0;
  while ((idx = source.indexOf('<' + tag, idx)) !== -1) {
    const next = source[idx + 1 + tag.length];
    if (next !== ' ' && next !== '>' && next !== '\n' && next !== '/') {
      idx += tag.length;
      continue;
    }
    let depth = 0;
    let end = -1;
    for (let i = idx; i < source.length; i++) {
      const ch = source[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '>' && depth <= 0) {
        end = i;
        break;
      }
    }
    if (end === -1) return tags;
    tags.push({ tag: source.slice(idx, end + 1), after: end + 1 });
    idx = end + 1;
  }
  return tags;
}

const roots = [resolve(process.cwd(), 'src'), resolve(process.cwd(), 'app')];
const sources = roots.flatMap((root) => collectTsx(root)).map((file) => ({
  file: file.slice(resolve(process.cwd()).length + 1),
  source: readFileSync(file, 'utf8'),
}));

/** Props arriving through a spread cannot be checked statically. */
const spreadsProps = (tag: string) => tag.includes('{...');

describe('verify every control has an accessibility role', () => {
  const offenders: string[] = [];
  for (const { file, source } of sources) {
    for (const name of ['Pressable', 'ScalePress']) {
      for (const { tag } of openingTags(source, name)) {
        if (!/onPress=|onLongPress=/.test(tag)) continue;
        if (spreadsProps(tag)) continue;
        if (tag.includes('accessibilityRole=')) continue;
        offenders.push(`${file}: ${tag.replace(/\s+/g, ' ').slice(0, 90)}`);
      }
    }
  }

  it('finds pressables without a role (add accessibilityRole)', () => {
    expect(offenders).toEqual([]);
  });

  it('audited a plausible number of files', () => {
    expect(sources.length).toBeGreaterThan(30);
  });
});

describe('verify every text field has an accessibility label', () => {
  const offenders: string[] = [];
  for (const { file, source } of sources) {
    for (const { tag } of openingTags(source, 'TextInput')) {
      if (spreadsProps(tag)) continue;
      if (tag.includes('accessibilityLabel=')) continue;
      offenders.push(`${file}: ${tag.replace(/\s+/g, ' ').slice(0, 90)}`);
    }
  }

  it('finds inputs without a label (add accessibilityLabel)', () => {
    expect(offenders).toEqual([]);
  });
});

describe('verify icon-only buttons are labelled', () => {
  // A pressable with no <Text> before its first nested close tag has nothing
  // for the screen reader to fall back on — its label is mandatory.
  const offenders: string[] = [];
  for (const { file, source } of sources) {
    for (const name of ['Pressable', 'ScalePress']) {
      for (const { tag: open, after } of openingTags(source, name)) {
        if (!/onPress=/.test(open)) continue;
        if (spreadsProps(open)) continue;
        if (open.includes('accessibilityLabel=')) continue;
        const start = after;
        const closeAt = source.indexOf('</', start);
        if (closeAt === -1) continue;
        const children = source.slice(start, closeAt);
        const iconOnly = /<(Ionicons|BrandMark|ActivityIndicator)[\s/>]/.test(children);
        const hasText = children.includes('<Text');
        if (iconOnly && !hasText) {
          offenders.push(`${file}: ${open.replace(/\s+/g, ' ').slice(0, 90)}`);
        }
      }
    }
  }

  it('finds silent icon-only controls (add accessibilityLabel)', () => {
    expect(offenders).toEqual([]);
  });
});
