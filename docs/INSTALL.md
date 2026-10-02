# Installing TaskFlow on your phone

Three ways to get the app running on a device, easiest first.
**Option A is what you want** — install the APK, no computer needed at install time.

---

## Option A — Install the APK (recommended)

### Step 1 · Download it (one tap, no build needed)

On your phone, open this link — it never changes and always serves the APK
from the newest release:

**<https://github.com/Parth-191006/To-do/releases/latest/download/TaskFlow-latest.apk>**

Every release keeps a plain `TaskFlow-<version>.apk` (plus this permanent-name
`TaskFlow-latest.apk` copy) that works on any phone, and smaller per-CPU
variants at about half the size — see
[Which APK to download?](#which-apk-to-download).

No release exists yet? Build one yourself — see
[Step 1b](#step-1b--build-the-apk-on-github-only-if-no-release-exists).

### Step 2 · Install it

1. Tap the downloaded file in **Files → Downloads** (or the notification).
2. Android will warn: *"For your security, your phone is not allowed to install
   unknown apps from this source."* Tap **Settings** → enable
   **Allow from this source** → back → **Install**.
   (This appears because the app is not from the Play Store — it is the normal
   sideloading prompt, and it is safe here because the APK is built by this
   repository's own CI.)
3. Open **TaskFlow**. Grant the notification permission when asked.

### Step 1b · Build the APK on GitHub (only if no release exists)

1. Open **https://github.com/Parth-191006/To-do/actions**
2. In the left sidebar, select **Android APK**
3. Click **Run workflow →** (keep branch as `main`) → **Run workflow**
4. Wait ~15–20 min. Click the running build to watch the live log.
5. When it finishes, download the **TaskFlow-apk-\<number\>** artifact from
   the run's Artifacts section and unzip it — inside are the installable APKs.
   (Tagging a `v*` commit instead attaches them to a Release automatically.)

Transfer the APK to the phone any way you like — email it to yourself, use
Google Drive / Telegram / WhatsApp "message to self", or copy it over USB.

### Updating later

Every build is signed with the **same** key: it is minted once, kept in the
Actions cache, and refreshed on every push to `main`. A newer APK therefore
installs straight over the old one and your tasks and habits are preserved —
just download and tap again, with nothing to uninstall.

The one exception is an install from a build made **before the CI keystore was
pinned** (v1.1.0 or earlier). That signature cannot be reproduced, so uninstall
it once and install the current release. Data lives on the device, so
uninstalling clears tasks and habits — install v1.1.1 or later and this never
comes up again.

Prefer an identity that can never lapse? Pin your own key — see
[Release with your own keystore](#release-with-your-own-keystore).

### Troubleshooting

| Symptom | Fix |
| --- | --- |
| "App not installed" | Signature mismatch — uninstall TaskFlow, then install again. |
| Install blocked entirely | Settings → Security → enable **Install unknown apps** for the app you used to open the APK (Chrome, Files, Drive…). |
| Downloaded `.apk` keeps failing | Some browsers rename it `.zip` — rename it back to `.apk`. |
| Build failed on GitHub | Open the Actions run, check the red step; re-run once (npm/registry flake) before debugging. |
| Notifications don't appear | Open TaskFlow → ⚙ Settings → **Notifications**, tap **Send a test**, and allow the permission (or tap **Open system settings** if Android has blocked it). Then **Re-arm all reminders**. |
| Focus timer resets when paused | Fixed — update to the latest APK. |
| "New project" does nothing | Fixed — the FAB item is now **New list**, and opens a sheet for the name and colour. |

---

## Option B — Expo Go (fastest, no build)

Good for trying the UI in 2 minutes. Notifications, geofencing and background
tasks are limited in Expo Go, so it is a preview, not the full app.

1. Install **Expo Go** from the Play Store.
2. On your PC, in this project: `npm install`, then `npx expo start`.
3. Scan the QR code with the phone (or open the exp:// link).

---

## Option C — Development build (full features, live reload)

The real deal for working on the app: full native features plus hot reload.

```bash
npm install
npx expo run:android          # phone plugged in via USB (debugging on), or emulator
```

Installs a debug build on the device and connects Metro for live reload.
Requires Android Studio/SDK + JDK 17 on the PC.

---

## Release with your own keystore (optional)

For one stable signature across builds (install-over-the-top updates, Play
Store, sharing with others):

1. Create a keystore once:

   ```bash
   keytool -genkeypair -v -keystore taskflow-release.keystore \
     -alias taskflow -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Base64 it and add **four GitHub repo secrets**
   (Settings → Secrets and variables → Actions):

   | Secret | Value |
   | --- | --- |
   | `KEYSTORE_BASE64` | `base64 -w0 taskflow-release.keystore` output |
   | `KEYSTORE_PASSWORD` | the store password you chose |
   | `KEY_ALIAS` | `taskflow` |
   | `KEY_PASSWORD` | the key password you chose |

3. That's it — the workflow already prefers these secrets when present (the
   keystore job decodes `KEYSTORE_BASE64` instead of minting a key, and the
   sign step reads the passwords/alias from secrets with `taskflow-ci` /
   `taskflow` only as fallbacks). Every APK now shares your identity and can
   update the previous install in place.

---

## Releasing a version (creates a downloadable Release)

Tag a commit and the workflow builds + publishes automatically:

```bash
git tag v1.0.1 && git push origin v1.0.1
```

The APK then appears under the repo's **Releases** page with auto-generated
notes — a tidy permanent download link you can share.

### Which APK to download?

Every release ships a **single arm64-v8a APK** — the CPU architecture used by
essentially every Android phone made since ~2016. There is no per-architecture
or universal menu to reason about:

| File | Size | Best for |
| --- | --- | --- |
| `TaskFlow-latest.apk` | ~50 MB | **every current phone — the permanent link is the easiest choice** |
| `TaskFlow-<tag>-arm64-v8a.apk` | ~50 MB | the same build, version-named |

Both files are identical and signed with the same key as earlier releases, so a
newer version installs straight over an older one and keeps your data.
