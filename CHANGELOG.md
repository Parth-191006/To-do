# Changelog

All notable changes to TaskFlow. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

Release APKs are published for every `v*` tag:
<https://github.com/Parth-191006/To-do/releases/latest>

## [Unreleased]

## [1.3.0] — 2026-10-12

A quieter interface, and the release guard that checks what users actually
download. No schema change and no new permission: this updates over 1.2.4 in
place, with local data intact.

### Changed

- **A quieter interface.** The screens that were doing the most talking now say
  it in fewer words. Today opens with one progress ring and a single sentence
  instead of a four-column stat grid, a progress bar and four uppercase labels;
  the greeting *is* the header rather than a header plus a repeated greeting,
  and the review card stays hidden on a day with nothing in it. Task metadata is
  a middot-separated line ("Tomorrow 5:00 PM · #Work · High") rather than one
  outlined chip per attribute, chips are flat tints instead of pills with a
  border, and a panel now carries either a hairline or a shadow — never both,
  via a two-step `elevation` scale in the tokens. The capture field lost its
  `QUICK ADD` header and `DETECTED` label (the chips appear only once something
  is parsed), keeps its syntax hint only while the field is empty, and the
  gesture explainer under the list is gone. Tab subtitles are one line each.
- **A three-step first-run tour** — the old version was four steps of paragraph
  copy; it now says capture, four views and offline-only in one sentence each,
  with the primary action as a centred pill and *Skip the tour* as a quiet text
  button.

### Added

- **A release guard** — [`verify-release.yml`](.github/workflows/verify-release.yml)
  downloads the APK the permanent link actually serves and fails unless its
  versionName, versionCode and package match `app.json` at its own release tag,
  its signing certificate is the key in `ANDROID_KEYSTORE_BASE64`, and
  `releases/latest` is the tag that just finished. It runs after every Android
  APK run, on demand and weekly, so damage from a deleted release, a truncated
  upload or a rotated key is caught later too. Both release assets must also be
  the same bytes as the download.
- **`elevation` in the theme** — two shadow steps (`card`, `floating`) replace
  the radius-and-opacity values each component used to invent, and
  `ProgressBar`, `SectionLabel` and `Button` join the primitives in `ui.tsx` so
  a screen never grows a fourth chip or button style.

## [1.2.4] — 2026-10-11

Release hardening: CI and signing, a security pass over every public variable,
per-field sync, end-to-end tests and a documentation split — then list invites,
an opt-in crash log, quick add by link and a parity pass over the four views. The
local database gains no columns, so the app still updates over 1.2.3 without a
local migration; the server side needs migration 0006.

### Added

- **Invite people to a list by link.** *Share & invite* on a list mints a
  single-use, expiring token (server-side, via migration 0006) and puts it in
  both the email draft and a `taskflow://join/<token>` link. Opening the link
  joins the list; opening it before signing in parks the invite and replays it
  after sign-in; a dead token says whether it expired, was already used, or was
  addressed to someone else. Without a backend the screen says sharing is not
  configured instead of pretending.
- **Quick add by link** — `taskflow://add?text=Submit%20report%20tomorrow%205pm`
  parses the text, shows the title and its chips, and writes only after you tap
  **Add task**. Any app that can open a URL can use it (bookmarklet, shortcut,
  automation, bot).
- **Opt-in crash log** — Settings → Diagnostics, **off by default**. Uncaught errors
  are stored on this device after email addresses, token-like runs and long digit
  strings are scrubbed out of the message and stack. Nothing is uploaded; the log
  is viewable and shareable, and clearing it is a separate, explicit action.
- **Complete a task from the Agenda or the Matrix** — the list's own checkbox,
  with the same "Mark … complete" label, so all four views finish tasks in place.
- A **camera primer** before the OS camera prompt, matching the mic and location
  ones, so a denial is a choice rather than a surprise.
- **End-to-end flows** — five Maestro flows under [`.maestro/`](.maestro) cover
  capture, completion, a Pomodoro, a habit check-in and export. A static suite
  checks that each flow still parses and only targets `testID`s the app defines.
  They are deliberately not in required CI, which cannot host a device.
- **Experimental switch** in Settings, off by default, currently holding place
  reminders — the one feature that is working but not whole.
- **Documentation split**: the README is now pitch, screenshots, install,
  features, quick start, privacy and links; the detail moved to
  [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md),
  [docs/RELEASING.md](docs/RELEASING.md) and
  [docs/CONFIGURATION.md](docs/CONFIGURATION.md). Added
  [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

### Changed

- **Release APKs are signed from repository secrets.** The workflow restores the
  keystore from `ANDROID_KEYSTORE_BASE64` and friends, and fails with
  instructions if any are missing. It never mints a key: a CI-generated identity
  cannot install over an existing app.
- **AI and transcription endpoints require a signed-in user.** The client sends
  its Supabase access token; the sample edge functions answer `401` without one
  and spend a per-user, per-minute budget before calling a provider with a
  server-side key.
- **Sync merges per field, not per row.** Two people editing different fields of
  the same task now both keep their change, and a genuine same-field conflict is
  recorded in the activity log.
- **Do Not Disturb bypass is opt-in**, off by default, with the trade-off stated
  in the UI.
- **Place alerts use the same channels as timed reminders.** A location banner
  used to be posted with no Android channel at all, which put it on Android's own
  "Miscellaneous" channel — outside the four Settings describes and impossible to
  tune or silence. It now carries a `taskflow.place` category (**Complete** /
  **Snooze 1h** / **Open**) and routes by task priority, Do-Not-Disturb rules
  included.
- **Release build size**: R8 minification and resource shrinking are now enabled
  via `expo-build-properties`.
- **All user-facing copy in the tabs and Settings** goes through an English
  string table, and every control carries an accessibility label that follows
  the OS text size.

### Removed

- `expo-blur`, `expo-device` and `expo-secure-store` — nothing imported any of
  them. They contributed native code to the APK while the JS bundle stayed
  byte-identical.

### Documentation

- The README now states its **known limitations** up front: no share-sheet
  entry, no drag-and-drop on the board, hardware-only behaviours verified by
  inspection, Android only, and app lock being a privacy screen rather than
  encryption.

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

[1.2.4]: https://github.com/Parth-191006/To-do/releases/tag/v1.2.4
[1.2.3]: https://github.com/Parth-191006/To-do/releases/tag/v1.2.3
[1.2.2]: https://github.com/Parth-191006/To-do/releases/tag/v1.2.2
[1.2.1]: https://github.com/Parth-191006/To-do/releases/tag/v1.2.1
[1.2.0]: https://github.com/Parth-191006/To-do/releases/tag/v1.2.0
[1.1.1]: https://github.com/Parth-191006/To-do/releases/tag/v1.1.1
[1.1.0]: https://github.com/Parth-191006/To-do/releases/tag/v1.1.0
[0.1.1]: https://github.com/Parth-191006/To-do/releases/tag/v0.1.1
[0.1.0]: https://github.com/Parth-191006/To-do/releases/tag/v0.1.0
