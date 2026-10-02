<div align="center">

<img src="docs/banner.png" alt="TaskFlow — capture, focus, finish" width="820" />

<br />

[![Latest release](https://img.shields.io/github/v/release/Parth-191006/To-do?label=release&color=0D9488)](https://github.com/Parth-191006/To-do/releases/latest)
[![Android build](https://img.shields.io/github/actions/workflow/status/Parth-191006/To-do/android-apk.yml?branch=main&label=android%20build)](https://github.com/Parth-191006/To-do/actions/workflows/android-apk.yml)
[![Verify](https://img.shields.io/badge/verify-63%20assertions%20✓-0D9488)](#verification)
[![Expo SDK](https://img.shields.io/badge/Expo%20SDK-57-111827?logo=expo)](https://expo.dev)
[![No paywall](https://img.shields.io/badge/paywall-none-0D9488)](#features)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**A mobile-first to-do & productivity app** — natural-language capture, an
offline-first SQLite core, actionable and geofenced notifications, a Pomodoro
focus timer, habit streaks and analytics, all under a teal-accented light/dark
design.

### → [Download TaskFlow-latest.apk](https://github.com/Parth-191006/To-do/releases/latest/download/TaskFlow-latest.apk)

**Every feature is unlocked. There is no paywall, no tiers, no feature gating.**

</div>

---

## Download

That button always serves the newest release — no computer, no build tools, no
account:

- **Single arm64-v8a build (~50 MB)** — the CPU architecture of every Android
  phone made since ~2016.
- **Stable URL** — `TaskFlow-latest.apk` never changes between releases, so the
  link is safe to bookmark or share.
- **Updates keep your data** — builds are signed with a persisted CI keystore,
  so a new release installs straight over the previous one.

Release page: <https://github.com/Parth-191006/To-do/releases/latest> · full
walkthrough: [docs/INSTALL.md](docs/INSTALL.md).

---

## Features

**Capture**
- Natural-language input: `Submit report tomorrow 5pm #Work !high ~45m` becomes a
  fully structured task with no date picker — recognised fragments appear as
  inline chips as you type.
- Voice quick-add (with optional transcription) and image attachments, both
  viewable from the task screen.
- **Break down with AI** generates 3–5 subtasks, with an on-device planner
  fallback so the button never dead-ends offline.

**Organisation**
- Subtasks, lists (projects) with colour coding, tags and an inbox.
- Four views over the same data: **List**, **Kanban**, **Calendar agenda**,
  **Eisenhower matrix**.
- The Today screen is sorted into **Overdue → Today → Upcoming → Anytime →
  Completed** so the next action is always at the top.
- Search across titles and notes, plus tag filters.

**Notifications**
- Time reminders and recurrence (daily / weekly / monthly / yearly).
- Geofenced alerts — "remind me when I reach the office" — re-armed the moment
  a reminder changes, not at next launch.
- Actionable banners: **Complete**, **Snooze 5m / 1h / Tomorrow**, **Open**,
  straight from the notification.
- Four Android channels (reminders, urgent with Do-Not-Disturb bypass, focus,
  habits) and iOS time-sensitive interruption levels for urgent tasks.

**Focus & habits**
- Pomodoro timer (15/25/45/50 min) linked to a task, with focus time attributed
  per project and an OS alert when the block ends. Pause keeps your remaining
  time; backgrounding keeps the clock honest.
- Daily habits with streak counters, longest streak, a 5-week heatmap and
  two-tap delete.
- Analytics: completion rate, focus minutes per day, most productive hours,
  focus by project and habit streaks.

**Collaboration & sync**
- Invite a collaborator by email (opens a ready-made draft with the install
  link), see list members and read an activity log.
- Offline-first sync engine for optional Supabase backends: pending-row push,
  delta pull, last-write-wins — plus realtime updates on open lists.

**Design**
- Light / dark / follow-system themes, teal accent, haptics, spring motion and
  a token-driven palette so both themes stay in lockstep.
- The app mark and every icon layer (`assets/*.png`, `docs/banner.png`) are
  rendered from [`scripts/generate-logo.py`](scripts/generate-logo.py) — a bold
  white check on a teal gradient — so the branding and the palette never drift
  apart.

---

## Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | [Expo SDK 57](https://expo.dev) · React Native 0.86 · React 19 | Managed workflow, OTA-friendly, native modules where they matter |
| Navigation | [expo-router](https://docs.expo.dev/router/introduction/) | File-based routes under [`app/`](app) |
| Storage | [expo-sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite/) (WAL) + FTS5 | Instant, offline-first, full-text search |
| State | [Zustand](https://github.com/pmndrs/zustand) | One store, selector-driven renders, no boilerplate |
| Backend (optional) | [Supabase](https://supabase.com) (Postgres, Auth, Realtime, RLS) | Zero-config local mode; sync switches on with two env vars |
| Notifications | expo-notifications + expo-task-manager + expo-location | Scheduling, actionable categories, background geofencing |
| NLP | Hand-rolled parser (no deps) | Deterministic, unit-tested, sub-millisecond on device |

---

## Quick start

```bash
npm install
npx expo start          # press i (iOS), a (Android) or scan the QR code
```

The app uses native modules for notifications, geofencing, audio and SQLite, so
run it in a **development build** for full functionality:

```bash
npx expo run:ios        # or: npx expo run:android
```

Expo Go renders the UI, but local notifications, geofencing and background
tasks are restricted there.

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Start the Expo dev server |
| `npm run ios` / `npm run android` / `npm run web` | Start on a specific platform |
| `npm run typecheck` | `tsc --noEmit` over the whole app |
| `npm run verify:nlp` | 15 assertions against the NLP parser |
| `npm run verify:clock` | 13 assertions against the Pomodoro clock state machine |
| `npm run verify:habits` | 13 assertions against streaks and the check-in toggle |
| `npm run verify:schema` | 7 assertions against migrations, pragmas and the FTS index |
| `npm run verify:geofence` | 15 assertions against the geofence re-arm signature gate |
| `npm run verify` | All of the above in one go — run this before tagging a build |

> Brand assets (`assets/*.png`, `docs/banner.png`) are rendered by
> `python3 scripts/generate-logo.py` (needs Python 3 + Pillow). Re-run it after
> changing the palette so the app icon, adaptive layers, splash and banner all
> stay in step with [`src/theme/tokens.ts`](src/theme/tokens.ts).

## Verification

```bash
npm run verify                    # typecheck + 63 assertions, all green
npx expo export --platform android  # bundling smoke test
npx expo-doctor                   # 21/21 dependency & config checks
```

The suites run the shipping code directly through Node's TypeScript type
stripping — no build step, no test framework:

- **NLP** — date/time/tag/priority/estimate/recurrence extraction, relative and
  absolute dates, token spans, the 30-minute reminder lead, empty input.
- **Focus clock** — pause keeps remaining time, backgrounding re-derives from
  the wall clock, skip banks the partial block.
- **Habits** — streak runs, missed days, and the check-in/undo regression.
- **Schema** — connection pragmas stay outside the migration transaction (the
  bug that once broke every fresh install), migration list integrity, all 14
  tables, idempotent inbox seed, FTS index sync.
- **Geofence** — the re-arm signature gate: unchanged fence sets never touch
  the OS, denied permissions and failed registrations stay retryable, queued
  syncs keep last-write-wins, and completing a fenced task drops its region.

## Environment (all optional)

The app is fully functional with **zero configuration** — SQLite is the source
of truth and every cloud feature degrades to a no-op.

| Variable | Enables |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Cloud sync, auth, real-time shared lists |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | (pairs with the URL above) |
| `EXPO_PUBLIC_AI_ENDPOINT` | Remote AI subtask breakdown (falls back to the on-device planner) |
| `EXPO_PUBLIC_TRANSCRIBE_ENDPOINT` | Voice-to-text (falls back to keeping the audio note attached) |

Create a `.env` (or `app.json` → `expo.extra`) with any of the above. For the
backend, run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
— it creates every table and its row-level security policies.

---

## Architecture

```
app/                      expo-router routes (file-based navigation)
  (tabs)/                 Today · Inbox · Focus · Habits · Insights
  task/[id].tsx           Task detail: subtasks, attachments, editor
  project/[id].tsx        List detail: sharing, invite, activity
  settings.tsx            Appearance, notifications, sync, data
src/
  domain/                 Shared types + pure habit maths
  db/                     SQLite client, migrations, mappers, repositories
  nlp/parser.ts           Natural-language task parser (pure, no deps)
  services/
    notifications/        Scheduling, categories, actions, geofencing
    ai/                   Subtask breakdown + speech-to-text
    sync/                 Offline-first push/pull engine
    supabase/             Optional backend client (auth included)
  store/                  Zustand store + pure selectors
  components/             UI primitives, dashboard, views (kanban/agenda/matrix)
  theme/                  Design tokens + light/dark provider
supabase/migrations/      Postgres schema + RLS policies
scripts/verify-*.ts       Runnable assertion suites (see Scripts)
.github/workflows/        Android build, sign and release pipeline
```

See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for the full data schema,
notification engine design, sync strategy and the reasoning behind each choice.

---

## Building & releasing

Release APKs are built entirely by GitHub Actions — no local Android SDK
required. Every run of [`android-apk.yml`](.github/workflows/android-apk.yml):

1. restores (or creates) the release keystore from a cached artifact,
2. runs `npx expo prebuild` and assembles a **signed arm64-v8a** release,
3. verifies the signature and uploads `TaskFlow-apk-<run>` as a run artifact,
4. on a version tag, publishes a GitHub release with
   **`TaskFlow-latest.apk`** (stable permalink) and **`TaskFlow-v<version>-arm64-v8a.apk`**.

Because the keystore persists between runs, release APKs share one signature:
updates install over existing installs without losing local data.

### Install in 30 seconds

1. Copy the `.apk` to your phone (download directly, or email/Drive/USB).
2. Tap it in **Files → Downloads**.
3. Allow **Install unknown apps** for that source when prompted (the normal
   sideloading dialog — the APK isn't from the Play Store).
4. Open **TaskFlow**, grant the notification permission. Done.

Troubleshooting and older-build caveats: **[docs/INSTALL.md](docs/INSTALL.md)**.

### iOS

There is no public APK equivalent for iOS (Apple requires signed IPAs via
TestFlight or a device registration). Options: run from source with
`npx expo run:ios`, preview in Expo Go, or use
[`eas build`](https://docs.expo.dev/build/introduction/) with the included
[`eas.json`](eas.json) for a TestFlight-ready archive.

---

## Platform notes

- **Android** creates four notification channels (`reminders`, `urgent`,
  `focus`, `habits`); the urgent channel requests `bypassDnd`. Exact-alarm and
  background-location permissions are declared in [`app.json`](app.json).
- **iOS** uses `interruptionLevel: 'timeSensitive'` for urgent tasks;
  `'critical'` alerts require a special Apple entitlement and are not used.
- Haptics and location features are silently skipped on platforms or devices
  that do not support them — they are flourishes, never blockers.

## Contributing

Issues and pull requests are welcome. Before opening a PR:

```bash
npm run verify                    # typecheck + all 63 assertions
npx expo export --platform android  # ensure the bundle builds
```

Keep changes token-driven (no hardcoded colours outside `src/theme/tokens.ts`
and the documented notification accents) and add a `verify-*` assertion for any
pure logic you touch.

## License

Released under the [MIT License](LICENSE).

Built with [Expo](https://expo.dev), [React Native](https://reactnative.dev),
[SQLite](https://www.sqlite.org) and [Supabase](https://supabase.com).
