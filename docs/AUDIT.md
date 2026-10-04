# TaskFlow feature audit

**Date:** 2026-10-04 · **Build audited:** v1.2.2 (`0d33abe`) → fixes landed on `main` after this audit

## How this was verified — read this first

Every row below was traced **end to end in the shipping code path**: UI entry point →
store action → repository → SQLite → side effect (notification / OS call / derived number),
plus the reverse path (data → selectors → what the screen renders). Where the logic is pure
it is also executed by the assertion suites in `npm run verify`.

**Limitation, stated plainly:** this environment has no Android device or emulator attached,
so "Works?" means *the code path is complete, reachable and correct by inspection and by the
executable proof noted in each row* — not *observed on hardware*. The APK that carries these
changes is built and signed by `.github/workflows/android-apk.yml`; the on-device pass
(sound, lock-screen behaviour, OEM notification quirks) still has to be run on a phone.
Anything that cannot work without a device is called out in `Known gaps`.

Legend — **Works?**
`yes` = complete and reachable · `fixed` = was broken, fixed in this pass ·
`added` = did not exist, built in this pass · `partial` = works with a documented limit.

## Feature table

| Feature | Works? | What was broken | Fix |
| --- | --- | --- | --- |
| Quick Add — NL parsing (date, time, `#tag`, `!priority`, `~estimate`, recurrence) | yes | Nothing. `parseTaskInput` handles all six fragment types, returns the cleaned title and character spans; `addTaskFromInput` writes them through to SQLite. Proof: `verify-nlp` (15 assertions). | — |
| Quick Add — inline chips while typing | yes | Chips rendered *below* the input, under the keyboard-adjacent controls, so the feedback was easy to miss. | Moved the `DETECTED` chip row above the field; chips are now between the eye and the keyboard. |
| Voice note recording | yes | Permission was requested cold by the OS dialog, with no in-app explanation, and a denial was permanent. | Added the explain-then-ask `PermissionSheet`; the mic only reaches the OS prompt after an explicit "Allow". |
| Voice note playback | yes | Nothing. `AudioAttachment` in `app/task/[id].tsx` plays, pauses and rewinds at end of clip. | — |
| Optional transcription fallback | yes | Nothing. `isTranscriptionAvailable()` gates it; without an endpoint the audio is kept as an attachment, so the thought is never lost. | — |
| Photo attachments | yes | Only the library could be used — no camera, despite "photo" implying one. | Added an inline camera capture button (`launchCameraAsync`) next to the library picker. |
| "Break down with AI" creates 3–5 subtasks | yes | Remote path had **no timeout**, so on a dead network the button spun until the OS network timeout instead of degrading. | Added a 3.5 s abort budget; the local planner answers instantly when the network does not. |
| On-device planner works offline | yes | Local planner existed and is pure — but it copied the *parent's* priority onto every step. | Each step now gets its own priority (`deriveStepPriorities`) and the parent's estimate is split across the steps. |
| Lists / projects | yes | Nothing. Create, rename, recolour, open, delete (two-tap confirm) all persist and re-render. | — |
| Tags | yes | Nothing. `#tag` in capture creates on first use; `findOrCreateTag` + `task_tags` join. | — |
| Inbox | yes | Nothing structurally — but see search below. | — |
| Subtasks (nesting) | yes | Nothing. `parent_id` tree, cascade complete, cascade soft-delete. | — |
| Search (FTS5) | fixed | **The `tasks_fts` index was maintained by triggers and never queried.** `searchTasks` ran `LIKE '%…%'`; the Inbox filtered an in-memory array. The README's FTS5 claim was not true in code. | `searchTasks` now queries the FTS5 index (`MATCH`, prefix tokens, `ORDER BY rank`) with a LIKE fallback for short/infix queries (`src/db/fts.ts`). The Inbox calls it, debounced, and keeps the other filters in memory. |
| Tag filters | yes | Nothing. Inbox tag filter builds on the same `TaskWithTags.tagIds` join. | — |
| View: List | yes | Nothing. Sections Overdue → Today → Upcoming → Anytime → Completed; edits persist. | — |
| View: Board / Kanban | yes | Nothing — but the board has **no drag-and-drop**: moving is a tap on the advance control, which is why the README says "four views", not "drag and drop". Recorded as a limitation rather than silently claimed. | README wording kept honest (Phase 5). |
| View: Agenda | yes | Nothing. Groups by day from the same `dueAt`. | — |
| View: Matrix | yes | Nothing. Quadrants derive from priority + overdue/due-today. | — |
| Cross-view consistency | yes | Nothing. All four views read the same store slice, so a change in one appears in the others. | — |
| Today sections (Overdue / Today / Upcoming / Anytime / Completed) | yes | Nothing. | — |
| Header counters (Due today, Overdue, Focus, Done) live | yes | Nothing. `summarizeDay` is recomputed from the store on every mutation; focus minutes come from today's sessions. | — |
| Notifications — time reminders | yes | Nothing. `scheduleTaskNotifications` schedules `remindAt` and `dueAt`, mirrors them into `notification_records`. | — |
| Notifications — recurrence | yes | Nothing. Daily/weekly/monthly/yearly triggers built from the recurrence. | — |
| Notifications — action buttons | partial | Complete / Snooze 5m / 1h / Tomorrow / Open all resolve through `handleNotificationResponse`. "Start focus" existed on the focus category but only opened the screen — it did not actually start a block on that task. | Quick action now carries the task and starts the block (Phase 3). |
| Notifications — four channels | yes | Nothing. `taskflow-default`, `taskflow-urgent` (DND bypass), `taskflow-focus`, `taskflow-habits` registered and re-asserted before every schedule. | — |
| Notifications — lazy permission + graceful denial | fixed | Permission was requested the first time a reminder was saved, but with **no in-app explanation**, and the primer-less prompt burned the one system dialog. | Explain-then-ask sheet before the OS prompt; denial leaves the feature off and everything else working. Settings deep-links to the OS screen when the OS will no longer ask. |
| Geofenced reminders — register | yes | Nothing. Region ids embed the task id; the headless TaskManager task posts the banner. | — |
| Geofenced reminders — re-arm on change | yes | Nothing. Signature-gated engine re-arms on every mutation. Proof: `verify-geofence` (15 assertions). | — |
| Geofenced reminders — drop on completion | yes | Nothing — and the archived case is pinned by a regression assertion. | — |
| Focus timer — start / pause / resume / skip | yes | Nothing. Pure state machine; pause keeps remaining time. Proof: `verify-clock` (13 assertions). | — |
| Focus timer — background accuracy | yes | Nothing. Deadline-based, re-derived from the wall clock on foreground. | — |
| Focus timer — end-of-block notification | yes | Nothing. Scheduled on start, cancelled on pause/skip. | — |
| Focus timer — attribution to task/project | yes | Nothing. `beginFocus(taskId, projectId)` writes one session row per block. | — |
| Habits — add | yes | Nothing. | — |
| Habits — check in / undo | yes | Nothing. True toggle via `habitToggleDelta`. Proof: `verify-habits` (13 assertions). | — |
| Habits — streaks / longest | yes | Nothing. `computeStreak` / `longestStreak`, pure and tested. | — |
| Habits — 5-week heatmap | yes | Nothing. 35 cells, intensity-shaded. | — |
| Habits — delete | yes | Nothing. Two-tap archive. | — |
| Habits — reminder time | fixed | `scheduleHabitReminder` / `cancelHabitReminders` were **dead code**: nothing in the UI could set a habit reminder, so it never ran. | Schema v2 adds `reminder_hour` / `reminder_minute`; habits get an options row with 7am / 12pm / 6pm / 9pm / off, and every habit write re-arms (or cancels) the OS nudge. |
| Habits — weekly target days | fixed | `by_weekday` existed in the schema and was never editable in the UI. | Target-day chips (Every day, S M T W T F S) on each habit card. |
| Insights — completion % | fixed | The tile divided **all-time** done by **all-time** total while sitting under a 7/14/30-day switch — the number never matched the selected range. | Completion is now scoped to the window (tasks that came due inside it, and how many of those are done), with the caption saying so, falling back to all-time only when nothing fell due. |
| Insights — focus time per day | yes | Nothing. Bars come from real `focus_sessions`. | — |
| Insights — most productive hours | fixed | Bucketed completions from all time, ignoring the range switch. | Same window as the chart; empty state no longer claims a peak it cannot see. |
| Insights — focus by project | yes | Nothing. Sums sessions per project, resolved to names. | — |
| Insights — 7/14/30-day filters | fixed | The switch only reached the focus chart. | Range now drives completion, the daily chart and peak hours. |
| Insights — numbers match real data | yes | Nothing beyond the two scoping bugs above. | — |
| Settings — theme (light / dark / system) | yes | Nothing. Persisted in AsyncStorage. | — |
| Settings — notifications | yes | Nothing. Status, armed count, enable, test banner, re-arm all. | — |
| Settings — sync | yes | Nothing. Sign-in link, sign-out, sync now, pending count, unconfigured state explains itself. | — |
| Settings — data export | added | **Did not exist.** The audit list requires it; the shipped Settings only had "Reset local data". | JSON + CSV export with the OS share sheet, and an automatic local backup (Phase 3). |
| Settings — data clear | yes | Nothing. Also cancels every scheduled notification. | — |
| Sync — push / pull | yes | Nothing structurally: outbox push, delta pull by `updated_at`, last-write-wins. | — |
| Sync — realtime | yes | Nothing. `subscribeToProjectChanges` streams task changes for an open list. | — |
| Sync — invite by email | yes | Nothing. Opens a real `mailto:` draft, falls back to the share sheet. | — |
| Sync — activity log | yes | Nothing. Written on create / breakdown / project create, read on the list screen. | — |
| Sync — conflict handling | partial | Last-write-wins was **whole-row**: one collaborator's edit to the title could erase another's edit to the notes. | Per-field timestamp merge with a documented merge rule (Phase 3, `ARCHITECTURE.md`) — with a real `field_updated_at` column so the merge has data to work with. |
| Dead-end buttons | fixed | Two: the habit-reminder code path had no UI, and "Start focus" from a notification opened the screen without starting anything. Also `reorderTasks` was unreachable dead code. | Both wired; `reorderTasks` deleted. Every remaining control was traced to an effect. |

## Known gaps (not fixable in this environment)

- **On-device behaviour** — sound, vibration, lock-screen actions, Do-Not-Disturb bypass,
  geofence wake-ups and background timer accuracy are all OS behaviours that can only be
  confirmed on real hardware. The code paths are complete and the APK pipeline builds them.
- **`expo lint`** — this project has no ESLint config; `expo lint` scaffolds one on demand and
  is therefore not part of CI. `tsc --noEmit` plus the assertion suites are the gate.
- **iOS** — no sideloadable IPA; TestFlight via EAS remains the only public path.
- **Stale v1.1.0 release assets** — the old universal + split APKs are still attached to that
  release and cannot be deleted without a token-bearing client.
