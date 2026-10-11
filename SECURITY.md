# Security policy

TaskFlow is an offline-first to-do app. It ships no telemetry, no advertising
SDK and no analytics module, and it works with no backend at all. The parts that
can touch the network are small, and they are the parts this document is about.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Use GitHub's private reporting:

1. Open <https://github.com/Parth-191006/To-do/security/advisories/new>
   (or the repository's **Security** tab → **Report a vulnerability**).
2. Describe what you found, the impact you believe it has, and the smallest
   reproduction you can manage. A rough proof of concept is more useful than a
   polished report.
3. If private reporting is unavailable in the repository settings, open an issue
   containing only the words *security* and a request for a private channel —
   no details, no exploit, no affected version.

This is a single-maintainer project: expect an acknowledgement within about a
week and a fix or an explanation of why it is not a vulnerability as soon as it
can be done properly. There is no bug bounty. Credit in the advisory (if you
want it) is the compensation on offer.

**Never** include working credentials, other people's data, or a live exploit
against someone else's deployment in any report.

## Supported versions

| Version | Supported |
| --- | --- |
| The newest tagged release (`releases/latest`) | Yes |
| `main` | Yes — fixed forward |
| Anything older | No |

The Android APK is distributed through GitHub Releases. There is no iOS build
and nothing in the Play Store or App Store.

## What is in scope

- The application code in `app/`, `src/` and the release workflows.
- The Supabase migrations in `supabase/migrations/` (RLS, triggers, quotas).
- The Edge Functions in `supabase/functions/`.
- The signing/release pipeline in `.github/workflows/`.

Out of scope: third-party providers and platforms (Expo, Supabase, OpenAI,
GitHub), a self-hosted Supabase project's own configuration, and anything that
requires a rooted device or physical access to an unlocked phone.

## Design decisions a report should assume

These are deliberate; a report that they exist is not a finding. A report that
one of them is *ineffective* is exactly what we want.

| Decision | Why |
| --- | --- |
| `EXPO_PUBLIC_*` values are public | Everything in the JS bundle is readable by anyone who unzips the APK. No secret is ever stored there — see the audit below. |
| The app works with no backend | Local SQLite is the source of truth; the cloud is a replication target. A missing or hostile endpoint degrades to the on-device planner, never to a dead end. |
| Row level security, not a private API | Every table is scoped to its owner or to list membership, so a leaked anon key is not a data leak. |
| Audio and model calls are proxied | The provider key exists only as a Supabase secret inside an Edge Function. |
| Permissions are requested on first use, after an explanation | Denial degrades the feature quietly (a delayed alert, an unarmed geofence) instead of breaking the app. |
| App lock is a privacy screen | It gates the UI with biometrics; it is not a claim that the on-device database is encrypted. |
| List invites are minted and consumed **server-side** | The invite token is the credential for joining a list, so the client never builds one and never inserts membership. `create_list_invite` / `accept_list_invite` are `SECURITY DEFINER` functions that check edit rights on the way in, and expiry, single use and (when the invite named one) the invited address on the way out. A patched APK cannot skip a check that does not run on the device. |
| A crash log is **opt-in, local, and scrubbed** | Off by default. When on, the capture path runs [`src/domain/crashLog.ts`](src/domain/crashLog.ts) over the message and stack *before* anything is stored, so what lands in `AsyncStorage` has already lost email addresses, token-like runs and 10+ digit strings. There is no uploader to add one to by accident. |

## `EXPO_PUBLIC_*` audit

Every variable the app reads at build time, and what a stranger can do with it:

| Variable | Secret? | If a stranger reads it from the APK |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | No | Knows which host the project talks to. Useless on its own. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | No (by design) | Can sign in as themselves and read *their own* rows, because every table is behind RLS. Cannot read another user's tasks. |
| `EXPO_PUBLIC_AI_ENDPOINT` | No | Can POST to the breakdown proxy. The function verifies the Supabase JWT (401 without one), resolves the user, and spends that user's per-minute quota (`consume_api_budget`). The model key is a server-side secret. |
| `EXPO_PUBLIC_TRANSCRIBE_ENDPOINT` | No | Same, with its own `transcribe` bucket, plus a 12 MB / audio-only gate before the provider is called. |
| `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AI_MODEL`, `TRANSCRIBE_MODEL`, `*_API_URL` | **Yes** | Never compiled into the app. They exist only as Supabase function secrets. |

The rule that follows from this: **no endpoint may be callable anonymously.**
Both proxies answer 401 without a valid user token, and both keep a per-user,
per-minute budget in Postgres rather than in memory, so a restart does not reset
it and one user cannot spend another's.

## Invite links, and why the token is the credential

An invite link (`taskflow://join/<token>`) crosses untrusted channels by design —
email, chat, a screenshot of a URL — so the token is treated as a bearer secret
rather than an identifier:

- **Minted server-side** (24 random bytes, lowercase hex) by a `SECURITY DEFINER`
  function that first checks the caller may edit the list.
- **Expiring and single-use.** `accept_list_invite` refuses a token that has been
  consumed, has expired, or names a different email address than the one the
  caller is signed in with, and reports *which* of those it is so the screen can
  say so honestly instead of showing "invalid link".
- **Parsed strictly on the client.** Only `/join/<16–128 hex chars>` is accepted,
  with the token as the final path segment. Anything else — including a hostile
  URL that merely contains a token-like substring — is rejected before a network
  call is made ([`src/domain/invites.ts`](src/domain/invites.ts)).
- **Not logged, not emailed back.** The token appears in the `mailto:` body the
  user sends and in the parked-invite slot on the device, nowhere else.

What an attacker who has a live link can do: join the list it names, as
somebody with the invited address. That is the point of the link. What they
*cannot* do is choose a different list, skip the expiry, reuse a consumed token,
or accept one addressed to somebody else.

## Permissions the app declares

Reviewed against `app.json`; each one has a feature behind it and a degradation
path when it is denied.

| Permission | Used for | If denied |
| --- | --- | --- |
| `POST_NOTIFICATIONS` | Reminders, focus timer, habit nudges | No alerts; everything is still visible in the app |
| `SCHEDULE_EXACT_ALARM` | Reminders at the exact minute (required by Android 12+) | Alerts may arrive a few minutes late until *Alarms & reminders* is allowed in Android settings |
| `USE_EXACT_ALARM` | Auto-granted variant of the above, so a sideloaded APK does not have to ask | Not applicable — it is granted at install. **Trade-off:** this permission is restricted by Play policy to apps whose core function is alarms or timers; it is kept because TaskFlow ships as a sideloaded APK, and it is the one that makes reminders land on time without a settings trip |
| `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` | Searching for a place and saving a reminder location | Location reminders cannot be created |
| `ACCESS_BACKGROUND_LOCATION` | A place reminder firing while the app is closed | Requested only when the first place reminder is created, behind its own explanation screen (`PermissionSheet`, kind `backgroundLocation`); "while using the app" leaves it off |
| `RECEIVE_BOOT_COMPLETED` | Re-arming scheduled alerts after a reboot | Armed reminders are lost until the app is opened |
| `RECORD_AUDIO` (via the `expo-audio` plugin) | Voice capture | Voice notes cannot be recorded |

`bypassDnd` is **not** a permission: it is a property of the Android *channel*
the alert is posted to. It is off by default and only exists after the user
turns on Settings → Notifications → *Break through Do Not Disturb*.

## Secrets this repository expects

| Secret | Used by | Notes |
| --- | --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `android-apk.yml` | Base64 of the release keystore. The workflow fails rather than generating one — a key that changes between builds cannot update an installed app |
| `ANDROID_KEYSTORE_PASSWORD` | `android-apk.yml` | Store password |
| `ANDROID_KEY_ALIAS` | `android-apk.yml` | Key alias |
| `ANDROID_KEY_PASSWORD` | `android-apk.yml` | Key password |

Signing keys are never committed and `.gitignore` covers `*.jks` and
`*.keystore`. A keystore generated by an older revision of the release workflow
was cached in Actions with a password committed in the workflow file; that
identity is retired, and the release body in `android-apk.yml` no longer claims
install-over compatibility with it. See
[docs/INSTALL.md → Create the release keystore](docs/INSTALL.md).

## Known limitations

Reporting these is welcome, but they are known:

- The Android APK is sideloaded. There is no Play Protect review and no
  automatic update channel; installing is a deliberate manual act, and the
  signature check is only as good as the trust in the repository.
- Signing keys live in GitHub Actions secrets. A compromise of the repository's
  admin account is a compromise of the release channel — that risk is accepted,
  and two-factor authentication is the mitigation.
- App lock gates the UI only; the SQLite file on the device is not encrypted
  beyond whatever full-disk encryption the OS provides.
- A crash log the user switches on is stored unencrypted, like everything else
  in `AsyncStorage`. Scrubbing removes the categories that were identified as PII
  carriers; it is a best effort over free-form text, not a guarantee that no
  string in a stack trace could ever be meaningful.
- Invite tokens are bearer credentials: whoever holds a live link can join that
  list until it is used or expires. Single use and expiry are what bound the
  window, and a list owner cannot un-see a link they already sent.
- Notifications, geofences and exact alarms cannot be verified without physical
  hardware; the audits in [`docs/AUDIT.md`](docs/AUDIT.md) say so plainly where
  a behaviour is verified by inspection only.
