# Gym App MVP

An offline-first workout tracker with:

- a React Native / Expo mobile app (`apps/mobile`)
- a Spring Boot 4.0.5 backend (`apps/backend`)

This repository has a generic account-JWT foundation: account identity is canonical after login, guest/device identity is bootstrap-only, `/me` is account-JWT-only, and `/sync` supports both account JWT and device-token transport. Firebase-specific Google Sign-In and real Firebase ID-token validation are not completed yet.

---

## What is implemented

### Mobile (`apps/mobile`)

- offline-first SQLite local data model
- plan creation/editing and session generation
- in-session logging (sets/reps/weight/rest timer/notes)
- session-only exercise swap behavior
- plan-slot-based next-session prefill
- history and PR event UX
- account/session lifecycle hardening (secure storage + reset flows)
- hidden debug/support surfaces for sync and diagnostics

### Backend (`apps/backend`)

- `POST /device/register` for bootstrap guest/device registration
- `POST /sync` with owner-scoped auth, op dedupe, acks, deltas, cursor paging
- `GET /me` account principal identity endpoint (JWT resource server)
- claim flow endpoints (`/claim/start`, `/claim/confirm`) with explicit dev-only seam for confirm
- ownership enforcement, request IDs, rate limiting, and Flyway migrations

---

## Auth and ownership boundaries (current)

- **Canonical owner after login:** account principal (issuer + subject-derived external account id).
- **Guest/device identity:** bootstrap and pre-login transport context.
- **`/sync`:** accepts either account JWT or device bearer token; ownership is resolved server-side from principal, never client payload.
- **`/me`:** account JWT only.
- **`/claim/start`:** device-token only.
- **`/claim/confirm`:** dev/test seam only via `X-User-Id` header when explicitly enabled outside prod-like profiles.

---

## Launch-readiness notes

- Core ownership/auth/sync foundations are in place and tested.
- Debug/support surfaces remain intentionally available for rollout support and incident triage.
- Dev-only claim-confirm behavior is fenced by profile/config guardrails and should remain disabled in production-like environments.
- Local-first behavior is unchanged: local writes commit first; sync reconciles eventual server state.

---

## Stack

| Area | Technology |
|---|---|
| Mobile | Expo, React Native, TypeScript, React Navigation, `expo-sqlite` |
| Backend | Java 21, Spring Boot 4.0.5, Spring Security, PostgreSQL, Flyway |
| Testing | Jest, JUnit, Testcontainers |
| Infra | Docker Compose, EAS Build |

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
  product-rules.md
  local-development.md
  railway-deployment.md
  account-ownership-decision.md
```

---

## Start here

- Local setup and runbook: `docs/local-development.md`
- Architecture overview: `docs/architecture.md`
- Sync protocol contract: `docs/sync-protocol.md`
- Conflict policy: `docs/conflicts.md`
- Product behavior invariants: `docs/product-rules.md`
- Railway backend deployment: `docs/railway-deployment.md`
