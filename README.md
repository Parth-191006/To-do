# TaskFlow

A mobile-first To-Do and task management app built with Expo + React Native:
smart natural-language capture, offline-first SQLite storage, actionable and
geofenced notifications, a Pomodoro focus timer, habit streaks and productivity
analytics.

**Every feature is unlocked. There is no paywall, no tiers, no feature gating.**

---

## Quick start

```bash
npm install
npx expo start          # then press i (iOS), a (Android) or scan the QR code
```

Because the app uses native modules for notifications, location geofencing and
SQLite, run it in a **development build**:

```bash
npx expo run:ios        # or: npx expo run:android
```

Expo Go can render the UI, but local notifications, geofencing and background
tasks are restricted there — the scheduling code is written for a dev build.

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Start the Expo dev server |
| `npm run ios` / `npm run android` / `npm run web` | Start on a specific platform |
| `npm run typecheck` | `tsc --noEmit` over the whole app |
| `npm run verify:nlp` | Runs 15 assertions against the real NLP parser |
| `npm run lint` | `expo lint` |

## Environment (all optional)

The app is fully functional with **zero configuration** — SQLite is the source
of truth and every cloud feature degrades to a no-op.

| Variable | Enables |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Cloud sync, auth, real-time shared lists |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | (same, pairs with the URL above) |
| `EXPO_PUBLIC_AI_ENDPOINT` | Remote AI subtask breakdown (falls back to the on-device planner) |
| `EXPO_PUBLIC_TRANSCRIBE_ENDPOINT` | Voice-to-text (falls back to keeping the audio note attached) |

Create a `.env` (or `app.json` → `expo.extra`) with any of the above. To set up
the backend, run `supabase/migrations/0001_init.sql` — it creates every table
and its row-level security policies.

---

## Features

**Capture**
- Natural-language input: `Submit report tomorrow 5pm #Work !high ~45m` becomes a
  fully structured task with no date picker. Recognised fragments appear as
  inline chips as you type.
- Voice quick-add and image attachments.
- "Break down with AI" generates 3–5 subtasks, with an offline planner fallback.

**Organisation**
- Infinite subtask nesting, projects with colour coding, tags, inbox.
- Four views over the same data: **List**, **Kanban**, **Calendar agenda**,
  **Eisenhower matrix**.
- Search across titles and notes, plus tag and status filters.

**Notifications**
- Time and recurring reminders (daily / weekly / monthly / yearly).
- Geofenced alerts — "remind me when I reach the office".
- Actionable banners: **Complete**, **Snooze 5m / 1h / Tomorrow**, **Open**.
- Urgent mode that bypasses Do Not Disturb via an Android DND-bypassing channel
  and iOS time-sensitive interruption levels.

**Focus & habits**
- Pomodoro timer (15/25/45/50 min) linked to a task, with focus time attributed
  per project and an OS alert when the block ends.
- Daily habits with streak counters, longest streak, and a 5-week heatmap.
- Analytics: completion rate, focus minutes per day, most productive hour, focus
  by project, habit streak summary.

**Collaboration**
- Share a list, see members, and read an activity log of who changed what.
- Real-time updates through Supabase Realtime and RLS-scoped access.

---

## Project layout

```
app/                      expo-router routes (file-based navigation)
  (tabs)/                 Today · Inbox · Focus · Habits · Insights
  task/[id].tsx           Task detail with subtasks
  project/[id].tsx        Project detail with sharing + activity
  settings.tsx            Appearance, notifications, sync, data
src/
  domain/types.ts         Shared domain model
  db/                     SQLite client, migrations, mappers, repositories
  nlp/parser.ts           Natural-language task parser (pure, no deps)
  services/
    notifications/        Scheduling, categories, actions, geofencing
    ai/                   Subtask breakdown + speech-to-text
    sync/                 Offline-first push/pull engine
    supabase/             Optional backend client
  store/                  Zustand store + pure selectors
  components/             UI primitives and feature components
  theme/                  Design tokens + light/dark provider
supabase/migrations/      Postgres schema + RLS policies
scripts/verify-nlp.ts     Runnable parser assertions
```

See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for the full data schema, routing
plan, notification engine design, sync strategy and the reasoning behind each
choice.

---

## Verification

```bash
npm run typecheck      # clean
npm run verify:nlp     # 15 checks passed
npx expo export --platform android    # bundling smoke test
```

The NLP suite covers date/time/tag/priority/estimate/recurrence extraction,
relative and absolute dates, token spans, the 30-minute reminder lead and empty
input. It runs the shipping parser directly via Node's TypeScript type
stripping — no build step, no test framework.

---

## 📱 Get the app (APK)

Install TaskFlow on any Android phone — no Play Store, no account.

> **Full walkthrough with screenshots-level detail: [docs/INSTALL.md](docs/INSTALL.md)**

### Download the APK

| Source | How | Best for |
| --- | --- | --- |
| **Actions artifact** | [Actions → Android APK → Run workflow](https://github.com/Parth-191006/To-do/actions/workflows/android-apk.yml) → wait ~15–20 min → download **TaskFlow-apk-\<n\>** from the run's Artifacts | Latest code, any time |
| **Releases page** | **Releases** → latest version → download the `.apk` asset | Stable, shareable, permanent links |
| **Build it yourself** | `git clone` → `npm ci` → `npx expo prebuild -p android` → `cd android && ./gradlew assembleRelease` | No CI, full control |

### Install in 30 seconds

1. Copy the `.apk` to your phone (download directly, or email/Drive/USB).
2. Tap it in **Files → Downloads**.
3. Allow **Install unknown apps** for that source when prompted (normal
   sideloading dialog — the APK isn't from the Play Store).
4. Open **TaskFlow**, grant the notification permission. Done.

> Updating across CI builds: each workflow run signs with a fresh key, so
> **uninstall the old build before installing a new one**. To get a stable
> signature (in-place updates), add your keystore to repo secrets —
> [docs/INSTALL.md](docs/INSTALL.md) has the exact steps.

### iOS

No public APK-equivalent for iOS (Apple requires signed IPAs via TestFlight or
a device registration). Easiest options: run from source with
`npx expo run:ios`, use **Expo Go** for a quick preview, or use
[`eas build`](https://docs.expo.dev/build/introduction/) with the included
[`eas.json`](eas.json) for a TestFlight-ready archive.

---

## Platform notes

- **Android** creates four notification channels (`default`, `urgent`, `focus`,
  `habits`); the urgent channel requests `bypassDnd`. Exact-alarm and background
  location permissions are declared in `app.json`.
- **iOS** uses `interruptionLevel: 'timeSensitive'` for urgent tasks.
  `'critical'` alerts require a special Apple entitlement and are not used.
- Haptics and location features are silently skipped on platforms or devices
  that do not support them — they are flourishes, never blockers.
