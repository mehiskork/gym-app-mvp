# Local Development

Run the backend and mobile app locally without guesswork.

---

## Repo structure

```text
apps/
  mobile/      Expo + React Native app (TypeScript)
  backend/     Spring Boot + PostgreSQL API (Java 21)
docs/          Project documentation

docker-compose.yml   Starts Postgres + backend together (local dev only credentials)
```

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 18+ |
| Java | 21 |
| Docker + Docker Compose | Any recent version |
| EAS CLI | `>= 16.28.0` — `npm install -g eas-cli` |

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

| File | Purpose |
|------|---------|
| `apps/mobile/app.json` | Expo app config, bundle IDs, EAS project ID |
| `apps/mobile/eas.json` | EAS build profiles |

The repo root also contains `app.json` and `eas.json`, but those are not the correct files for normal mobile development. Running `eas build` from the repo root can target the wrong project.

### Expo Go is unsupported

This app uses native modules such as `expo-sqlite`. **Expo Go will not work.** Use a development build or another native build.

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

| Profile | Dev client | OTA updates | Use for |
|---------|------------|-------------|---------|
| `development` | ✓ | ✗ | Active development, Metro, fast refresh |
| `preview` | ✗ | ✓ | Internal testing, more production-like behavior |

Use `development` for normal coding. Use `preview` when you want behavior closer to a production build.

---

## Connecting the mobile app to the backend

The checked-in mobile app currently targets the Railway shared dev/QA backend by default:

```text
https://gym-app-mvp-production.up.railway.app
```

That default lives in `apps/mobile/app.json` under `expo.extra.EXPO_PUBLIC_API_BASE_URL`. This is intentional for the current phase because there is no separate production environment yet. It should not be treated as the final public-beta or production backend.

The mobile API URL precedence is:

1. Expo extra config: `API_BASE_URL` or `EXPO_PUBLIC_API_BASE_URL`
2. Environment variables: `EXPO_PUBLIC_API_BASE_URL` or `API_BASE_URL`, when Expo constants are unavailable
3. Fallback only: `http://localhost:8080`

Because the checked-in Expo extra is present, normal dev builds use Railway unless you deliberately override it.

### What works where

- **Railway shared dev/QA:** works from simulators, emulators, and physical devices without a local backend.
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

Before real production or public beta, split dev/QA/prod backend config so local development cannot silently hit a production backend.

---

## Tests

### Mobile

From `apps/mobile`:

```bash
npm test
npm run typecheck
npm run lint
```

These tests run in Node with SQLite and native modules mocked. They do not exercise real device behavior.

### Backend

From `apps/backend`:

```bash
./mvnw test
./mvnw verify
```

- `./mvnw test` runs the fast unit-style test phase and excludes `*IT.java` / `*IntegrationTest.java`
- `./mvnw verify` also runs integration tests such as `*IT.java` / `*IntegrationTest.java`
- On Windows, use `mvnw.cmd test` and `mvnw.cmd verify`

**Important:** `./mvnw test` does **not** run integration tests. Backend integration tests use Testcontainers, so `./mvnw verify` requires a running Docker daemon. Always run `./mvnw verify` before merging backend changes that touch sync, auth, claim flow, or persistence behavior.

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

The Debug screen is currently the main way to trigger sync during development.

---

## Sync in development

The sync system is implemented, but **sync is not automatically triggered** in the current MVP.

There is no background timer, app-focus listener, or launch-time sync hook wired into the normal app flow.

To sync in development:

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
5. Support/debug runbook is known to operators (Debug screen unlock, support bundle export).
6. `./mvnw verify` and mobile test/typecheck/lint are green on the release candidate.

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
