/**
 * Static checks over the Maestro flows in `.maestro/`.
 *
 * The flows themselves need a device and an installed build, so they cannot run
 * in CI. What *can* run is the part that breaks silently: a flow that no longer
 * parses, one that targets a `testID` nobody defines any more, a subflow that
 * was renamed, or a flow that exists on disk but is not matched by
 * `config.yaml`'s globs and so is never discovered.
 *
 * This is deliberately not a text-selector drift guard. Proving that
 * `tapOn: "Tomorrow"` still matches would mean reimplementing the parser's label
 * construction here, and a test that guesses at the selector space is worse
 * than no test: it passes for the wrong reasons. The `id` selectors are checked
 * exactly, because a `testID` is a literal token.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { parseAllDocuments } from 'yaml';

const root = fileURLToPath(new URL('..', import.meta.url));
const maestroDir = join(root, '.maestro');

/** A Maestro flow is two YAML documents: a header, then the command list. */
interface Flow {
  /** POSIX-style path relative to the repo root. */
  file: string;
  header: Record<string, unknown>;
  commands: unknown[];
  /** Parser diagnostics — a syntax error must fail the suite. */
  errors: string[];
}

function listYaml(dir = maestroDir): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...listYaml(full));
    else if (entry.endsWith('.yaml')) found.push(relative(root, full).split(sep).join('/'));
  }
  return found.sort();
}

function readFlow(file: string): Flow {
  const docs = parseAllDocuments(readFileSync(join(root, file), 'utf8'));
  return {
    file,
    header: (docs[0]?.toJS() ?? {}) as Record<string, unknown>,
    commands: (docs[1]?.toJS() ?? []) as unknown[],
    errors: docs.flatMap((doc) => doc.errors).map((error) => error.message),
  };
}

/**
 * Every test identifier defined anywhere in the app, in either form it is
 * written: the `testID` prop on a component, and `tabBarButtonTestID` in a
 * `Tabs.Screen` options object (which React Navigation forwards to the tab
 * button's `testID`).
 */
function collectTestIDs(): Set<string> {
  const ids = new Set<string>();
  const patterns = [/testID=\{?["']([^"']+)["']/g, /tabBarButtonTestID:\s*["']([^"']+)["']/g];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      const source = readFileSync(full, 'utf8');
      for (const pattern of patterns) {
        for (const match of source.matchAll(pattern)) ids.add(match[1]!);
      }
    }
  };
  walk(join(root, 'src'));
  walk(join(root, 'app'));
  return ids;
}

/**
 * A `flows:` entry is a file glob. Only `*` and `**` are used here, so this
 * stays a dozen lines instead of pulling in a glob dependency.
 */
function matchesGlob(pattern: string, path: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*|\*/g, (run) => (run === '**' ? '.*' : '[^/]*'));
  return new RegExp(`^${escaped}$`).test(path);
}

interface Selector {
  file: string;
  kind: 'id' | 'text' | 'path';
  value: string;
}

/** Pulls the selectors a flow uses out of its parsed command list. */
function collectSelectors(flow: Flow): Selector[] {
  const found: Selector[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== 'object') return;

    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === 'id' && typeof value === 'string') {
        found.push({ file: flow.file, kind: 'id', value });
      } else if (key === 'runFlow' && typeof value === 'string') {
        found.push({ file: flow.file, kind: 'path', value });
      } else if (
        typeof value === 'string' &&
        (key === 'text' || key === 'tapOn' || key === 'assertVisible' || key === 'inputText')
      ) {
        found.push({ file: flow.file, kind: 'text', value });
      }
      visit(value);
    }
  };
  visit(flow.commands);
  return found;
}

const configFile = '.maestro/config.yaml';
const allFiles = listYaml();
const flowFiles = allFiles.filter((file) => file !== configFile && !file.includes('/subflows/'));
const subflowFiles = allFiles.filter((file) => file.includes('/subflows/'));
const flows = allFiles.filter((file) => file !== configFile).map(readFlow);

const appId = (
  JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')) as {
    expo: { android: { package: string } };
  }
).expo.android.package;

describe('Maestro flows', () => {
  it('ships the flows the suite claims, plus their subflows', () => {
    expect(flowFiles).toHaveLength(5);
    expect(subflowFiles.length).toBeGreaterThanOrEqual(1);
  });

  it('parses as YAML — header mapping and a non-empty command list', () => {
    for (const flow of flows) {
      expect(flow.errors, `${flow.file} has YAML syntax errors`).toEqual([]);
      expect(typeof flow.header, flow.file).toBe('object');
      expect(typeof flow.header.appId, `${flow.file} has no appId`).toBe('string');
      expect(Array.isArray(flow.commands), `${flow.file} has no command list`).toBe(true);
      expect(flow.commands.length, `${flow.file} has an empty command list`).toBeGreaterThan(0);
    }
  });

  it('targets this app on every flow and subflow', () => {
    for (const flow of flows) expect(flow.header.appId, flow.file).toBe(appId);
  });

  it('finds flow files on disk that config.yaml would never discover', () => {
    const globs = (parseAllDocuments(readFileSync(join(root, configFile), 'utf8'))[0]?.toJS() ??
      {}) as Record<string, unknown>;
    const patterns = globs.flows as string[];
    expect(Array.isArray(patterns), 'config.yaml has no `flows` list').toBe(true);

    const discovered = allFiles.filter((file) =>
      patterns.some((pattern) => matchesGlob(pattern, relative('.maestro', file).split(sep).join('/'))),
    );

    for (const file of flowFiles) {
      expect(discovered, `${file} is not matched by config.yaml's globs`).toContain(file);
    }
    // A subflow has no `launchApp` of its own; running it as a test must fail
    // here rather than on a device.
    for (const file of subflowFiles) {
      expect(discovered, `${file} would be run as a standalone test`).not.toContain(file);
    }
    expect(discovered.sort()).toEqual(flowFiles);
  });

  it('resolves every runFlow path to a file on disk', () => {
    const paths = flows.flatMap(collectSelectors).filter((selector) => selector.kind === 'path');
    expect(paths.length, 'no runFlow paths found — the extractor is broken').toBeGreaterThan(0);

    for (const selector of paths) {
      expect(allFiles, `${selector.file} runs a missing subflow: ${selector.value}`).toContain(
        `.maestro/${selector.value}`,
      );
    }
  });

  it('only addresses testIDs the app actually defines', () => {
    const defined = collectTestIDs();
    const ids = flows.flatMap(collectSelectors).filter((selector) => selector.kind === 'id');
    expect(ids.length, 'no id selectors found — the extractor is broken').toBeGreaterThan(0);

    for (const selector of ids) {
      expect(defined, `${selector.file} taps an undefined testID: ${selector.value}`).toContain(
        selector.value,
      );
    }
  });
});
