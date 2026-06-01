# Local Development

Run the backend and mobile app locally without guesswork.

---

## Repo structure

```text
apps/
  mobile/      Expo + React Native app (TypeScript)
  backend/     Spring Boot + PostgreSQL API (Java 25)
docs/          Project documentation

docker-compose.yml   Starts Postgres + backend together (local dev only credentials)
```

---

## Prerequisites

| Tool                    | Version                                 |
| ----------------------- | --------------------------------------- |
| Node.js                 | 18+                                     |
| Java                    | 25                                      |
| Docker + Docker Compose | Any recent version                      |
| EAS CLI                 | `>= 16.28.0` — `npm install -g eas-cli` |

The backend currently uses Spring Boot 4.0.5.

---

## Backend

> **Local-only credentials notice:** The `docker-compose.yml` database/user/password values are convenience defaults for local development only. **Never** reuse them for Railway or any other deployment environment.

### Start

From the **repo root**:

```bash
docker compose up --build
```

This starts Postgres 16 and the backend.

- Backend: `http://localhost:8080`
- Postgres: `localhost:5432`

The first build downloads Maven dependencies inside the container, so it may take a few minutes. Later builds are much faster.

### Verify

```bash
curl http://localhost:8080/health
# ok
```

### Stop / reset

```bash
docker compose down          # stop, keep DB data
docker compose down -v       # stop and wipe DB volumes
docker compose up --build    # rebuild and restart
```

### Run without Docker (advanced)

Docker is the normal local path. Only use this if you intentionally want to run the backend directly.

You still need a running Postgres instance. From `apps/backend`:

```bash
export SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/gymapp
export SPRING_DATASOURCE_USERNAME=gymapp
export SPRING_DATASOURCE_PASSWORD=gymapp

./mvnw -DskipTests package
./mvnw spring-boot:run
```

Flyway migrations run automatically on startup. Do not run them manually.

---

## Mobile app

### Install dependencies

From `apps/mobile`:

```bash
npm install
```

### Canonical config files

The canonical mobile config lives under `apps/mobile/`. Always use these files, not the root-level Expo config.

| File                               | Purpose                                                          |
| ---------------------------------- | ---------------------------------------------------------------- |
| `apps/mobile/app.json`             | Expo app config, app name, bundle IDs, EAS project ID            |
| `apps/mobile/eas.json`             | EAS build profiles                                               |
| `apps/mobile/google-services.json` | Android Firebase client config required by the app build |

The canonical Expo/EAS config lives under `apps/mobile/`. Run EAS commands from `apps/mobile`; running from the repo root can fail or use the wrong context. Do not change Expo slug from `mobile` unless deliberately migrating the EAS project and credentials.

`apps/mobile/google-services.json` is intentionally tracked because it contains Firebase Android client configuration required by the app build. It is public mobile client config, not a server credential or private service-account key. The associated Google Cloud API key must remain restricted to the intended app/package, signing fingerprints, and required Firebase APIs as described in `docs/firebase-client-config.md`.

### Expo Go is unsupported

This app uses native modules such as `expo-sqlite`. **Expo Go will not work.** Use a development build or another native build.

### Local SQLite baseline reset

The mobile SQLite migrations are currently squashed into one reset-only private-beta baseline. This was done before any external testers existed, so old internal/dev SQLite databases are not supported across the squash.

If your dev build was installed before the mobile baseline squash, reset local mobile data before testing:

- uninstall and reinstall the app, or
- clear the app storage from the simulator/device, or
- use the app's destructive reset flow.

SQLite remains the mobile source of truth. This is not a database-engine change and does not change sync/auth behavior.

### Start Metro

```bash
npm run start
```

Metro must be running before you launch the dev build on a simulator or device.

Do **not** scan the Metro QR code with Expo Go.

### Build and install a dev build

From `apps/mobile`:

```bash
# iOS simulator or device
npx eas build --profile development --platform ios

# Android device or emulator
npx eas build --profile development --platform android
```

