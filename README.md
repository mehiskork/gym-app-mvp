# Gym App MVP

Offline-first workout tracking app with a React Native mobile client and a Spring Boot backend.

The core idea is simple:

- the **mobile app works locally first**
- workout data is stored in **SQLite on the device**
- the backend is used for **device registration, sync, and claim/link flows**
- the app remains usable even when the backend is unavailable

---

## Project overview

This repo contains two main apps:

- **`apps/mobile`** — Expo + React Native mobile app
- **`apps/backend`** — Spring Boot + PostgreSQL API

The mobile app supports:

- workout plans
- active workout sessions
- set logging
- exercise swapping during a session
- automatic next-session prefills from recent performance
- rest timer, notifications, and haptics
- history and weekly stats
- theme color customization

The backend supports:

- device registration
- device-token auth
- cursor-based sync with acks/deltas
- claim/link flow
- validation, ownership checks, request IDs, and rate limiting

---

## Repo structure

```text
apps/
  mobile/   Expo + React Native app
  backend/  Spring Boot + PostgreSQL API
docs/       project documentation (being expanded)
```

---

## Mobile app (`apps/mobile`)

The mobile app is built with **Expo + React Native + TypeScript** and is designed as an **offline-first workout tracker**. Users can create workout plans, start training sessions, log sets, use rest timers, review history and weekly stats, change theme color, and run a claim/link flow. All app data is stored locally in **SQLite** first; backend sync is optional and happens separately when available.

### Mobile tech stack

- Expo / React Native / TypeScript
- React Navigation (stack + bottom tabs)
- `expo-sqlite` with in-app migrations and a repository layer
- Offline sync primitives: outbox, sync state, sync worker, delta applier
- Expo Notifications, Haptics, Keep Awake
- Jest, ESLint, strict TypeScript config

### Key mobile areas

- `apps/mobile/src/navigation/*` — app routing, tabs, route types/constants
- `apps/mobile/src/screens/*` — screen-level features (Today, Plans, History, Settings, Workout Session, Claim, Debug)
- `apps/mobile/src/ui/*` — reusable UI primitives and shared components
- `apps/mobile/src/theme/*` — tokens, theme provider, primary color options
- `apps/mobile/src/db/*` — SQLite access, migrations, repositories, seeds
- `apps/mobile/src/sync/*` — sync worker, constants, delta application
- `apps/mobile/src/api/*` — API config, request wrapper, auth headers, error handling
- `apps/mobile/src/features/*` — workout session and Today-specific components
- `apps/mobile/src/utils/*` — rest timer, notifications, formatting, logger, helpers

### Running the mobile app

```bash
cd apps/mobile
npm install
npm run start
```

Other useful commands:

```bash
npm run android
npm run ios
npm run web
npm test
npm run typecheck
npm run lint
```

### Important: Expo Go is **not** supported

This app uses native modules such as `expo-sqlite`, so it must run in a **development build** or another native build. Do not expect Expo Go to work.

Typical device build commands:

```bash
cd apps/mobile
npx eas build --profile development --platform android
npx eas build --profile preview --platform android
```

- `development` = dev client build for active development
- `preview` = internal build closer to production behavior

### Mobile configuration

The canonical mobile config is in:

- `apps/mobile/app.json`
- `apps/mobile/eas.json`

There are also root-level `app.json` and `eas.json` files in the repo. For mobile work, use the **`apps/mobile`** versions and run mobile-related commands from `apps/mobile` to avoid config confusion.

The mobile app resolves its backend base URL from Expo config / env and falls back to:

```text
http://localhost:8080
```

For real device testing, `localhost` usually points to the phone itself, not your computer. Override with:

- `EXPO_PUBLIC_API_BASE_URL`

### Mobile offline-first model

The app uses **local SQLite as the source of truth**.

- writes are stored locally first
- session data is immediately available offline
- sync uses an outbox model and runs separately when triggered
- the UI does not block on network availability

On startup, the app runs migrations, seeds curated exercises, and initializes app-level setup such as rest-timer notification channels.

### Current mobile capabilities

The mobile app already includes:

- workout planning and plan-day flows
- active workout session logging
- session-only **Swap exercise**
- next-session **prefill from previous same-plan-day performance**
- history and weekly stats
- theme / primary color selection
- rest timer, haptics, and notification settings
- claim/link flow
- offline-first sync plumbing

### Mobile sync in development

Sync infrastructure exists on the frontend, but in the current MVP it is **not automatically triggered on app launch, focus, or a timer**.

During development, sync is primarily triggered from the **Debug screen**.

### Debug screen

The Debug screen is hidden by default and is useful during development for sync and support/debug actions.

To unlock it:

- open **Settings**
- tap the version text **7 times quickly**

### Mobile gotchas

- Expo Go is not supported.
- Use `apps/mobile/app.json` and `apps/mobile/eas.json` as the main mobile config.
- If testing on a physical device, make sure `EXPO_PUBLIC_API_BASE_URL` points to a reachable backend host.
- Android notification channel behavior differs from foreground haptics.
- Sync currently requires an explicit/manual development flow rather than automatic triggers.

---

## Backend (`apps/backend`)

