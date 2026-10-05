# Changelog

All notable changes to TaskFlow. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

Release APKs are published for every `v*` tag:
<https://github.com/Parth-191006/To-do/releases/latest>

## [1.2.3] — 2026-10-05

A release driven by an end-to-end audit: every feature the README claimed was
traced through the code and the broken ones were fixed, removed or rewritten.

### Added

- **Daily / weekly review** — a morning "plan your day" prompt and an evening
  wrap-up showing completed vs. missed work, each dismissible per half-day.
- **Task templates** — save any task as a template, one-tap repeat of the last
  task, long-press to forget it.
- **Export / import** — full JSON and CSV export, import from pasted JSON,
  an automatic local backup (written before every destructive action) and
  restore.
- **App lock** — optional biometric lock, engaged 30 s after the app goes to
  the background, with a graceful path on devices with no screen lock.
- **Notification quick action** — start a focus block on a task straight from
  the notification.
- **Focus screen** — large circular countdown ring, the wheel picker moved
  behind a **Custom** chip, a searchable "Working on" bottom sheet, short/long
  break cycles with a round counter, and a daily-goal progress bar.
- **Habits** — one-tap starter suggestions, optional reminder time, weekly
  target days, streak flame and today's check on each card.
- **Inbox** — bulk select with move / tag / complete / delete, and a
  **Go to Today** shortcut that only appears when the list is truly empty.
- **Insights** — weekly summary card, optional weekly goal, and empty states
  with a faded sample chart labelled *Example*.
- **Skeleton loaders** and a shared `TabHeader` so all five tabs have the same
  title size and padding.
- **Permission primer** — background location, exact alarms and the
  Do-Not-Disturb bypass are only requested after a short explanation sheet,
  the first time a feature needs them.
- **Privacy note** in Settings and the README: what stays on the device, what
  is synced.

### Changed

- **Search now really uses FTS5.** The `tasks_fts` index was maintained by
  triggers but never queried — search ran a `LIKE '%…%'` scan. It now uses
  `MATCH` with prefix tokens ordered by `rank`, with the LIKE path kept for
  one- and two-character queries. Operator words (`AND`/`OR`/`NOT`/`NEAR`) are
  quoted so they are searched for rather than obeyed, which previously made
  those queries fail silently.
- **Sync conflicts merge per field.** Whole-row last-write-wins has been
  replaced by per-field timestamps in `tasks.field_meta`, so two people editing
  different fields of the same task both keep their change.
- The focus timer's length picker became a countdown ring; the wheels only
  appear behind **Custom**.
- Today header slimmed to a single row (title + date, then chips + a compact
  icon view switcher) so the first task is visible without scrolling.
- Quick Add parsed chips moved above the input; the send button turns teal as
  soon as there is text; mic and camera actions are inline.
- Contrast raised to WCAG AA in both themes (light `textSecondary` /
  `textTertiary` were below 4.5:1) and small all-caps labels were enlarged.
- The verification suites moved from `scripts/verify-*.ts` to **Vitest**
  (`tests/`, 115 assertions) with `npm run test` / `npm run verify`.

### Fixed

- Habit reminder columns existed in the UI but not in the schema, so the
  scheduler functions were dead code — reminders are now wired end to end
  (schema v2).
- AI breakdown could hang for the OS-level network timeout on a dead network;
  it now has a 3.5 s budget and always falls back to the on-device planner.
- Fresh-install database open, swipe actions losing their undo, and a
  collection of smaller issues listed in [`docs/AUDIT.md`](docs/AUDIT.md).
- The parser ignored **yesterday**, so `Email the invoice yesterday 5pm` kept
  the word and a bare `5pm` rescheduled the task to later today.
- The Insights focus tile read **0h** for every real session: `Math.round` on
  the hour count. Rounding now lives in a tested `src/domain/format.ts`
  (`45s` → `25m` → `3.5h`, with `59m 40s` promoted to `1.0h`).

### Infrastructure

- `ci.yml` runs typecheck + tests + brand-asset checks on every push and PR;
  `android-apk.yml` keeps building and signing the release APK on `v*` tags.
- Sample authenticated, rate-limited AI proxy in `supabase/functions/`
  (`ai-breakdown`) plus migrations for `field_meta` and the rate limiter.
- No paid or secret AI key ships in any `EXPO_PUBLIC_*` variable.
- New mascot brand mark: one generator (`scripts/generate-logo.py`) now renders
  the icon, adaptive foreground/background/monochrome layers, splash, favicon
  and README banner, checked by `scripts/verify-brand.py`.
- README rewritten around the audit, with eleven real 412×915 screenshots in
  [`docs/screenshots/`](docs/screenshots), a six-frame tour GIF and the
  install/release/FAQ/shortcoming sections written out.

## [1.2.2] — 2026-10-03

### Added

- Set the focus length with an H/M/S wheel picker drawn **inside** the timer
  ring, plus an auto-start-breaks toggle in Settings.

## [1.2.1] — 2026-10-03

### Added

- Manual duration slider on the focus timer.

## [1.2.0] — 2026-10-03

The teal rebrand.

### Added

- Voice notes with optional transcription, photo attachments and the camera
  action in Quick Add.
- Inline parsed-chip highlighting while typing natural-language input.
- Swipe gestures on tasks (right = complete, left = delete) with an undo
  banner, and a confetti celebration when the last task of the day is done.

### Changed

- New teal-accented light/dark design with a shared token palette.
- Quick Add rebuilt around a single input that parses date, time, `#tag`,
  `!priority`, `~estimate` and recurrence.

## [1.1.1] — 2026-10-02

### Fixed

- The app failed to open its database on a fresh install and errored at launch.

### Changed

- One `arm64-v8a` release APK (~50 MB) instead of four architecture variants.

## [1.1.0] — 2026-10-01

### Added

- A permanently named download (`TaskFlow-latest.apk`) so the release link
  survives version bumps.

### Changed

- Release builds are signed from a persisted CI keystore, so every build shares
  one identity and updates install over older installs.

## [0.1.1] / [0.1.0]

Initial private builds of the offline-first task manager: SQLite core,
natural-language capture, the four views, notifications and the focus timer.

[1.2.3]: https://github.com/Parth-191006/To-do/releases/tag/v1.2.3
[1.2.2]: https://github.com/Parth-191006/To-do/releases/tag/v1.2.2
[1.2.1]: https://github.com/Parth-191006/To-do/releases/tag/v1.2.1
[1.2.0]: https://github.com/Parth-191006/To-do/releases/tag/v1.2.0
[1.1.1]: https://github.com/Parth-191006/To-do/releases/tag/v1.1.1
[1.1.0]: https://github.com/Parth-191006/To-do/releases/tag/v1.1.0
[0.1.1]: https://github.com/Parth-191006/To-do/releases/tag/v0.1.1
[0.1.0]: https://github.com/Parth-191006/To-do/releases/tag/v0.1.0
