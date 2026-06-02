# TrainFrame

TrainFrame is my first pet project / portfolio app. It is currently in Google Play internal testing.

It is an offline-first workout tracker with:

- an Expo React Native / TypeScript mobile app with SQLite as the runtime source of truth (`apps/mobile`)
- a Spring Boot 4.0.5 / Java / PostgreSQL / Flyway backend (`apps/backend`)

Firebase-backed Google Sign-In is implemented. Signed-in account identity is canonical after login, while guest/device identity is used for bootstrap and true guest-mode sync.

## Current status

- Android app is in Google Play internal testing.
- First production AAB has been uploaded.
- Play App Signing SHA-1/SHA-256 has been added to Firebase.
- Play-installed Google Sign-In works.
- The repo is being prepared for public portfolio visibility.

## Core features

- offline-first SQLite local data model
- user-facing Plan -> Session -> Exercises hierarchy
- plan creation/editing, including zero-session plans and session deletion
- Quick Workout for ad-hoc sessions and Planned Workout routing for plan-based sessions
- in-session logging (sets/reps/weight/rest timer/notes)
- session-only exercise swap behavior
- plan-slot-based next-session prefill
- Templates browse/preview/import flow
- history and PR event UX
- Firebase Google Sign-In plus guest-to-account migration
- account/session lifecycle hardening (secure storage + reset flows)
- unfinished workout reminders gated by both TrainFrame setting and OS notification permission
- hidden debug/support surfaces for sync and diagnostics

## Architecture

TrainFrame is local-first:

- Mobile screens read and write SQLite first.
- Local writes enqueue outbox operations in the same transaction.
- `/sync` pushes outbox ops and pulls backend deltas.
- The backend is the cross-device conflict arbiter, auth boundary, and account migration/deletion coordinator.
- Firebase is used for authentication only; app data is stored locally in SQLite and synced through Spring Boot/PostgreSQL.

Important backend routes:

- `POST /device/register` for bootstrap guest/device registration
- `POST /sync` with owner-scoped auth, op dedupe, acks, deltas, and cursor paging
- `GET /me` account principal identity endpoint
- `DELETE /me` account-JWT-only account deletion
- `POST /claim/start` and `POST /claim/confirm` for guest-to-account migration
- `/health` liveness and `/ready` database/Flyway/schema readiness

Ownership is always resolved server-side from the authenticated principal, not from client-sent owner/user ids.

## Stack

| Area    | Technology                                                      |
| ------- | --------------------------------------------------------------- |
| Mobile  | Expo, React Native, TypeScript, React Navigation, `expo-sqlite` |
| Backend | Java 25, Spring Boot 4.0.5, Spring Security, PostgreSQL, Flyway |
| Testing | Jest, JUnit, Testcontainers                                     |
| Infra   | Docker Compose, EAS Build                                       |

---

## Run locally

Start the backend and Postgres from the repo root:

```bash
docker compose up --build
```

Install and start the mobile app from `apps/mobile`:

```bash
npm install
npm run start
```

Expo Go is not supported because the app uses native modules such as `expo-sqlite`; use a development build. Full setup, device networking, and troubleshooting notes are in [`docs/local-development.md`](docs/local-development.md).

## Tests and CI

GitHub Actions fast gates run on pull requests and pushes:

- mobile lint, typecheck, and Jest from `apps/mobile`
- backend unit tests from `apps/backend` with Java 25

Backend integration tests run separately with Java 25 and Docker/Testcontainers. They run `./mvnw verify` on backend-relevant pull requests, on `main` pushes, or manually. Local equivalents are documented in `docs/local-development.md`.

## Docs

```text
apps/
  mobile/          Expo + React Native app
  backend/         Spring Boot + PostgreSQL API
docs/
  architecture.md
  sync-protocol.md
  conflicts.md
  product-rules.md
  local-development.md
  android-release.md
  firebase-client-config.md
  public-repo-safety.md
  internal/        operational runbooks kept out of the public quick path
  archive/         historical decision records
```

Public docs:

- Local setup: [`docs/local-development.md`](docs/local-development.md)
- Architecture overview: [`docs/architecture.md`](docs/architecture.md)
- Sync protocol: [`docs/sync-protocol.md`](docs/sync-protocol.md)
- Conflict and immutability rules: [`docs/conflicts.md`](docs/conflicts.md)
- Product behavior invariants: [`docs/product-rules.md`](docs/product-rules.md)
- Android release baseline: [`docs/android-release.md`](docs/android-release.md)
- Firebase client config policy: [`docs/firebase-client-config.md`](docs/firebase-client-config.md)
- Public repo safety checklist: [`docs/public-repo-safety.md`](docs/public-repo-safety.md)

Operational/internal notes:

- Android tester runbook: [`docs/internal/android-tester-runbook.md`](docs/internal/android-tester-runbook.md)
- Railway deployment: [`docs/internal/railway-deployment.md`](docs/internal/railway-deployment.md)
- Production incident runbook: [`docs/internal/ops-runbook.md`](docs/internal/ops-runbook.md)
- Migration rollback: [`docs/internal/migration-rollback.md`](docs/internal/migration-rollback.md)
- Account deletion design: [`docs/internal/account-deletion-design.md`](docs/internal/account-deletion-design.md)
- Historical ownership ADR: [`docs/archive/account-ownership-decision.md`](docs/archive/account-ownership-decision.md)

---

## License / Usage

Copyright © 2026 Mehis Kork. All rights reserved.

This repository is public for portfolio, learning, and review purposes. You are welcome to fork the repository, explore the code, and use it for personal learning.

Commercial use, redistribution, publishing modified versions, or using the source code in other projects requires written permission.
