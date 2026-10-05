# Contributing to TaskFlow

Thanks for helping. TaskFlow is an offline-first app: the rule that overrides
every other rule is **the app must work with no network and no backend**.

## Getting set up

```bash
npm install
npx expo start          # i (iOS) · a (Android) · or scan the QR code
```

Native modules (notifications, geofencing, audio, SQLite) need a development
build for full functionality:

```bash
npx expo run:android    # or: npx expo run:ios
```

Requirements: **Node 24** (the schema suite uses the built-in `node:sqlite`),
and Python 3 with Pillow if you touch the brand assets.

## Before you open a pull request

```bash
npm run verify        # tsc --noEmit + the whole Vitest suite
npm run verify:brand  # generated logo assets still match the palette (needs Pillow)
```

`npm run verify` is what CI runs. Both must be green.

| Command | What it does |
| --- | --- |
| `npm run test` | Vitest once, non-interactive |
| `npm run test:watch` | Vitest in watch mode |
| `npm run typecheck` | `tsc --noEmit` over app + tests |
| `npm run verify` | typecheck + tests — the pre-tag check |
| `npm run verify:brand` | asserts the icon/adaptive/splash/favicon/banner are correct |

## Writing tests

Suites live in [`tests/`](tests) and import the shipping modules through the
same `@/…` alias the app uses — they are not tests of a copy.

Add a test when you touch **pure logic**: parsing, selectors, the focus clock,
streaks, the geofence gate, the schema, the sync merge, FTS query building.
Modules that import native APIs are deliberately kept thin and pure so they can
be tested; if you add logic that needs `expo-*` at import time, pull the pure
part into its own module and test that.

`tests/fts.test.ts` opens a real in-memory SQLite database. That is on purpose:
an FTS5 syntax error only exists at `MATCH` time, so a string comparison is not
enough to prove a query is safe.

## Style

- **There is no formatter config in this repo.** Do not run Prettier or
  equivalent over the tree — it rewrites quoting and line breaks across files
  you did not mean to touch. Match the style of the code around your change.
- Colours, spacing, radii, type sizes and motion come from
  [`src/theme/tokens.ts`](src/theme/tokens.ts). **No hardcoded colours** in
  components (the documented notification accents are the only exception).
- Every icon-only button needs an accessibility label; keep interactive targets
  at 48 dp or larger.
- Write comments that explain *why*, especially around notification scheduling,
  permissions, sync merges and migrations. A comment that restates the code is
  noise.
- Schema changes need a numbered migration in `src/db/schema.ts` **and** a
  matching column in `supabase/migrations/`, plus a test that pins the new
  column.

## Brand assets

The logo is generated, not drawn by hand:

```bash
python3 scripts/generate-logo.py   # icon, adaptive layers, splash, favicon, banner
python3 scripts/verify-brand.py    # 13 assertions that they are correct
```

`src/components/BrandMark.tsx` is the vector twin used in the UI, and
`src/theme/tokens.ts` carries the same palette. Change all three together.

## Commits and pull requests

Commit subjects use a type prefix: `feat:`, `fix:`, `docs:`, `ci:`, `test:`,
`refactor:`, `chore:` — and describe *why* the change exists in the body.

In the pull request description, cover:

1. What changed and why.
2. How you verified it (`npm run verify`, and on a device if you ran one).
3. Anything you could not verify, explicitly — a limitation stated in the PR is
   fine, a silently untested change is not.

## Reporting bugs

Use the bug report template and include the APK version (Settings → About) and
your device. If the app misbehaved offline, say so — offline behaviour is the
part we care most about.
