# Developing TaskFlow

Everything in this file used to live in the README. It is here because you only
need it if you are working on the app — not if you just want to use it.

Set-up, architecture and the data schema live in
[ARCHITECTURE.md](../ARCHITECTURE.md); the feature-by-feature audit that drove
release 1.2.3 is in [AUDIT.md](AUDIT.md).

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Start the Expo dev server |
| `npm run ios` / `npm run android` / `npm run web` | Start on a specific platform |
| `npm run typecheck` | `tsc --noEmit` over the app **and** the tests |
| `npm run test` | Run every Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run verify` | `typecheck` + `test` — run this before tagging a build |
| `npm run verify:brand` | 13 assertions on the generated logo assets (needs Python + Pillow) |
| `python3 scripts/generate-logo.py` | Regenerate icon, adaptive layers, splash, favicon and banner |

## Verification

```bash
npm run verify                      # tsc --noEmit + every Vitest suite
npm run verify:brand                # 13 checks that the brand assets are correct
npx expo-doctor                     # dependency & config checks
npx expo export --platform android  # bundling smoke test
```

The suites import the shipping modules through the same `@/…` alias the app
uses, so a regression fails here before it reaches a phone:

- **NLP** — date/time/tag/priority/estimate/recurrence extraction, relative and
  absolute dates, token spans, the 30-minute reminder lead, empty and
  punctuation-only input.
- **Focus clock** — pause keeps remaining time, backgrounding re-derives from
  the wall clock, skip banks the partial block.
- **Habits** — streak runs, missed days, and the check-in/undo regression.
- **Formatting** — the hour/minute/second thresholds behind the insight tiles.
- **Schema** — connection pragmas stay outside the migration transaction (the
  bug that once broke every fresh install), migration list integrity, every
  table, idempotent inbox seed, FTS index sync, and the v2/v3 columns.
- **Geofence** — the re-arm signature gate: unchanged fence sets never touch the
  OS, denied permissions stay retryable, and completing a fenced task drops its
  region.
- **Sync engine & merge** — the per-field conflict rule, the offline queue
  replaying in order, delete-versus-edit, including the two-people,
  different-fields case the old whole-row merge lost.
- **Export** — JSON and CSV round-trips, schema-version validation, and that a
  re-import creates nothing twice.
- **FTS** — every query the builder produces is run against a **real FTS5
  index**, because a syntax error only exists at `MATCH` time.
- **Accessibility & screen reader** — every interactive control has a label, and
  the spoken strings the app builds (task summaries, toggle verbs, tab-bar
  height under font scaling) are pinned.
- **i18n** — the string table's plural pairs are complete, and every `t()` call
  in the tabs and settings resolves to a real key.
- **Notification channels** — the Do Not Disturb mapping, which cannot be
  changed after a channel is created.
- **Invites** — token parsing strictness (only `/join/<hex>`, final path
  segment), the round-trip helpers, and both states of the invite email: one with
  a link and one that admits there is none.
- **Crash log** — the scrubbing rules themselves (emails, token-like runs, long
  digit strings), fingerprint dedupe, the queue cap, and that a thrown non-Error
  produces a report instead of a second failure.
- **Cross-view parity** — each task view receives a required completion callback
  and labels it for a screen reader, so the agenda and the matrix cannot quietly
  go back to being read-only.
- **Tour & task status** — the first-run copy and the status transitions.

CI ([`ci.yml`](../.github/workflows/ci.yml)) runs typecheck, tests and the brand
check on every push and pull request. The APK pipeline
([`android-apk.yml`](../.github/workflows/android-apk.yml)) runs on `v*` tags.

### End-to-end flows (Maestro)

`.maestro/` holds five [Maestro](https://maestro.dev) flows that drive the real
app on a device or emulator:

| Flow | What it proves |
| --- | --- |
| `01-capture-a-task` | Typing `Email the invoice tomorrow 5pm #Work !high` shows a date, time, tag and priority chip as you type, and stores the title with those fragments removed |
| `02-complete-a-task` | The checkbox completes the task, and the card moves to **Completed** with its label inverted |
| `03-start-a-pomodoro` | Start → pause → start on the Focus control round-trips |
| `04-check-in-a-habit` | Adding a starter habit and checking it in flips the check-in to **Undo today** |
| `05-export-data` | Settings → Your data offers both export formats and a backup really is written to disk |

Each flow starts from `launchApp: { clearState: true }`, so it runs against an
empty database and dismisses the first-install tour itself. They target
`testID`s and accessibility labels rather than screen positions, and every
`testID` they use is verified to exist by `tests/maestro-flows.test.ts`.

