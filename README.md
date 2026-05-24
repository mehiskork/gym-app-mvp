# TrainFrame

An offline-first workout tracker with:

- an Expo React Native / TypeScript mobile app with SQLite as the runtime source of truth (`apps/mobile`)
- a Spring Boot 4.0.5 / Java / PostgreSQL / Flyway backend (`apps/backend`)

This repository has Firebase-backed Google account auth: account identity is canonical after login, guest/device identity is bootstrap-only, `/me` is account-JWT-only, `/sync` supports account JWT and true-guest device-token transport, and `/claim/confirm` derives account ownership from the verified Firebase principal.

---

## What is implemented

### Mobile (`apps/mobile`)

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

### Backend (`apps/backend`)

- `POST /device/register` for bootstrap guest/device registration
- `POST /sync` with owner-scoped auth, op dedupe, acks, deltas, cursor paging
- `GET /me` account principal identity endpoint (JWT resource server)
- `DELETE /me` account-JWT-only account deletion
- claim flow endpoints (`/claim/start`, `/claim/confirm`) for guest-to-account migration
- ownership enforcement, request IDs, rate limiting, and Flyway migrations
- `/health` liveness and `/ready` DB/Flyway/schema readiness checks

---

## Auth and ownership boundaries (current)

- **Canonical owner after login:** account principal (issuer + subject-derived external account id).
- **Guest/device identity:** bootstrap and pre-login transport context.
- **`/sync`:** accepts either account JWT or device bearer token; ownership is resolved server-side from principal, never client payload.
- **`/me`:** account JWT only.
- **`DELETE /me`:** account JWT only.
- **`/claim/start`:** device-token only.
- **`/claim/confirm`:** Firebase account JWT only; target account owner is derived server-side from the verified account principal.
- **Guest -> Google merge:** signed-out guest data is intentionally merged into whichever Google account the user chooses. A direct Account A -> Account B switch on the same local install remains destructive/reset-based.
- **No client-selected ownership:** backend sync, claim, and deletion paths derive ownership from the authenticated principal, not client-sent owner/user ids.

---

## Launch-readiness notes

- Core ownership/auth/sync foundations are in place and tested.
- Debug/support surfaces remain intentionally available for rollout support and incident triage.
- Firebase is auth-only; app data remains SQLite mobile source of truth synced through Spring Boot/PostgreSQL.
- Firebase mobile client config is tracked intentionally for the current private/dev phase; see `docs/firebase-client-config.md` for the restrictions and public-release policy.
- Prod-like Railway deployments must configure `TRAINFRAME_SUPPORT_EMAIL` to a real support address; placeholder or missing values are rejected by startup validation.
- Local-first behavior is unchanged: local writes commit first; sync reconciles eventual server state.
- Mobile SQLite migrations have been squashed into a reset-only private-beta baseline. Existing internal/dev installs from before the squash must uninstall, clear app storage, or use destructive reset before testing this baseline.
- Backend Flyway migrations are currently `V1__baseline_private_beta.sql`, `V2__account_deletion_tombstone.sql`, and `V3__account_identity_incarnation.sql`. Spring Boot 4 uses the explicit `spring-boot-starter-flyway` dependency in this repo.
- The checked-in mobile preview config targets the Railway shared dev/QA backend by default (`https://gym-app-mvp-production.up.railway.app`). This URL is not private and must not be treated as a security boundary. It is not the final production environment. Production builds must set `EXPO_PUBLIC_APP_ENV=production` and a real production `EXPO_PUBLIC_API_BASE_URL`; the app rejects the shared dev/QA URL in production mode.
- Android release build profiles are documented in `docs/android-release.md`; the app displays as `TrainFrame`, the Expo slug intentionally remains `mobile`, and the Android package is `com.mehka.gymappmvp`.
- PR events are local-derived cache data. Workout history is synced; PR rows are recomputed locally and are not synced inbound or outbound.
- Public repository readiness checklist: `docs/public-repo-safety.md`

---

## Stack

| Area | Technology |
|---|---|
| Mobile | Expo, React Native, TypeScript, React Navigation, `expo-sqlite` |
| Backend | Java 25, Spring Boot 4.0.5, Spring Security, PostgreSQL, Flyway |
| Testing | Jest, JUnit, Testcontainers |
| Infra | Docker Compose, EAS Build |

---

## CI

GitHub Actions fast gates run on pull requests and pushes:

- mobile lint, typecheck, and Jest from `apps/mobile`
- backend unit tests from `apps/backend` with Java 25

Backend integration tests run separately with Java 25 and Docker/Testcontainers. They run `./mvnw verify` on backend-relevant pull requests, on `main` pushes, or manually. Local equivalents are documented in `docs/local-development.md`.

---

## Repository structure

```text
apps/
  mobile/          Expo + React Native app
  backend/         Spring Boot + PostgreSQL API
docs/
  architecture.md
  sync-protocol.md
  conflicts.md
  firebase-client-config.md
  product-rules.md
  android-release.md
  android-tester-runbook.md
  account-deletion-design.md
  ops-runbook.md
  migration-rollback.md
  local-development.md
  railway-deployment.md
  public-repo-safety.md
  account-ownership-decision.md
```

---

## Start here

- Local setup and runbook: `docs/local-development.md`
- Architecture overview: `docs/architecture.md`
- Sync protocol contract: `docs/sync-protocol.md`
- Conflict policy: `docs/conflicts.md`
- Product behavior invariants: `docs/product-rules.md`
- Android release baseline: `docs/android-release.md`
- Android tester and Play readiness runbook: `docs/android-tester-runbook.md`
- Account deletion design: `docs/account-deletion-design.md`
- Production incident runbook: `docs/ops-runbook.md`
- Flyway/Postgres migration rollback: `docs/migration-rollback.md`
- Railway backend deployment: `docs/railway-deployment.md`
- Public repository safety checklist: `docs/public-repo-safety.md`
