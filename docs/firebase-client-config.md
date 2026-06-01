# Firebase client config policy

Firebase is used for authentication only. App data remains SQLite mobile source of truth synced through the Spring Boot `/sync` API into PostgreSQL.

## Current decision

`apps/mobile/google-services.json` is intentionally tracked because it contains Firebase Android client configuration required by the app build. It includes public mobile client config such as the Firebase Web API key and OAuth client IDs. It is not a server credential, private backend secret, or Firebase service-account key.

The associated Google Cloud API key must remain restricted to the intended Android package, signing fingerprints, and required Firebase APIs. Firebase/Google Cloud API key restrictions have been checked for public repository visibility; re-check them after any Firebase app, package, signing, or API changes.

## Required Google Cloud/Firebase restrictions

Before relying on this config for QA, internal testing, or public repository visibility, verify in Firebase Console / Google Cloud Console:

- Verify the Firebase API key is restricted where possible to only the Firebase/identity APIs needed by the app, especially Firebase Authentication / Identity Toolkit and Secure Token APIs.
- Verify Android app restrictions use package name `com.mehka.gymappmvp`.
- Verify matching SHA-1 and SHA-256 fingerprints are present for local/debug, EAS preview/internal, production upload, and Play App Signing contexts.
- For public GitHub visibility, re-check Android application restrictions for package `com.mehka.gymappmvp` with the expected SHA-1 and SHA-256 fingerprints.
- Quota and usage monitoring are enabled so unexpected traffic is visible.

## Public repo / public beta policy

For public repository visibility, internal testing, wider public beta, or Play Store release:

- Keep `apps/mobile/google-services.json` tracked only as Firebase Android client configuration required by the app build.
- Do not treat the file as a server credential or use it for backend auth.
- Re-verify API restrictions, Android package restrictions, SHA fingerprints, and quota alerts after signing, app, or Firebase changes.
- Split dev/QA/prod Firebase projects or client configs if public beta and internal QA need different blast radii.

## Local and EAS build flow

Current build flow:

- Android dev/preview builds read `apps/mobile/google-services.json` via `apps/mobile/app.json`.
- Developers do not need a separate local file for the current Android Firebase client config.
- EAS builds use the checked-in file for the current Android app config.
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

`google-services.json` is intentionally excluded from that check because it is tracked Firebase Android client config, not a private service-account secret.
