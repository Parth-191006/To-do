# TaskFlow — System Architecture

A mobile-first To-Do and task management app: offline-first SQLite storage, a
hand-written natural-language capture engine, an OS-level notification scheduler
with actionable alerts and geofencing, a Pomodoro focus timer, habit tracking
with streaks, productivity analytics and real-time list collaboration.

> **Product decision: there is no paywall.** Every feature described here ships
> unlocked — no free/pro split, no feature gating, no subscription context.
> The subscription layer was removed from the design at the request of the
> product owner; see [§9](#9-removing-the-freemium-layer).

---

## 1. Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Mobile runtime | Expo SDK 57 · React Native 0.86 · React 19 | Managed native modules, OTA updates, one codebase for iOS + Android |
| Language | TypeScript 6, `strict` | The domain model is shared by DB, sync, NLP and UI — types carry their weight |
| Routing | `expo-router` (file-based) | Deep links (`/task/:id`) come for free, which the notification payloads rely on |
| Local storage | `expo-sqlite` (WAL, FTS5, foreign keys) | Relational data with subtask trees and analytics aggregations; instant + offline |
| State | Zustand | Tiny, no provider tree, easy to call from outside React (notification handlers) |
| Notifications | `expo-notifications` + `expo-task-manager` + `expo-location` | Local scheduling, categories/actions, geofencing |
| Backend | Supabase (Postgres + Auth + Realtime + Edge Functions) | Optional at runtime; the app is fully functional without it |
| Motion | RN `Animated` + `PanResponder` | No worklet runtime required for swipe/confetti/sheets; fewer moving parts |
| Charts | `react-native-svg` | Progress rings and the focus timer |
| Icons | `@expo/vector-icons` (Ionicons) | Consistent set, bundled with Expo |

**Why SQLite is the source of truth.** Every screen reads from local tables, so
the app is instant on a cold start and fully usable in airplane mode. The cloud
is a replication target, never a dependency on the read path.

---

## 2. High-level architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                              UI LAYER                                │
│  app/(tabs)  ─ Today · Inbox · Focus · Habits · Insights             │
│  app/task/[id] · app/project/[id] · app/settings                     │
│                                                                      │
│  components/  TaskDashboard · SmartInput · TaskCard · KanbanBoard …  │
└───────────────┬──────────────────────────────────────────────────────┘
                │ Zustand selectors + actions
┌───────────────▼──────────────────────────────────────────────────────┐
│                            STORE LAYER                               │
│  store/useStore.ts      – state + actions (single write path)        │
│  store/selectors.ts     – pure derivations (today/overdue/Eisenhower)│
└───────────────┬───────────────────────────────┬──────────────────────┘
                │                               │
┌───────────────▼──────────────┐  ┌─────────────▼──────────────────────┐
│        DOMAIN LAYER          │  │           SERVICE LAYER            │
│  db/repositories/*           │  │  nlp/parser          (pure)        │
│   tasks · projects · tags    │  │  services/ai/breakdown             │
│   habits · focus             │  │  services/ai/transcribe            │
│   notifications · activity   │  │  services/notifications/*          │
│  db/mappers (row ⇄ domain)   │  │  services/sync/engine              │
└───────────────┬──────────────┘  │  services/supabase/client          │
                │                 └─────────────┬──────────────────────┘
┌───────────────▼───────────────────────────────▼──────────────────────┐
│                          PERSISTENCE LAYER                           │
│  expo-sqlite (WAL)  ⟷  Supabase Postgres (RLS + Realtime)            │
│  sync_state='pending' rows + sync_outbox → last-write-wins merge      │
└──────────────────────────────────────────────────────────────────────┘
                                     ▲
                          OS: notifications, geofences,
                          background tasks, haptics
```

The dependency rule: **UI → store → repositories → SQLite**. Services are
called *by* the store, never the reverse. The NLP parser and the selectors are
pure functions with no I/O, which is why they are directly unit-testable (see
`scripts/verify-nlp.ts`).

---

## 3. Data schema

Two schemas that mirror each other column-for-column: SQLite on device
(`src/db/schema.ts`) and Postgres in Supabase
(`supabase/migrations/0001_init.sql`). Identical `snake_case` columns mean the
sync engine pushes and pulls rows without a mapping layer.

### Relationship overview

```
user_profiles
   │
   ├── projects ──< list_members >── user_profiles        (collaboration)
   │      │
   │      └──< tasks ──< task_tags >── tags
   │             │
   │             ├──< tasks            (parent_id → self-referencing tree)
   │             └──< focus_sessions
   │
   ├── habits ──< habit_logs
   └── activity_logs
```

### Tables

**`tasks`** — the core entity.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text (uuid) | Client-generated so offline creates never collide |
| `project_id` | text → `projects.id` | `NULL` = Inbox; `ON DELETE SET NULL` |
| `parent_id` | text → `tasks.id` | Self-reference: **infinite subtask nesting** with one table |
| `title` / `notes` | text | Indexed by FTS5 (`tasks_fts`) on device, GIN tsvector in Postgres |
| `status` | text | `todo` · `in_progress` · `done` · `archived` |
| `priority` | text | `none` · `low` · `medium` · `high` · `urgent` |
| `due_at` / `remind_at` | ISO text | Indexed; drives the agenda and the notification scheduler |
| `recurrence` | JSON | `{ frequency, interval, byWeekday[], until }` |
| `location_reminder` | JSON | `{ latitude, longitude, radius, trigger, label }` |
| `estimate_minutes` | int | Populated by NLP (`~45m`) or split across AI subtasks |
| `attachments` | JSON array | `{ id, kind: image/audio/file, uri, name, durationMs }` |
| `position` | real | Manual ordering; fractional so inserts need no re-index |
| `completed_at` | ISO text | Powers "completed today" and the hourly productivity heat |
| `deleted_at` | ISO text | **Soft delete** so deletions propagate to collaborators |
| `sync_state` | text | `synced` · `pending` · `conflict` |

**`projects`** — `name`, `color`, `icon`, `is_archived`, `position`, tombstones.
**`tags`** — unique per name (case-insensitive), auto-assigned stable colour from
the name hash so re-creating a tag keeps its colour.
**`task_tags`** — join table. Has no `updated_at`, so tag assignment is the one
operation captured in `sync_outbox` rather than by row diffing.
**`habits`** — `cadence` (daily/weekly), `target_per_period`, `by_weekday[]`.
**`habit_logs`** — one row per `(habit, local date)`. Stored as a **local**
`YYYY-MM-DD` key so streaks survive timezone changes; `count` allows multiple
check-ins per day and shades the heatmap by intensity.
**`focus_sessions`** — `task_id`, `project_id`, `started_at`, `ended_at`,
`duration_seconds`, `kind` (focus/break), `completed`. Minutes per project and
per day are aggregated straight out of this table.
**`notification_records`** — a *mirror* of what we asked the OS to schedule:
`os_identifier`, `task_id`/`habit_id`, `kind`, `trigger_at`, `recurrence`,
`status`. This is what makes cancel/reschedule deterministic after a restart.
**`sync_outbox`** — explicit non-row operations (`set_task_tags`) with
`attempts` + `last_error` for retry and poison-row pruning.
**`sync_meta`** — key/value, holds `sync.last_pull_at` for delta pulls.
**`list_members`** — `project_id`, `user_id`, `role` (owner/editor/viewer).
**`activity_logs`** — who did what, for the collaboration feed on a shared list.

### Integrity rules

- `PRAGMA foreign_keys = ON` and `journal_mode = WAL` on every connection.
- FTS5 mirror table `tasks_fts` kept in sync by `AFTER INSERT/UPDATE/DELETE`
  triggers.
- Completing a parent marks its direct children `done`; deleting a parent
  cascades the **soft** delete down the whole tree (iterative BFS, no recursion
  limit).
- Postgres enforces the same enums as `CHECK` constraints and isolates every
  row with RLS: a task is visible if you own it or you are a member of its
  project. `can_access_project(uuid)` centralises that predicate.

---

## 4. App structure & routing plan

`expo-router` maps the file tree to routes, so the navigation hierarchy *is* the
folder structure.

```
app/
├── _layout.tsx              Root: SafeAreaProvider → ThemeProvider → Stack
│                            · opens + migrates SQLite
│                            · configures notification channels/categories
│                            · subscribes to notification responses → toast + refresh
│
├── (tabs)/
│   ├── _layout.tsx          Bottom tab bar (5 destinations)
│   ├── index.tsx            TODAY      → TaskDashboard (the primary surface)
│   ├── inbox.tsx            INBOX      → search, filters, tag filter, all tasks
│   ├── focus.tsx            FOCUS      → FocusTimer (Pomodoro)
│   ├── habits.tsx           HABITS     → HabitTracker (streaks + heatmap)
│   └── insights.tsx         INSIGHTS   → AnalyticsPanel
│
├── task/[id].tsx            Task detail: subtasks, AI breakdown, edit sheet
├── project/[id].tsx         Project detail: progress, tasks, activity, sharing
├── settings.tsx             Appearance · notifications · sync · data (modal)
└── +not-found.tsx
```

### Navigation flow

```
Today ──tap task──────────▶ /task/:id ──▶ subtask ─▶ /task/:subtaskId  (recursive)
  │                              └──edit──▶ TaskEditorSheet (bottom sheet, in place)
  ├──view toggle──▶ List │ Kanban │ Agenda │ Matrix      (same screen, no navigation)
  ├──FAB───────────▶ Focus tab · New project · AI hint
  ├──options───────▶ /settings
  └──project chip──▶ /project/:id ──▶ task cards → TaskEditorSheet

Notification banner ──▶ Complete / Snooze 5m / 1h / Tomorrow / Open
                                  │
                                  └─▶ deep link `/task/:id` when "Open"
```

**Why bottom sheets instead of routes for editing.** Date selection, priority
and tag assignment happen in `TaskEditorSheet`, a draggable sheet rendered over
the current screen. The user never loses their scroll position or their place
in a list — the interaction stays in flow, which is the whole point of the
contextual-sheet pattern.

---

## 5. Natural-language capture engine

`src/nlp/parser.ts` — dependency-free, sub-millisecond, runs on every keystroke.

```
"Submit project report tomorrow at 5pm #Work !high ~45m"
        │                │       │     │     │      │
        │                │       │     │     │      └── estimate 45 min
        │                │       │     │     └───────── priority high
        │                │       │     └─────────────── tag "Work"
        │                │       └───────────────────── time 17:00
        │                └───────────────────────────── date  (now + 1 day)
        └────────────────────────────────────────────── title (cleaned)
```

**How it works.** Rather than a token grammar, the parser runs a set of ordered
matchers over the raw string. Each matcher is a global regex plus a handler that
returns a *value*; matches are recorded with their character spans in a
`SpanSet` that rejects overlaps, so `!high` consumes its `!` before the bare
`!` rule can fire.

```
priority → tags → projects → recurrence → estimate → times → dates
```

Then the values are reduced: the most severe priority wins, the last date and
time win, and a date+time pair is combined into `dueAt`. `mentionsClock` decides
whether a date with no time is "all day" or defaults to 9am. `remindAt` is set
30 minutes ahead of the due time (or *at* the due time if that lead would
already be in the past).

**Recognised grammar**

| Kind | Examples |
| --- | --- |
| Relative dates | `today`, `tonight`, `tomorrow`, `in 3 days`, `in 2 weeks`, `next month`, `this afternoon` |
| Weekdays | `friday`, `next monday`, `this tue` (bare weekday = the coming one) |
| Absolute dates | `12/25`, `2026-03-03`, `on March 3rd` |
| Times | `5pm`, `17:00`, `9:30am`, `at noon`, `at midnight` |
| Recurrence | `every day/week/month/year`, `every monday`, `daily`, `weekly`, `monthly` |
| Priority | `!high`, `!1`–`!4`, `p1`–`p4`, `!!!`, `!!`, `!` |
| Estimates | `~45m`, `~1.5h` |
| Tags / projects | `#Work`, `@Marketing` |
| Location | (resolved in the editor sheet rather than inline text) |

The parser returns the cleaned `title` plus a `tokens[]` array where each entry
carries `{ kind, text, start, end, label }`. The Smart Input renders that array
as inline chips — the user *sees* `Tomorrow`, `5:00 PM`, `#Work`, `High priority`
materialise as they type, which is what makes the feature feel smart rather than
magical.

**Derived-date rule.** A recurrence with no explicit date still needs an anchor,
or `every monday` would never fire: weekly recurrences resolve to the coming
weekday, daily ones to today.

**Verification.**

```bash
npm run verify:nlp     # 15 assertions, runs the real parser via node type-stripping
```

This suite caught three genuine bugs during development: an off-by-one in the
`MM/DD` capture groups (which produced `Invalid Date`), `tonight` losing its
20:00 default to the "all day" path, and `every monday` having no resolved date.

---

## 6. Notification & alert engine

`src/services/notifications/` — four focused modules.

| Module | Responsibility |
| --- | --- |
| `categories.ts` | Registers action categories; sets the foreground handler; creates Android channels |
| `scheduler.ts` | Owns the Task/Habit → OS-request mapping, urgency routing, snooze primitives |
| `actions.ts` | Turns an actionable tap into a real domain mutation |
| `geofence.ts` | Registers geofences and runs the headless task that posts the alert |

### Scheduling pipeline

```
task mutates
   │
   ▼
scheduleTaskNotifications(task)
   │  1. cancelTaskNotifications(task.id)      ← always clean slate
   │  2. ensureNotificationPermissions()
   │  3. build plans: remindAt (+30m lead) and dueAt
   │  4. buildTrigger(date, recurrence, channelId)
   │       recurrence? → DAILY | WEEKLY | MONTHLY | YEARLY (OS repeats it)
   │       else         → DATE  (skip if already in the past)
   │  5. scheduleNotificationAsync({ content, trigger })
   │  6. recordNotification(...)               ← mirror into SQLite
   ▼
OS holds the schedule. App can be killed; the reminder still fires.
```

### Actionable notifications

`CATEGORY_TASK` registers five buttons. Tapping one never opens the app:

| Action | Identifier | Effect |
| --- | --- | --- |
| Complete | `TASKFLOW_COMPLETE` | Toggles the task done and cancels its remaining alerts |
| Snooze 5m | `TASKFLOW_SNOOZE_5` | Schedules a one-off alert in 5 minutes |
| Snooze 1h | `TASKFLOW_SNOOZE_60` | …in 1 hour |
| Tomorrow | `TASKFLOW_SNOOZE_TOMORROW` | …tomorrow at 09:00 |
| Open | `TASKFLOW_OPEN` | Foregrounds the app and deep-links to `/task/:id` |

Because those handlers run headlessly, they call repositories directly and
return an outcome object. The root layout subscribes via
`subscribeToNotificationResponses` and turns the outcome into a toast plus a
refresh — the UI never has to poll.

### Urgency routing (bypassing Do Not Disturb)

`high` and `urgent` tasks are routed to a dedicated channel and interruption
level:

- **Android** — the `taskflow-urgent` channel is created with
  `importance: MAX` and **`bypassDnd: true`**.
- **iOS** — content is scheduled with `interruptionLevel: 'timeSensitive'`,
  which breaks through Focus modes. `'critical'` is available in the type system
  but requires a special Apple entitlement, so it is intentionally not used by
  default.

Four channels total (`default`, `urgent`, `focus`, `habits`) so users can tune
each tier in system settings without losing the others.

### Geofenced reminders

`expo-notifications` has no geofence primitive, so location alerts are built on
`expo-location` background geofencing:

1. `syncGeofences(tasks)` re-registers the *whole* region set (the API replaces
   rather than appends), with region identifiers of the form `taskflow:<taskId>`.
2. `TaskManager.defineTask(GEOFENCE_TASK, …)` is declared at module scope so the
   OS can invoke it after a cold start, with no React tree mounted.
3. The headless task resolves the task id from the region identifier and posts
   an immediate local notification ("You are at The Office").

---

## 7. AI features

**Subtask breakdown** (`services/ai/breakdown.ts`) is two-tiered:

- **Remote** — if `EXPO_PUBLIC_AI_ENDPOINT` is set, `POST`s the task to a
  Supabase Edge Function (or any OpenAI-compatible endpoint) and validates the
  response, requiring at least three usable steps.
- **Local fallback** — a keyword-matched template library (report, bug, launch,
  design, presentation, meeting, trip, workout, cleaning, shopping, finance,
  learning) plus a generic five-step plan. The parent's `estimate_minutes` is
  distributed across the generated steps by weight.

The fallback is not a placeholder: it is what makes "Break down with AI" work
offline and never a dead end. The result reports `source: 'remote' | 'local'` so
the UI can be honest about which engine ran.

**Voice capture** (`services/ai/transcribe.ts`) records with `expo-audio`. If a
transcription endpoint is configured the audio is posted and the transcript is
appended to the input; if not, the recording is **kept as an audio attachment**
instead of being discarded. Losing a user's spoken thought silently would be
worse than not transcribing it.

---

## 8. Offline-first sync

`services/sync/engine.ts`

```
push   pending rows (sync_state='pending') → upsert to Postgres → mark 'synced'
push   drain sync_outbox  → non-row ops (set_task_tags), retry with attempts
pull   SELECT * WHERE updated_at > sync.last_pull_at  (500/page, per table)
merge  per row: INSERT OR REPLACE, unless the local row is pending AND newer
```

Three properties make this safe:

1. **Client-generated ids** — an offline create never needs a server round-trip
   to become addressable.
2. **Soft deletes** — a tombstone (`deleted_at`) replicates; a hard delete would
   let a stale replica resurrect the row.
3. **Asymmetric last-write-wins** — pending local edits that are newer than the
   remote row always win, so a pull can never silently discard offline work.

With no Supabase credentials every entry point returns a cheap no-op summary,
and the app is entirely functional. `pendingChangeCount()` feeds the "unsynced"
badge in Settings.

---

## 9. Removing the freemium layer

The original brief specified `UserSubscriptionContext` with Free vs Pro tiers.
The product owner removed that requirement, so:

- There is **no** subscription context, entitlements table, or paywall screen.
- No feature is gated: unlimited projects and subtasks, AI breakdown, location
  alerts, actionable snooze, focus timer, habit analytics and themes are all
  available to every user.
- `app/settings.tsx` states this explicitly so the decision is visible in the
  product, not just in the code.

If a paywall is ever reintroduced, the clean insertion point is a single
`entitlements` module consulted by the store actions — not the components.

---

## 10. Design system

`src/theme/tokens.ts` (values) + `src/theme/ThemeProvider.tsx` (context).

- **Palette** — one accent (`#6C5CE7`), a small semantic priority ramp, and a
  neutral scale. Light and dark themes are declared side by side so they cannot
  drift.
- **Typography** — nine tokens (`display` → `micro`) with tuned sizes, weights
  and negative tracking for headlines.
- **Spacing / radii / motion** — a 4pt rhythm, five radii, and a shared spring
  config so every animation feels like the same product.
- **Preference** — `system | light | dark`, persisted to AsyncStorage; the
  provider resolves `system` against `useColorScheme`.

Feedback: every completion fires `Haptics.notificationAsync(Success)` plus a
particle confetti burst; destructive and selection interactions use distinct
haptic styles. Swipe right completes, swipe left deletes, both with progressive
reveal — implemented with `PanResponder` so there is no dependency on a worklet
runtime.

---

## 11. Production hardening — what to do next

| Area | Current | Recommended |
| --- | --- | --- |
| Tests | NLP parser (runnable) | Add Jest for selectors, repositories (in-memory SQLite) and the sync merge |
| Background sync | Manual + on launch | `expo-background-task` periodic sync |
| Auth | Anonymous local user | Supabase OTP sign-in already stubbed; wire `signInWithOtp` into onboarding |
| Conflict display | Last-write-wins | Surface `sync_state='conflict'` rows for manual resolution |
| Attachments | URIs stored locally | Upload to Supabase Storage and store the public URL |
| Charts | Hand-rolled bars | Reconsider a chart lib only if interactivity demands it |
| Accessibility | Icons have labels | Add a full screen-reader pass and dynamic type scaling |
