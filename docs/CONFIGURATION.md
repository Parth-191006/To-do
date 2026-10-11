# Configuration

TaskFlow is fully functional with **zero configuration**. SQLite on the device
is the source of truth and every cloud feature degrades to a no-op, so this page
is only about the optional layers.

## Environment variables

| Variable | Enables |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Cloud sync, auth, real-time shared lists |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | (pairs with the URL above) |
| `EXPO_PUBLIC_AI_ENDPOINT` | Remote AI subtask breakdown (falls back to the on-device planner) |
| `EXPO_PUBLIC_TRANSCRIBE_ENDPOINT` | Voice-to-text (falls back to keeping the audio note attached) |

Create a `.env` (or `app.json` → `expo.extra`) with any of the above.

The anon key is public by design and protected by row-level security. **Never
put a model API key in an `EXPO_PUBLIC_*` variable** — those values are compiled
into the bundle and readable by anyone who unpacks the APK. Keep model keys in
the edge function.

Both AI endpoints require a signed-in user: the app sends its Supabase access
token with every request, and the sample functions in
[`supabase/functions/`](../supabase/functions/) answer `401` without one, spend a
per-user, per-minute budget in Postgres, and only then call the provider with a
server-side key. A configured endpoint URL is therefore not an open door. Every
variable the app reads, and what a stranger can do with it, is listed in
[SECURITY.md](../SECURITY.md).

## Backend

Run the migrations in [`supabase/migrations/`](../supabase/migrations/) in order.
They create every table, the row-level security policies, the per-field merge
column, the AI rate limiter and (0006) the list-invite functions and table.
Then deploy the functions in [`supabase/functions/`](../supabase/functions/) —
see that folder's README.

### List invites

With a backend configured, **Share & invite** on a list hands you two things: a
`mailto:` draft in your own mail app, and the invite link
(`taskflow://join/<token>`). Both come from one token, which matters for a
single-use credential — see [SECURITY.md](../SECURITY.md).

The invitee opens the link with TaskFlow installed. Three outcomes, all stated
explicitly on screen rather than as a generic failure: it joins them to the list;
it parks the invite and asks them to sign in when they have no session yet (the
root layout replays it the moment they do); or it says why the token is dead
(expired, already used, invited a different address). Without a backend the
screen says lists cannot be shared yet instead of pretending.

## The AI planner, plainly

| | |
| --- | --- |
| **Default** | Everything runs on device. The subtask planner is rule-based — a keyword-matched library of templates that ships with the app — so **the feature works in airplane mode**. |
| **With `EXPO_PUBLIC_AI_ENDPOINT`** | The title, notes, estimate and priority of that one task are POSTed to the endpoint you configure, with a 3.5 s budget. Any failure — offline, 401, 429, timeout — falls straight back to the on-device planner. This layer is **optional**; nothing else in the app requires it. |
| **Keys** | No paid or secret key ships in `EXPO_PUBLIC_*`. The sample proxy in [`supabase/functions/ai-breakdown/`](../supabase/functions/) holds the key behind Supabase `verify_jwt`, per-user resolution and a per-minute rate limit. |

## What is stored where

**On the device, always:** tasks, notes, subtasks, lists, tags, habits and
their logs, focus sessions, voice notes, photo attachments, preferences. One
SQLite file. **No telemetry, no analytics SDK, and nothing uploaded.**

**On the device, only if you opt in:** a crash log (Settings → Diagnostics, off by
default). Uncaught errors are kept locally with emails, token-like runs and long
digit strings scrubbed out of the text before it is written. There is no upload
path — the log is yours to read and share. A parked invite token, waiting for
you to sign in, also lives on the device until it is used or discarded.

**Synced, only if you configure Supabase and sign in:** task, project, tag,
habit and focus-session rows, plus the collaboration activity log. Attachment
*bytes* never leave the device — only their local URIs replicate.

**Sent to AI, only if you configure an endpoint:** the single task you asked to
break down. Nothing else, and nothing at all by default.

**Leaves when you choose:** JSON/CSV export through the system share sheet, and
the automatic local backup. Settings → Data states this in the product itself.

## Permissions

Every permission is requested **on first use, after a short explanation**, and a
denial degrades the feature quietly instead of breaking the app:

| Permission | Asked when | If denied |
| --- | --- | --- |
| Notifications | the first reminder is armed | reminders stay silent; everything else works |
| Location (foreground) | the first place reminder | place reminders stay off |
| Location (background) | after the foreground grant, with its own explanation | fences do not fire while the app is closed |
| Exact alarms | the first reminder that needs one | Android may deliver a few minutes late |
| Microphone | the first voice note | voice capture is unavailable |
| Photos / camera | the first attachment | attachments are unavailable |

The Do Not Disturb bypass is **off by default** and lives in
Settings → Notifications, because DND is the user's own boundary.
