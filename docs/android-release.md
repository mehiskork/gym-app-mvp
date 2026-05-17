# Android Release Baseline

This project is Android-focused for the current tester phase.

For tester execution steps, see [`docs/android-tester-runbook.md`](./android-tester-runbook.md).

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
  - Play App Signing certificate after Play Console is configured
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

Before Android tester or Play release, manually verify Firebase/Google Cloud API key restrictions. Do not assume restrictions are configured just because the client config exists in the repo.

- Restrict Firebase Web/API key usage where possible.
- For Android app restrictions, use package name `com.mehka.gymappmvp`.
- Add the matching SHA-1 and SHA-256 fingerprints for each signing context in use.
- Keep the Firebase Auth / Google Sign-In APIs required by the app enabled.
- Do not paste private keys, service-account JSON, keystores, or secrets into the repo.

## Pre-tester checklist

Before inviting Android testers:

- Preview EAS build is installed on a real Android device.
- Google Sign-In works.
- Guest -> Google migration works.
- Guest -> selected Google account migration preserves existing account cloud data and additively merges local guest data.
- Direct signed-in Account A -> Account B switch requires destructive reset.
- Reconnect with the same Google account works.
- Account sync uses `account_jwt`.
- Missing guest device-token recovery works without app restart.
- Quick Workout and Planned Workout work.
- Templates preview/import works and duplicate imports are disabled.
- Plan session deletion and zero-session plan empty state work.
- Unfinished reminder permission behavior matches the setting + OS permission gate.
- Active workout online edits sync safely.
- Support bundle does not contain raw auth tokens.
- Railway `/ready` is green.

## Play account deletion readiness

Before Play production submission:

- Verify in-app deletion works from `Settings -> Delete account` for signed-in users.
- Verify the public web deletion resource is reachable at the deployed backend URL plus `/account-deletion`.
- Verify the public privacy policy is reachable at the deployed backend URL plus `/privacy`.
- Configure a real support address with `TRAINFRAME_SUPPORT_EMAIL`; production-like backend profiles reject the placeholder `support@example.invalid`.
- Configure production mobile builds with `EXPO_PUBLIC_APP_ENV=production` and a real production `EXPO_PUBLIC_API_BASE_URL`.
- Do not use the checked-in shared Railway preview/dev backend URL for Play production builds; the mobile app rejects that URL when `EXPO_PUBLIC_APP_ENV=production`.
- Use the public `/account-deletion` URL in Play Console account deletion / Data Safety fields.
- Use the public `/privacy` URL in the Play Console privacy policy field.
- Confirm the privacy policy references the same `/account-deletion` deletion path.
- Define the manual support processing expectation for web deletion requests before launch.
- Confirm the public web form does not request passwords, tokens, support bundles, keystores, or other secrets.