The backend is a **Spring Boot + PostgreSQL** service that supports the mobile app’s device registration, offline sync, and claim/link flows. It is a **sync server**, not the primary source of truth for the app UI — the mobile app works offline and stores data locally first, then exchanges changes with the backend when sync is triggered.

### Backend tech stack

- Java 21
- Spring Boot 4.0.2
- Maven
- PostgreSQL
- Flyway migrations
- Spring Security
- Testcontainers for integration tests
- Docker / Docker Compose for local development

### Key backend areas

- `apps/backend/src/main/java/com/gymapp/backend/controller/*` — REST endpoints
  - device registration
  - sync
  - claim flow
  - health
- `apps/backend/src/main/java/com/gymapp/backend/config/*` — security, auth filter, rate limiting, request IDs, logging, Jackson config
- `apps/backend/src/main/java/com/gymapp/backend/service/*` — sync logic, device registration, claim flow, sync entity rules
- `apps/backend/src/main/java/com/gymapp/backend/repository/*` — JDBC repositories for devices, claims, identity links, sync data
- `apps/backend/src/main/resources/db/migration/*` — Flyway schema migrations
- `apps/backend/src/test/java/com/gymapp/backend/*` — controller, service, repository, and integration tests

### Prerequisites

- Java 21
- Docker and Docker Compose

### Running the backend locally

From the repo root:

```bash
docker compose up --build
```

This starts:

- PostgreSQL
- backend on `http://localhost:8080`

Health check:

```bash
curl http://localhost:8080/health
```

Expected response:

```text
ok
```

### Alternative Maven workflow

You can also run the backend directly with Maven, but you still need a reachable PostgreSQL instance.

```bash
cd apps/backend
mvn -DskipTests package
mvn spring-boot:run
```

### Backend tests

```bash
cd apps/backend
mvn test
mvn verify
```

Important:

- `mvn test` runs **unit-style tests only**
- `mvn verify` runs **unit + integration tests**
- integration tests (`*IT.java`) use **Testcontainers**, so Docker is effectively required

### Backend configuration

Backend config lives in:

- `apps/backend/src/main/resources/application.yml`

Important defaults / overrides:

- `SPRING_DATASOURCE_URL`
- `SPRING_DATASOURCE_USERNAME`
- `SPRING_DATASOURCE_PASSWORD`
- `PORT` (default `8080`)

Local defaults point to a Postgres database named `gymapp`.

Flyway migrations run automatically on startup from:

- `apps/backend/src/main/resources/db/migration`

### API surface

Main backend endpoints:

- `GET /health` — liveness check
- `POST /device/register` — register device and issue device token
- `POST /sync` — submit ops / receive deltas
- `POST /claim/start` — start claim/link flow
- `POST /claim/confirm` — confirm claim flow

### Current backend capabilities

The backend already implements:

- device registration and token issuance
- device-token authentication for sync/claim-start
- cursor-based sync with:
  - ops
  - acknowledgements
  - deltas
  - `hasMore`
- idempotent op dedupe using an op ledger
- sync validation and ownership checks
- conflict handling and immutability protection for completed workout entities
- request ID propagation (`X-Request-Id`)
- rate limiting
- claim code generation and claim-linking logic

### Connecting the mobile app to the backend

The mobile app defaults to:

```text
http://localhost:8080
```

That works for some local simulator cases, but not for a physical phone unless the phone can reach your machine.

For physical-device testing, set the mobile app’s backend URL to your machine’s reachable IP address using:

- `EXPO_PUBLIC_API_BASE_URL`

### Backend gotchas

- **Docker is the main supported local path.** There is no documented lightweight local DB fallback.
- **Spring Boot 4 / Jackson 3:** JSON imports use `tools.jackson.*`, not `com.fasterxml.jackson.*`.
- **`/claim/confirm` is dev-oriented right now.** It depends on dev/test profile behavior or `claim.devUserHeaderEnabled=true`; otherwise it can return `501 NOT_IMPLEMENTED`.
- **`mvn test` does not run integration tests.** Use `mvn verify` before merging backend changes that touch sync, auth, or claim.
- **Device token lookup is currently O(n)** in application code (full-row scan + BCrypt match), which is acceptable for MVP scale but a known limitation.
- **Rate limiting is in-process only**, so it is not shared across multiple backend instances.

---

## Current project status

The project already has working implementations for:

- offline-first session logging
- session-only exercise swapping
- next-session prefill from prior same-plan-day performance
- custom theming / primary color selection
- history and stats
- stronger rest timer haptics / notifications
- custom destructive dialogs
- sync protocol safety improvements
- backend validation / ownership / idempotency protections


---

## Recommended workflow for development

### Mobile

- do mobile work from `apps/mobile`
- use dev builds for active development
- use preview builds for realistic device testing
- test offline-first behavior on a real phone

### Backend

- run with `docker compose up --build`
- use `mvn verify` for integration-sensitive changes
- treat sync/auth/claim changes as high-risk areas

---

## Known MVP limitations

- Sync is not automatically triggered on the frontend yet.
- Backend token lookup is not scalable yet.
- Backend rate limiting is single-instance only.
- Claim confirm is still dev-oriented.
- Documentation is still being added incrementally.

---


