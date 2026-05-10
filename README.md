# Gym App MVP

An offline-first workout tracker with:

- a React Native / Expo mobile app (`apps/mobile`)
- a Spring Boot 4.0.5 backend (`apps/backend`)

This repository has Firebase-backed Google account auth: account identity is canonical after login, guest/device identity is bootstrap-only, `/me` is account-JWT-only, `/sync` supports account JWT and true-guest device-token transport, and `/claim/confirm` derives account ownership from the verified Firebase principal.

---

## What is implemented

### Mobile (`apps/mobile`)

- offline-first SQLite local data model
- plan creation/editing and session generation
- in-session logging (sets/reps/weight/rest timer/notes)
- session-only exercise swap behavior
- plan-slot-based next-session prefill
- history and PR event UX
- Firebase Google Sign-In plus guest-to-account migration
- account/session lifecycle hardening (secure storage + reset flows)
- hidden debug/support surfaces for sync and diagnostics

### Backend (`apps/backend`)

- `POST /device/register` for bootstrap guest/device registration
- `POST /sync` with owner-scoped auth, op dedupe, acks, deltas, cursor paging
- `GET /me` account principal identity endpoint (JWT resource server)
- claim flow endpoints (`/claim/start`, `/claim/confirm`) for guest-to-account migration
- ownership enforcement, request IDs, rate limiting, and Flyway migrations

---

## Auth and ownership boundaries (current)

- **Canonical owner after login:** account principal (issuer + subject-derived external account id).
- **Guest/device identity:** bootstrap and pre-login transport context.
- **`/sync`:** accepts either account JWT or device bearer token; ownership is resolved server-side from principal, never client payload.
- **`/me`:** account JWT only.
- **`/claim/start`:** device-token only.
- **`/claim/confirm`:** Firebase account JWT only; target account owner is derived server-side from the verified account principal.

---

## Launch-readiness notes

- Core ownership/auth/sync foundations are in place and tested.
- Debug/support surfaces remain intentionally available for rollout support and incident triage.
- Firebase is auth-only; app data remains SQLite mobile source of truth synced through Spring Boot/PostgreSQL.
- Firebase mobile client config is tracked intentionally for the current private/dev phase; see `docs/firebase-client-config.md` for the restrictions and public-release policy.
- Local-first behavior is unchanged: local writes commit first; sync reconciles eventual server state.
- Mobile SQLite migrations have been squashed into a reset-only private-beta baseline. Existing internal/dev installs from before the squash must uninstall, clear app storage, or use destructive reset before testing this baseline.
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
- backend unit tests from `apps/backend`

Backend integration tests run separately with Docker/Testcontainers on `main` pushes or manually. Local equivalents are documented in `docs/local-development.md`.

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
- Railway backend deployment: `docs/railway-deployment.md`
- Public repository safety checklist: `docs/public-repo-safety.md`
