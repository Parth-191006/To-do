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
column and the AI rate limiter. Then deploy the functions in
[`supabase/functions/`](../supabase/functions/) — see that folder's README.

## The AI planner, plainly

| | |
| --- | --- |
| **Default** | Everything runs on device. The subtask planner is rule-based — a keyword-matched library of templates that ships with the app — so **the feature works in airplane mode**. |
| **With `EXPO_PUBLIC_AI_ENDPOINT`** | The title, notes, estimate and priority of that one task are POSTed to the endpoint you configure, with a 3.5 s budget. Any failure — offline, 401, 429, timeout — falls straight back to the on-device planner. This layer is **optional**; nothing else in the app requires it. |
| **Keys** | No paid or secret key ships in `EXPO_PUBLIC_*`. The sample proxy in [`supabase/functions/ai-breakdown/`](../supabase/functions/) holds the key behind Supabase `verify_jwt`, per-user resolution and a per-minute rate limit. |

## What is stored where

**On the device, always:** tasks, notes, subtasks, lists, tags, habits and
their logs, focus sessions, voice notes, photo attachments, preferences. One
SQLite file. **No telemetry, no analytics SDK, no crash reporter.**

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
