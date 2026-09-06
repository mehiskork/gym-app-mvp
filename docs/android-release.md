# Android Release Baseline

TrainFrame is available in production on Google Play. This document records the Android identity, EAS build profiles, signing requirements, and release checks.

For tester execution steps, see [`docs/internal/android-tester-runbook.md`](./internal/android-tester-runbook.md).

## App identity

- Display name: `TrainFrame`
- Expo slug: `mobile`
- Android package: `com.mehka.gymappmvp`
- Initial Android `versionCode`: `1`

Do not change the Expo slug from `mobile` unless deliberately migrating the EAS project and credentials. The slug is tied to the existing EAS project ID.

The Android `versionCode` must increase for every Play Console upload. The `production` EAS profile uses remote app versioning with `autoIncrement`, but verify the resolved value before each Play upload.

## Assets

Expo config should continue to point at:

- `./assets/icon.png`
- `./assets/adaptive-icon.png`
- `./assets/splash-icon.png`
- `./assets/favicon.png`

The adaptive icon background should remain dark: `#070A0F`.

## Build profiles

Run EAS commands from `apps/mobile`, not the repo root.

Preview builds are for direct tester/device install:

```bash
cd apps/mobile
npx -y eas-cli@latest build -p android --profile preview --clear-cache
```

Production builds output an Android App Bundle for Play Console upload:

```bash
cd apps/mobile
npx -y eas-cli@latest build -p android --profile production --clear-cache
```

Use `--clear-cache` after icon or Expo config changes so EAS does not reuse stale native configuration.

The production EAS profile is the canonical Google Play build profile. It must keep:

- `autoIncrement: true`
- Android `buildType: app-bundle`
- `channel: production`
- `EXPO_PUBLIC_APP_ENV=production`
- `EXPO_PUBLIC_API_BASE_URL=https://www.trainframe.eu`

Preview builds may continue to target the direct Railway preview/dev QA endpoint. Production builds must not use that endpoint.

TrainFrame is live in production on Google Play. Play App Signing SHA-1/SHA-256 has been added to Firebase, and Google Sign-In has been validated in a Play-installed build. Future AAB uploads still require normal `versionCode` increments and Play release creation.

## Android release optimisation

Release builds enable R8 minification and resource shrinking through
`expo-build-properties`. The local `withAndroidR8Optimization` plugin additionally
selects `proguard-android-optimize.txt` and sets
`android.r8.optimizedResourceShrinking=true`. These enable code optimisation and
the optimised resource shrinking pipeline on the current AGP 8.12 toolchain.
The ordinary `proguard-android.txt` defaults disable code optimisation even when
minification is enabled.

