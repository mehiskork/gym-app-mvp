# Gym App MVP

An offline-first workout tracker with a React Native mobile app and a Spring Boot backend.

## Why I built it

I started this project because tracking workout progress in Google Sheets was inconvenient. I wanted a faster, more structured way to log workouts, review progress, and use the app reliably during training.

I built the MVP around my own training workflow and preferences first, focusing on solving real friction from actual use rather than trying to copy an existing fitness app feature-for-feature.

---

## What this project demonstrates

This project demonstrates:

- full-stack product development across mobile and backend
- offline-first local data design with SQLite
- custom sync protocol design with outbox, acks, deltas, and cursor paging
- product/UX iteration based on real usage and field testing
- automated testing across both mobile and backend

---

## Stack

| Area | Technology |
|---|---|
| **Mobile** | Expo, React Native, TypeScript, React Navigation, `expo-sqlite` |
| **Backend** | Java 21, Spring Boot 4, Spring Security, PostgreSQL, Flyway |
| **Testing** | Jest, JUnit, Testcontainers |
| **Infra** | Docker Compose, EAS Build |

---

## What is implemented today

### Mobile app (`apps/mobile`)

- exercise bank with built-in and custom exercises
- workout plan/template creation with multiple sessions
- editing, renaming, and organizing plan sessions and exercises
- active workout logging with sets, reps, weight, rest timer, haptics, keep-awake, and notes
- session-only exercise swap during workouts
- automatic next-session prefill from recent completed same-plan-day performance
- history, session detail, and weekly stats
- personal-record detection on completed sessions
- configurable primary theme color
- hidden debug tools for sync controls and support-bundle export

### Backend API (`apps/backend`)

- `POST /device/register` for device identity bootstrap
- bearer device-token authentication for protected endpoints
- `POST /sync` with op deduplication, ack responses, delta pagination, cursor progression, and `hasMore`
- claim flow endpoints (`/claim/start`, `/claim/confirm`) with guarded dev-oriented confirm behavior
- rate limiting, request IDs, ownership validation, and Flyway-managed schema

---

## What makes it technically interesting

### Local-first write model

User actions are committed locally first. Domain writes and outbox intent are recorded together, so workout logging does not depend on network success.

### Custom sync protocol

The sync layer is purpose-built rather than library-driven:

- outbox operations with explicit `opId`
- per-op ack semantics (`applied`, `noop`, `rejected`)
- cursor-based delta streaming
- `hasMore` continuation paging
- stale `in_flight` repair
- retry/backoff behavior
- single-flight sync guard on the client

### Conflict-aware backend model

The backend is designed as a sync service, not as a traditional CRUD mirror of the mobile schema. It stores canonical sync state in generalized tables such as:

- `op_ledger`
- `entity_state`
- `change_log`

That keeps conflict resolution and delta delivery decoupled from the UI’s local table layout.

### Explicit conflict rules

Conflict handling is implemented and documented rather than implicit. The backend enforces deterministic resolution rules and immutability constraints for completed workout entities, while the client applies deltas with ordering, staleness checks, and local guards.

### Real test coverage

This project includes meaningful automated tests across both apps:

- mobile tests around repositories, sync worker behavior, UI logic, and session flows
- backend integration tests with Testcontainers against real PostgreSQL
- coverage of sync invariants, auth, validation, rate limiting, and claim-flow paths

---

## Product and UX decisions that matter

This is not just a sync engine with screens on top. The repo also captures product rules and workflow behavior that came from real usage and iteration, for example:

- only one in-progress session at a time
- session-only swap behavior that preserves completed work
- history shows performed work rather than planned-but-skipped exercises
- prefill is based on planned slot identity, not just exercise name
- keyboard and modal behavior were explicitly polished for in-gym use
- theme color personalization is allowed, while semantic colors stay stable (for example PR badges remain gold and destructive actions remain red)

---

## Next planned steps

## Next planned steps

- continue real-world gym testing and fix friction found through use
- prepare the project for Google Play and App Store release
- add a CI/CD pipeline to automate backend tests, mobile type checks, and release validation
- improve internal testing, store assets, and submission workflow
- keep polishing workout planning, session flow, and exercise management

---

## Repository structure

```text
apps/
  mobile/          Expo + React Native app
    src/
      db/          SQLite repositories, migrations, outbox
      sync/        Sync worker, delta applier
      screens/     Screen-level features
      ui/          Shared components
      features/    Workout-session and Today-specific logic

  backend/         Spring Boot + PostgreSQL API
    src/
      controller/  REST endpoints
      service/     Sync, claim flow, device registration
      repository/  JDBC persistence
      config/      Auth filter, rate limiting, request IDs, security
      resources/db/migration/
                   Flyway migrations

docs/
  architecture.md
  sync-protocol.md
  conflicts.md
  product-rules.md
  local-development.md