Once installed, open the dev build and connect it to the running Metro bundler.

### Development vs preview builds

| Profile       | Dev client | OTA updates | Use for                                 |
| ------------- | ---------- | ----------- | --------------------------------------- |
| `development` | ✓          | ✗           | Active development, Metro, fast refresh |
| `preview`     | ✗          | ✓           | Direct Android tester/device install    |
| `production`  | ✗          | ✓           | Google Play upload AAB                  |

Use `development` for normal coding. Use `preview` when you want behavior closer to a production build.

### Android tester and release builds

Controlled direct-install QA builds should use the `preview` EAS profile from `apps/mobile`.

```bash
cd apps/mobile
npx -y eas-cli@latest build -p android --profile preview --clear-cache
```

The preview profile is configured as `distribution: internal`, so it produces an installable internal Android build rather than a Play Store production submission. The visible app name is `TrainFrame`; the Android package remains `com.mehka.gymappmvp` so Firebase and existing backend/client assumptions continue to line up.

Production Android builds use the `production` EAS profile and output an Android App Bundle for Play Console upload. That profile uses `EXPO_PUBLIC_APP_ENV=production`, `EXPO_PUBLIC_API_BASE_URL=https://www.trainframe.eu`, and EAS Update channel `production`.

```bash
cd apps/mobile
npx -y eas-cli@latest build -p android --profile production --clear-cache
```

Keep `expo.name` as `TrainFrame` and keep `expo.slug` as `mobile`. The slug is tied to the existing EAS project and should not change unless the EAS project and credentials are deliberately migrated. Android `versionCode` starts at `1` and must increase for every Play upload; EAS remote app versioning may auto-increment it for production builds. Use `--clear-cache` after icon or Expo config changes.

See [Android release baseline](./android-release.md) for canonical EAS, Play, signing, and production-build details.

After installing a preview build, confirm the backend target inside the app:

1. Open **Settings -> About**.
2. Tap the version string 7 times quickly to unlock Debug.
3. Open **Debug -> Backend / Environment**.
4. Confirm **Backend URL** is:

```text
https://gym-app-mvp-production.up.railway.app
```

That Railway URL is intentionally the shared preview/dev QA backend. It is public routing information, not a private protection mechanism, and it is not the primary production URL.

