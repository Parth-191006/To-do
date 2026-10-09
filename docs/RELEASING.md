# Releasing TaskFlow

## The pipeline

Release APKs are built entirely by GitHub Actions — no local Android SDK
required. Every run of
[`android-apk.yml`](../.github/workflows/android-apk.yml):

1. restores the release keystore from the base64 repository secret
   `ANDROID_KEYSTORE_BASE64` (with the password, alias and key password), and
   **fails the build with instructions** if any of the four are missing — it
   never generates a keystore, because a key minted per run cannot install over
   an existing app,
2. runs `npm run verify`, `npx expo prebuild` and assembles a **signed
   arm64-v8a** release,
3. verifies the signature and uploads `TaskFlow-apk-<run>` as a run artifact,
4. on a version tag, publishes a GitHub release with
   **`TaskFlow-latest.apk`** (stable permalink) and
   **`TaskFlow-v<version>-arm64-v8a.apk`**.

Because every release is signed with the same key, updates install over existing
installs without losing local data.

You can also run it by hand from the Actions tab → **Android APK** → *Run
workflow*, which is the quickest way to re-check the signing secrets without
cutting a tag.

## The signing secrets

Four repository secrets must exist under
**Settings → Secrets and variables → Actions**:

| Secret | Contents |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0` of your `.keystore` file |
| `ANDROID_KEYSTORE_PASSWORD` | the store password |
| `ANDROID_KEY_ALIAS` | the key alias inside the keystore |
| `ANDROID_KEY_PASSWORD` | the key password |

Step-by-step commands for exporting an existing keystore and encoding it are in
[INSTALL.md → Create the release keystore](INSTALL.md#create-the-release-keystore-once).

> **Never let CI mint a key.** Android refuses to update an installed app across
> a signature change, and the only way round that is to uninstall — which wipes
> local data. An earlier revision of this project cached a CI-minted identity
> whose password was committed in a public repository; that identity is retired
> and releases now use only a key that lives in secrets.

## App size

The release build turns on the two size levers Expo exposes, set in
[`app.json`](../app.json) through
[`expo-build-properties`](https://docs.expo.dev/versions/v57.0.0/sdk/build-properties/)
(`android.enableMinifyInReleaseBuilds` and
`android.enableShrinkResourcesInReleaseBuilds`):

| Lever | State | Effect |
| --- | --- | --- |
| Hermes | default, no config | Precompiled bytecode, no interpreter shipped. The `jsEngine` field was removed from the SDK 57 schema — Hermes is the only engine, so there is nothing to switch |
| R8 / minify in release | **enabled** | Shrinks and obfuscates Java/Kotlin, strips unused code |
| Resource shrinking | **enabled** | Removes Android resources no longer referenced |
| `crunchPngs` | enabled by default | Repacks PNGs |
| Bundle compression | **off** (default) | Would shrink the APK further but slow cold start; refused deliberately for a capture-first app |

Measure it on a real build — the exported JS bundle is not the APK:

```bash
npx expo run:android --variant release     # local; needs an Android SDK
# or, in the cloud:
npx eas-cli build --profile preview --platform android
```

The exported bundle (`npx expo export --platform android`) is the fastest proxy
for the JavaScript half: on this tree it is a single ~4.9 MB Hermes bytecode
file.

## Install in 30 seconds

1. Copy the `.apk` to your phone (download directly, or email/Drive/USB).
2. Tap it in **Files → Downloads**.
3. Allow **Install unknown apps** for that source when prompted (the normal
   sideloading dialog — the APK isn't from the Play Store).
4. Open **TaskFlow**, grant the notification permission. Done.

Troubleshooting and older-build caveats: [INSTALL.md](INSTALL.md).

## Before you tag

- [ ] `npm run verify` is green (typecheck + every suite)
- [ ] `maestro test .maestro` passes on a device — the flows are not in CI
- [ ] `npx expo-doctor` reports no new failures
- [ ] `CHANGELOG.md` has a dated entry for the version
- [ ] `app.json`'s `android.versionCode` has been incremented
