# Installing TaskFlow on your phone

Three ways to get the app running on a device, easiest first.
**Option A is what you want** — install the APK, no computer needed at install time.

---

## Option A — Install the APK (recommended)

### Step 1 · Build the APK on GitHub (~15–20 min, one click)

1. Open **https://github.com/Parth-191006/To-do/actions**
2. In the left sidebar, select **Android APK**
3. Click **Run workflow →** (keep branch as `main`) → **Run workflow**
4. Wait ~15–20 min. Click the running build to watch the live log.
5. When it finishes, open the run and download the artifact
   **TaskFlow-apk-\<number\>** from the Artifacts section.
6. Unzip it — inside is the installable APK.

### Step 2 · Put it on your phone

Any of these works:

- **Download straight on the phone**: open this repo in your mobile browser,
  tap **Go to file → `docs/INSTALL.md`** is not needed — instead open the
  Actions run page in your phone's browser and download the artifact there
  (GitHub's mobile site supports artifact download).
- **Send it to yourself**: email the APK to yourself, or use Google Drive /
  Telegram / WhatsApp "message to self" — then open it on the phone.
- **USB**: copy the APK from your PC to the phone's Downloads folder.

### Step 3 · Install it

1. On the phone, tap the APK in **Files → Downloads** (or the notification).
2. Android will warn: *"For your security, your phone is not allowed to install
   unknown apps from this source."* Tap **Settings** → enable
   **Allow from this source** → back → **Install**.
   (This appears because the app is not from the Play Store — it is the normal
   sideloading prompt, and it is safe here because you built this APK yourself.)
3. Open **TaskFlow**. Grant the notification permission when asked.

### Updating later

The workflow signs every build with the **same** key (it mints one on the very
first run and keeps it in the Actions cache afterwards), so a newer APK installs
straight over the old one and your tasks are preserved.

Two cases still need a clean install — uninstall first, then install the new
APK. Your data is local, so uninstalling removes tasks and habits:

- the very first cached-keystore build if you are upgrading from a build made
  before keystore caching existed;
- a build made after the cache expired (roughly 7 days without a run).

For an identity that can never lapse, pin your own key — see
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

3. Extend `.github/workflows/android-apk.yml`: replace the "Align and sign"
   step's `keytool` generation with a decode step:

   ```yaml
   - name: Restore keystore
     run: echo "$KEYSTORE_BASE64" | base64 -d > taskflow-release.keystore
     env:
       KEYSTORE_BASE64: ${{ secrets.KEYSTORE_BASE64 }}
   ```

   and pass `--ks-pass pass:$KEYSTORE_PASSWORD --ks-key-alias $KEY_ALIAS`
   from secrets. Same workflow, but now every APK shares one identity and can
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

Every release ships one slim APK per CPU architecture plus a universal
fallback (all signed with the same key, so you can switch between them without
uninstalling):

| File | Size | Best for |
| --- | --- | --- |
| `TaskFlow-<tag>-arm64-v8a.apk` | smallest, ~40 MB | **most phones since ~2016 — pick this one** |
| `TaskFlow-<tag>-armeabi-v7a.apk` | ~40 MB | older or low-end phones |
| `TaskFlow-<tag>-x86_64.apk` | ~40 MB | Chromebooks and emulators |
| `TaskFlow-<tag>.apk` | ~118 MB | any device, if unsure |

Not sure which CPU your phone has? Install the universal APK, or just try the
`arm64-v8a` one — it refuses to install only if your phone genuinely is not a
64-bit ARM device, and then the universal APK still works.