Before sharing a preview build with testers, verify Firebase Android fingerprints for the exact build signing certificate. In Firebase Console / Google Cloud Console, the Android app for package `com.mehka.gymappmvp` should include the SHA-1 and SHA-256 fingerprints used by the EAS preview build. See [Android release baseline](./android-release.md#firebase-android-signing) for production and Play App Signing details. You can inspect EAS credentials with:

```bash
cd apps/mobile
npx eas credentials --platform android
```

Compare the listed Android signing certificate fingerprints with Firebase project settings. If the preview build uses a new EAS signing key, add both SHA-1 and SHA-256 fingerprints in Firebase, then rebuild the preview app.

---

## Connecting the mobile app to the backend

The checked-in mobile app currently targets the Railway shared preview/dev QA backend by default:

```text
https://gym-app-mvp-production.up.railway.app
```

That default lives in `apps/mobile/app.json` under `expo.extra.EXPO_PUBLIC_API_BASE_URL`. It should not be treated as private or as the production backend. Production EAS builds override the API URL through `apps/mobile/eas.json` and use:

```text
https://www.trainframe.eu
```

The mobile API URL precedence is:

1. Expo extra config: `API_BASE_URL` or `EXPO_PUBLIC_API_BASE_URL`
2. Environment variables: `EXPO_PUBLIC_API_BASE_URL` or `API_BASE_URL`, when Expo constants are unavailable
3. Fallback only: `http://localhost:8080`

Because the checked-in Expo extra is present, normal dev builds use the Railway preview/dev QA backend unless you deliberately override it.

### What works where

- **Railway shared preview/dev QA:** works from simulators, emulators, and physical devices without a local backend.
- **Production:** production EAS/Play builds use `https://www.trainframe.eu`; use production only for release validation and operational smoke tests.
- **iOS Simulator local backend:** `localhost` usually works if you override the API URL to `http://localhost:8080`.
- **Physical device local backend:** `localhost` points to the phone itself; use your computer's LAN IP.
- **Android emulator local backend:** use `http://10.0.2.2:8080` for the host machine, or a LAN IP for a physical device.

To test against a local backend, temporarily set `EXPO_PUBLIC_API_BASE_URL` in `apps/mobile/app.json` under `expo.extra`:

```json
{
  "expo": {
    "extra": {
      "EXPO_PUBLIC_API_BASE_URL": "http://192.168.1.x:8080"
    }
  }
}
```

Replace `192.168.1.x` with your machine's LAN IP, or use `http://localhost:8080` for an iOS simulator and `http://10.0.2.2:8080` for the Android emulator. Restart Metro or rebuild the dev client if the app does not pick up the changed Expo config.

> Do not commit a local IP address. Revert the change before pushing.

To verify what the app is using, open the hidden Debug screen and check **Backend / Environment** -> **Backend URL**.

The app is offline-first, so core local workout logging still works without the backend. Backend reachability mainly matters for sync, claim flow testing, and multi-device scenarios.

For backend smoke tests against the shared preview/dev QA Railway service:

```bash
BASE="https://gym-app-mvp-production.up.railway.app"

curl -i "$BASE/health"
curl -i "$BASE/ready"
curl -i "$BASE/me"
```

Expected results:

- `/health` returns `200`
- `/ready` returns `200` with database, Flyway, and required-table checks healthy
- `/me` without auth returns `401`
- To test invalid auth handling, send a deliberately malformed token from your local shell; do not commit real tokens to docs.

Keep local development, preview/direct-install QA, and production backend targets explicit so local testing cannot silently hit production.

---

## Tests

### Mobile

From `apps/mobile`:

```bash
npm run lint
npm run typecheck
TMPDIR=/tmp npm test -- --runInBand
```

These tests run in Node with SQLite and native modules mocked. They do not exercise real device behavior.

### Backend

Backend Maven commands require JDK 25. GraalVM CE 25.0.2 is the tested local runtime; any compatible JDK 25 should work.

From `apps/backend`:

```bash
./mvnw test
./mvnw verify
```

- `./mvnw test` runs the fast unit-style test phase and excludes `*IT.java` / `*IntegrationTest.java`
- `./mvnw verify` also runs integration tests such as `*IT.java` / `*IntegrationTest.java`
- On Windows, use `mvnw.cmd test` and `mvnw.cmd verify`

**Important:** `./mvnw test` does **not** run integration tests. Backend integration tests use Testcontainers, so `./mvnw verify` requires a running Docker daemon. Always run `./mvnw verify` before merging backend changes that touch sync, auth, claim flow, or persistence behavior.

### CI fast gates

GitHub Actions runs `.github/workflows/ci-fast.yml` on pull requests and pushes:

- mobile `npm ci`, lint, typecheck, and Jest with `TMPDIR=/tmp`
- backend `./mvnw test` with Java 25

Backend integration tests live in `.github/workflows/backend-integration.yml`. That workflow runs `./mvnw verify` with Java 25 on backend-relevant pull requests, on `main` pushes, and when started manually with `workflow_dispatch`; it requires Docker/Testcontainers support.

---

## Debug screen

The Debug screen exposes sync controls, row counts, outbox state, and support bundle export. It is hidden by default.
It also shows auth/session observability signals used for account rollout support:

- sync auth mode (last used + next planned)
- account session status (`missing` / `usable` / `invalidated`)
- account invalidation reason + timestamp
- device token presence (boolean only)
- linked state (`guest` / `linked`)

### Unlock

Go to **Settings → About** and tap the version string **7 times quickly**.

### Lock again

Long-press the version string.

The Debug screen remains the main manual sync tool during development and troubleshooting.

---

## Sync in development

The sync system is implemented. Sync is scheduled after outbox writes, app startup, foreground resume with cooldown, and account-entry flows. There is still no periodic timer or true OS background sync.

Account-entry sync currently runs after:

- guest-to-Google account migration completes claim confirm, `/me`, and SecureStore session write
- signing back into an account from a clean local database
- reconnecting from `linked_reauth_required`

Startup and foreground sync use the same scheduled sync path as outbox writes. They do not run continuously and do not imply a network-state listener.

To trigger sync manually in development or troubleshooting:

1. Unlock the Debug screen
2. Use the **Sync** or **Pull** buttons there

The backend must be running and reachable for sync to succeed.

---

## Claim flow locally

`POST /claim/start` is device/guest-authenticated and can be exercised after device registration.

`POST /claim/confirm` is account-authenticated and requires a valid Firebase account JWT. The backend derives the target account owner from the verified Firebase principal; do not send or trust a client-sent user/account id.

Mobile Google Sign-In plus guest migration orchestration is implemented. In normal mobile QA, use the Settings account flow: guest data is synced, `/claim/start` runs with the device token, Google Sign-In returns a Firebase ID token, `/claim/confirm` runs with that account JWT, and the account session is stored only after claim confirmation succeeds.

---

## Deployment/readiness checklist (quick)

Before public or production-like deployment, verify:

1. A prod-like Spring profile is active (`prod`, `production`, or `staging`). Railway should use `SPRING_PROFILES_ACTIVE=prod`.
2. Firebase account-auth config is set for prod-like startup: `APP_AUTH_FIREBASE_PROJECT_ID` and `SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUER_URI`. `SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_JWK_SET_URI` may be set as an explicit JWK override.
3. `/ready` is checked after startup; it should report database, Flyway, and required tables healthy. Flyway readiness fails if `flyway_schema_history` contains any failed migration row.
4. `/sync` auth path is validated for both account-JWT and device-token recovery behavior.
5. QA covers guest sync, guest -> selected Google merge, direct account-switch destructive reset, same-Google account deletion/recreation, missing guest device-token recovery, notification permission gating, Quick Workout, Planned Workout, Templates preview/import, plan session deletion, and active workout online sync edits.
6. Support/debug runbook is known to operators (Debug screen unlock, support bundle export).
7. `./mvnw verify` and mobile test/typecheck/lint are green on the release candidate.

## Troubleshooting

### The app shows a blank screen or crashes after `expo start`

You are probably trying to use Expo Go. Install a dev build with:

```bash
npx eas build --profile development --platform android
# or ios
```

### The app cannot reach the backend on a physical device

The checked-in mobile default is Railway. If you intentionally override the app to use a local backend, remember that `localhost` on a phone points to the phone itself. Set `EXPO_PUBLIC_API_BASE_URL` in `apps/mobile/app.json` to your computer's LAN IP, for example:

```json
"http://192.168.1.x:8080"
```

Then confirm the resolved value in Debug -> Backend / Environment -> Backend URL.

### `docker compose up --build` fails with a port conflict

Another process is already using `8080` or `5432`. Stop the conflicting service or change the port mapping in `docker-compose.yml`.

### The backend fails with a Flyway error on startup

This is usually a dirty DB state from a partial migration. Reset volumes and start again:

```bash
docker compose down -v
docker compose up --build
```

### `./mvnw verify` fails with a Docker/Testcontainers error

Backend integration tests require a running Docker daemon. Start Docker Desktop or your local Docker service and run the command again.

### `eas build` uses the wrong project

You are probably running the command from the repo root. Run all EAS commands from `apps/mobile`.

### Sync works in the Debug screen, but data does not appear on another device

Check the Debug screen for:

- outbox queue state
- last sync error
- sync cursor
- auth/token issues
- retry/backoff behavior
