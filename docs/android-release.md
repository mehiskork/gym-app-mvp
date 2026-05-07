# Android Release Baseline

This project is Android-focused for the current tester phase.

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
