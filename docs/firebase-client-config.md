# Firebase client config policy

Firebase is used for authentication only. App data remains SQLite mobile source of truth synced through the Spring Boot `/sync` API into PostgreSQL.

## Current decision

`apps/mobile/google-services.json` is intentionally tracked for the current private/dev phase. It contains Firebase Android client configuration, including the Firebase Web API key and OAuth client IDs. This is client-side configuration, not a private backend secret or Firebase service-account key.

This convenience is acceptable only while the repo and app distribution remain private/internal. Treat the file as intentionally exposed client config and rely on Firebase/Google Cloud restrictions, monitoring, and quotas rather than secrecy.

## Required Google Cloud/Firebase restrictions

Before relying on this config for QA or wider testing, verify in Firebase Console / Google Cloud Console:

- Verify the Firebase API key is restricted where possible to only the Firebase/identity APIs needed by the app, especially Firebase Authentication / Identity Toolkit and Secure Token APIs.
- Verify Android app restrictions use package name `com.mehka.gymappmvp`.
- Verify matching SHA-1 and SHA-256 fingerprints are present for local/debug, EAS preview/internal, production upload, and Play App Signing contexts.
- Before public GitHub visibility, re-check Android application restrictions for package `com.mehka.gymappmvp` with the expected SHA-1 and SHA-256 fingerprints.
- Quota and usage monitoring are enabled so unexpected traffic is visible.

## Public repo / public beta policy

Before making the repo public, distributing a wider public beta, or publishing to Play Store:

- Reconsider whether `google-services.json` should remain tracked.
- Prefer local/EAS secret-file provisioning for `google-services.json` if the workflow supports it cleanly.
- Rotate the Firebase API key if it has been exposed in a public repo or broad artifact history.
- Re-verify API restrictions, Android package restrictions, SHA fingerprints, and quota alerts.
- Split dev/QA/prod Firebase projects or client configs if public beta and internal QA need different blast radii.

## Local and EAS build flow

Current private/dev flow:

- Android dev/preview builds read `apps/mobile/google-services.json` via `apps/mobile/app.json`.
- Developers do not need a separate local file as long as they are working from the private repo.
- EAS builds use the checked-in file for the current Android app config.

Future public/wider flow:

- Keep `google-services.json` local-only or provide it through an EAS secret file.
- Document the exact file provisioning step before removing the tracked file.
- Keep `android.googleServicesFile` pointed at `./google-services.json` unless the build workflow intentionally changes.

## What must never be committed

Do not commit:

- Firebase service-account JSON files.
- Google Cloud service-account keys.
- Private keys such as `*.pem`, `*.key`, `*.p8`.
- Android signing stores such as `*.jks` or `*.p12`.
- `.env` files or token dumps.
- Support bundles containing user data or auth/session material.

Repo hygiene check:

```bash
git ls-files '.env*' '*.pem' '*.key' '*.jks' '*.p12' '*service-account*.json'
```

Expected output: empty.

`google-services.json` is intentionally excluded from that check because it is currently tracked client config, not a private service-account secret.
