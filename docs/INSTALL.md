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
4. If it stops in the first seconds with *Signing secrets missing*, the four
   secrets are not set yet — the build never starts without them, on purpose.
   Follow [Create the release keystore](#create-the-release-keystore-once), then
   run it again.
5. Otherwise wait ~15–20 min. Click the running build to watch the live log.
6. When it finishes, download the **TaskFlow-apk-\<number\>** artifact from
   the run's Artifacts section and unzip it — inside are the installable APKs.
   (Tagging a `v*` commit instead attaches them to a Release automatically.)

Transfer the APK to the phone any way you like — email it to yourself, use
Google Drive / Telegram / WhatsApp "message to self", or copy it over USB.

### Updating later

Every build signed with the key held in this repository's secrets installs
straight over the last one and your tasks and habits are preserved — download and
tap again, with nothing to uninstall. The workflow refuses to build until those
secrets exist ([Create the release keystore](#create-the-release-keystore-once)),
because a key minted on a runner cannot update an app that is already installed.

The exception is an APK signed with a key this workflow no longer uses: builds up
to **v1.2.3** (the retired CI-minted key, or a keystore held under the old
`KEYSTORE_*` secret names) and **v1.1.0 or earlier**. Android treats a signature
change as a different app, so uninstall that build once before installing the
current release — **Settings → Data → Export** first, since uninstalling clears
local data.

Prefer an identity that can never lapse? Pin your own key — see
[Create the release keystore](#create-the-release-keystore-once).

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

## Create the release keystore (once)

**Required.** The release workflow will not build without it: it never creates a
key of its own, because a key minted per run cannot install over an app that is
already on a phone (Android treats a signature change as a different app, and
the only way round it is an uninstall, which wipes local data).

You need **four repository secrets** (repo → Settings → Secrets and variables →
Actions → *New repository secret*):

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | base64 of the `.keystore` file — one line, no wrapping |
| `ANDROID_KEYSTORE_PASSWORD` | the store password you chose |
| `ANDROID_KEY_ALIAS` | the key alias inside the keystore (`taskflow` below) |
| `ANDROID_KEY_PASSWORD` | the key password (same as the store password with a modern, PKCS#12 keystore) |

### A. Create a new key (or reuse one you already have)

`keytool` ships with any JDK; on a machine without one:

```bash
winget install EclipseAdoptium.Temurin.17.JDK     # Windows (open a new shell after)
brew install openjdk@17                            # macOS
```

Create the keystore — keep it **outside** the repository (it is ignored either
way: `*.jks`/`*.keystore` are in `.gitignore`, but a signing key should never sit
in a working tree):

```bash
keytool -genkeypair -v -keystore taskflow-release.keystore \
  -alias taskflow -keyalg RSA -keysize 2048 -validity 10000
```

It prompts for the store password, the key password and a name/organisation.
Use a long password and store it in a password manager **with a copy of the
`.keystore` file** — losing either one means the next release has a new
identity. To check an existing keystore instead:

```bash
keytool -list -v -keystore taskflow-release.keystore    # prints the aliases
```

### B. Base64 it and set the secrets

Git Bash / Linux:

```bash
base64 -w0 taskflow-release.keystore > keystore.b64
```

macOS (no `-w0`):

```bash
base64 -i taskflow-release.keystore | tr -d '\n' > keystore.b64
```

PowerShell (copies straight to the clipboard):

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("taskflow-release.keystore")) | Set-Clipboard
```

Paste that single line into `ANDROID_KEYSTORE_BASE64`, then add the other three
secrets from step A.

### C. Check it without cutting a release

Actions → **Android APK** → *Run workflow* (branch `main`). The first steps
report the signing certificate's SHA-256 fingerprint on the run's **Summary**
page, and the four secrets are validated before the build starts — a wrong
alias, store password or key password fails in seconds with a message naming the
secret to fix, instead of 20 minutes into Gradle.

Once the secrets are set, every APK shares one identity and a newer build
installs over the old one with data intact.

> **The retired CI key.** Releases up to v1.2.3 were signed with a key that a
> previous version of this workflow generated on the runner and cached, with the
> password `taskflow-ci` committed in the workflow file. That identity is gone:
> its password was public, so anyone could have signed an update with it. Release
> APKs now come only from the secrets above.

### If your existing keystore only exists in the old CI cache

GitHub has no way to download the Actions cache through the UI, so a key that
was minted on a runner and only ever cached cannot be recovered from the
repository. Two options:

- **Start fresh (recommended).** Follow A–C above. If a phone already has
  TaskFlow installed under the old signature, Android asks you to uninstall it
  once — export first from **Settings → Data → Export**, then re-import after
  installing.
- **Keep the exact old signature.** Make the repository private temporarily,
  run a one-off workflow that restores the cache entry
  (`key: taskflow-release-keystore-v2`) and uploads it as an artifact, download
  it, set the secrets, delete that run and the temporary workflow, then make the
  repository public again. This is only worth it if you must preserve installs
  of the old signature; ask and the workflow can be added for the purpose.

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