```bash
maestro test .maestro                            # all five
maestro test .maestro/01-capture-a-task.yaml     # just one
maestro test --include-tags smoke .maestro       # the tagged subset
```

Build a debug APK and install it first (`npx expo run:android`), then start an
emulator or plug in a device. **These are not part of the required CI**, because
Maestro needs a device and an installed build: the workflow would spend minutes
on emulator provisioning for a suite that the static checks above already guard
against selector drift. Run them locally before a release tag.

## Platform notes

- **Android** creates four notification channels (`default`, `high`, `focus`,
  `habits`). A fifth, allowed to break through Do Not Disturb, appears only if
  you switch it on in Settings → Notifications. Exact-alarm and
  background-location permissions are declared in [`app.json`](../app.json) and
  requested at runtime only when the matching feature is first used — the
  background-location dialog is preceded by its own explanation screen.
- **iOS** uses `interruptionLevel: 'timeSensitive'` for urgent tasks;
  `'critical'` alerts require a special Apple entitlement and are not used.
- Haptics and location features are silently skipped on platforms or devices
  that do not support them — they are flourishes, never blockers.

## Roadmap

- [x] Teal rebrand with a generated mascot mark and one-source brand assets
- [x] Audit every advertised feature and fix what was broken
- [x] Countdown ring with the wheel picker behind a **Custom** chip
- [x] Habit reminders, starter chips and weekly target days
- [x] Daily and evening reviews, templates, repeat-last-task
- [x] JSON/CSV export, import and automatic local backup
- [x] Biometric app lock
- [x] Notification quick action to start a focus block
- [x] Per-field sync merge instead of whole-row last-write-wins
- [x] Vitest suites and a CI workflow on every push
- [ ] Android home-screen widget (today's tasks + quick add)
- [ ] Optional Google Drive backup target
- [ ] Background periodic sync (`expo-background-task`)
- [ ] Manual resolution UI for the rare remaining sync conflict
- [ ] Attachment upload to Supabase Storage
- [ ] iOS distribution (TestFlight via `eas build`)

## Known limitations

- **Place reminders are a preview.** They sit behind Settings → Experimental,
  off by default: a pin can only be dropped where you are standing, with a fixed
  150 m radius, and always fires on arrival. Searching for an address and "when I
  leave" are not built.
- **Sync conflicts are merged, not negotiated.** Each field keeps the newer
  write; a field nobody stamped falls back to the row's `updated_at`. Rows last
  written before schema v3 therefore behave like whole-row last-write-wins until
  they are edited again, and there is no UI for reviewing an unusual merge.
- **iOS cannot be sideloaded the way Android can.** Apple requires a signed IPA
  through TestFlight or a registered device. Run from source with
  `npx expo run:ios`, preview in Expo Go, or use
  [`eas build`](https://docs.expo.dev/build/introduction/) with the included
  [`eas.json`](../eas.json).
- **Some behaviour can only be proven on hardware** — notification sound and
  DND bypass, geofence wake-ups after a cold start, background timer accuracy
  and biometric prompts. Those are verified by inspection, and each is listed as
  such in [AUDIT.md](AUDIT.md).
- **`npm run lint` is not wired up.** The repo has no ESLint config, so
  typechecking plus the test suite are the static checks.
- **No widget or cloud drive backup yet** — both are on the roadmap above.

## FAQ

**Does it work offline?**
Completely. Local SQLite is the source of truth; sync, AI and transcription are
optional layers on top.

**Does "Break down with AI" need the internet?**
No. The on-device planner is rule-based — a keyword-matched library of templates
that ships in the app — and it is both the default and the fallback. If you
configure an endpoint, the remote model is tried first with a 3.5 s budget and
any failure falls back locally.

**Where is my data?**
On your device, in one SQLite file. It is only sent to a backend if you
configure Supabase yourself and sign in. There is no telemetry.

**How do I back up?**
Settings → Data exports JSON or CSV, writes an automatic local backup before
anything destructive, and can restore from either.

**Why can't Google Play see this app?**
It is distributed as a signed APK from GitHub Releases — sideload it as
described in [RELEASING.md](RELEASING.md).

**Notifications or geofences aren't firing.**
Check that permission was granted (Settings → Apps → TaskFlow) and that battery
optimisation is not restricting the app. Every permission is requested with an
explanation the first time a feature needs it.

**Can I contribute?**
Yes — see [CONTRIBUTING.md](../CONTRIBUTING.md).

## Conventions

Keep changes token-driven (no hardcoded colours outside `src/theme/tokens.ts`
and the documented notification accents), and add a test for any pure logic you
touch.

```bash
npm run verify        # typecheck + every suite
```