The plugin preserves application and dependency keep rules. If the Expo Android
template changes unexpectedly, prebuild fails with an instruction to review the
plugin. Reassess it when upgrading Expo or AGP; AGP 9 enables optimised resource
shrinking by default. See [Android's R8 guidance](https://developer.android.com/topic/performance/app-optimization/enable-app-optimization).

Before rolling out an optimisation change:

- Run mobile lint, typecheck, tests and Expo Doctor. The R8 tests use Expo's file
  providers with the installed Android template and check repeated generation.
- Run an Android prebuild in a disposable copy. Confirm `android/app/build.gradle`
  selects `proguard-android-optimize.txt`, and `android/gradle.properties` enables
  minification, resource shrinking and optimised resource shrinking.
- Build the production AAB with `--clear-cache` using the command above. Confirm
  `:app:minifyReleaseWithR8` ran successfully in the build logs. Inspect the
  effective `android/app/build/outputs/mapping/release/configuration.txt` for active
  `-dontoptimize`, `-dontshrink` or `-dontobfuscate` directives. If any are present,
  trace their origin before claiming full optimisation is enabled.
- Retain the matching `mapping.txt` from the same output directory with the build
  identity and version code; confirm Play has the bundle's deobfuscation mapping.
  Obtain these outputs from the build environment if they are not exposed as EAS
  artefacts. A prebuild or JavaScript test does not prove that R8 completed.
- Upload that production bundle to Play internal testing. Test cold startup,
  Google sign-in, workout creation and resume, offline persistence across restart,
  sync, notifications and account deletion. Use the Play-installed build so signing
  and the production configuration match the eventual release.
- Check that Play recognises code optimisation and optimised resource shrinking,
  and inspect its optimisation, shrinking and obfuscation percentages. Enabling
  these settings does not guarantee specific percentages. The separate AGP-upgrade
  recommendation can remain until a compatible toolchain upgrade is completed.

## Firebase Android signing

Firebase is used for Auth only. TrainFrame Google Sign-In depends on the Android package and signing fingerprints matching Firebase/Google Cloud configuration.

Before sharing a preview build or uploading a production build, manually verify:

- Firebase project: `gym-app-mvp-1d7f0`
- Firebase Android app package: `com.mehka.gymappmvp`
- `apps/mobile/google-services.json` belongs to the same Firebase project and Android package.
- SHA certificates are added in Firebase for every signing context used:
  - local/debug signing, if used
  - EAS preview/internal build signing certificate
  - production/Play upload signing certificate
  - Play App Signing certificate from Play Console App integrity setup
- SHA-1 is commonly required for Google Sign-In.
- SHA-256 should also be added wherever Firebase/Google Cloud offers it.

After changing SHA values in Firebase, download the updated `google-services.json`. Commit it only if it contains normal Firebase client configuration and no private keys, service-account JSON, keystores, or secrets.

## Signing fingerprints

Get EAS Android signing fingerprints from:

```bash
cd apps/mobile
npx -y eas-cli@latest credentials -p android
```

Get the Play App Signing fingerprint from:

```text
Play Console -> app -> Setup -> App integrity -> App signing key certificate
```

Get a local debug fingerprint, if local/debug signing is used:

```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
```

## Firebase API restrictions

Firebase API key restrictions have been externally verified for the current setup. Before Android tester or Play release, and after any signing change, recheck Firebase/Google Cloud API key restrictions. Do not assume restrictions are configured just because the client config exists in the repo.

- Restrict Firebase Web/API key usage where possible.
- For Android app restrictions, use package name `com.mehka.gymappmvp`.
- Add the matching SHA-1 and SHA-256 fingerprints for each signing context in use.
- Keep the Firebase Auth / Google Sign-In APIs required by the app enabled.
- Do not paste private keys, service-account JSON, keystores, or secrets into the repo.

## Play account deletion and release checks

Before each Play production release:

- Verify in-app deletion works from `Settings -> Delete account` for signed-in users.
- Verify the public web deletion resource is reachable at `https://www.trainframe.eu/account-deletion`.
- Verify the public privacy policy is reachable at `https://www.trainframe.eu/privacy`.
- Verify the public terms page is reachable at `https://www.trainframe.eu/terms`.
- Configure `TRAINFRAME_SUPPORT_EMAIL=trainframe1@gmail.com`; production-like backend profiles reject missing, blank, placeholder, or `.invalid` values.
- Configure production mobile builds with `EXPO_PUBLIC_APP_ENV=production` and `EXPO_PUBLIC_API_BASE_URL=https://www.trainframe.eu`.
- Do not use the checked-in shared Railway preview/dev backend URL for Play production builds; the mobile app rejects that URL when `EXPO_PUBLIC_APP_ENV=production`.
- Use `https://www.trainframe.eu/account-deletion` in Play Console account deletion / Data Safety fields.
- Use `https://www.trainframe.eu/privacy` in the Play Console privacy policy field.
- Confirm the privacy policy references the same `/account-deletion` deletion path.
- Keep the manual support processing expectation for web deletion requests at 30 days unless legal/public-production review changes it.
- Confirm the public web form does not request passwords, tokens, keystores, or other secrets. Support bundles are not needed for deletion requests.
