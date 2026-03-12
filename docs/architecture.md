# Architecture

This document describes the **current implementation architecture** of the Gym App MVP.

It focuses on system shape, data flow, layering, and technical boundaries. It does **not** try to fully document setup, product rules, or the full sync wire protocol.

For local setup, see [`docs/local-development.md`](./local-development.md). For conflict-resolution details, see [`docs/conflicts.md`](./conflicts.md).

---

## Mental model in one paragraph

The app is **offline-first**. On the mobile side, **SQLite is the authoritative read source for the UI on that device**: screens read local data, and user actions write local data first. Those writes also enqueue sync intent into an outbox in the same local transaction. The backend is **not** the primary runtime database for the app UI; it is the **authoritative conflict arbiter across devices** and the source of delta streams used to reconcile devices over time.

A useful shorthand is:

- **read path:** UI reads from SQLite
- **write path:** user action -> SQLite -> outbox
- **sync path:** outbox -> `/sync` -> backend conflict resolution -> deltas -> SQLite

If you keep that direction in mind, most of the codebase becomes much easier to understand.

---

## System topology

The repo contains two main apps:

- **`apps/mobile`** — Expo + React Native app written in TypeScript
- **`apps/backend`** — Spring Boot 4.0.2 service backed by PostgreSQL and Flyway

At runtime, the system looks like this:

```text
User
  |
  v
Mobile UI (React Native screens/components)
  |
  v
SQLite on device  <---->  Outbox + sync state
  |                         |
  |                         v
  |                      /sync HTTP
  |                         |
  v                         v
Local reads            Spring Boot backend
                            |
                            v
                Postgres sync store (op_ledger, entity_state, change_log, claim tables)
```

The mobile app remains usable when the backend is unavailable. The backend exists for:

- device registration
- device-token auth
- sync op ingestion
- conflict resolution
- delta delivery
- claim/link flows

The backend is **not** modeled as a traditional domain database with `workout_sessions` and `workout_sets` tables. Instead, sync state is stored in generalized tables such as `entity_state`, `change_log`, and `op_ledger`.

---

## Repo layout

```text
apps/
  mobile/      Expo + React Native app
  backend/     Spring Boot + PostgreSQL API
docs/          Project documentation
```

Important entry points:

- Mobile startup: `apps/mobile/App.tsx`
- Mobile navigation: `apps/mobile/src/navigation/*`
- Mobile local data layer: `apps/mobile/src/db/*`
- Mobile sync layer: `apps/mobile/src/sync/*`
- Backend HTTP layer: `apps/backend/src/main/java/com/gymapp/backend/controller/*`
- Backend business logic: `apps/backend/src/main/java/com/gymapp/backend/service/*`
- Backend persistence: `apps/backend/src/main/java/com/gymapp/backend/repository/*`

---

## Mobile architecture

### Runtime composition

`apps/mobile/App.tsx` is the runtime entry point. On startup, it composes the app shell and performs app-level initialization such as:

- running SQLite migrations
- seeding curated exercises
- repairing stale in-flight sync state
- bootstrapping notification channels / app startup helpers
- mounting providers and navigation

The main high-level composition is:

- `ThemeProvider`
- `RootNavigator`
- screen tree and shared UI components

### Layering

The mobile app is structured around a few practical layers:

- **UI / navigation layer**
  - `src/screens/*`
  - `src/ui/*`
  - `src/navigation/*`
- **Theme layer**
  - `src/theme/*`
- **Local data / repository layer**
  - `src/db/*Repo.ts`
  - `src/db/db.ts`
  - `src/db/tx.ts`
  - `src/db/migrations/*`
- **Sync orchestration layer**
  - `src/sync/syncWorker.ts`
  - `src/sync/applyDeltas.ts`
- **HTTP wrapper layer**
  - `src/api/*`

A useful rule of thumb: **screens do not own business persistence logic**. They call repositories and helper modules rather than issuing raw SQL or hand-building sync payloads.

### SQLite as the local source of truth

SQLite is the data source the UI reads from. That means:

- screen rendering is driven by local tables
- writes appear locally first
- network unavailability does not block local workout logging

This does **not** mean the client always wins conflicts across devices. Across devices, the backend is the conflict arbiter. The most accurate phrasing is:

- **SQLite is the authoritative read source for the UI on this device**
- **the backend is the authoritative conflict arbiter across devices**

### Local schema groups

The mobile SQLite schema is easiest to understand in five groups:

1. **Exercise catalog**
   - curated and custom exercises
2. **Programs / plans**
   - `program`, `program_day`, `program_day_exercise`, `planned_set`
3. **Workout sessions**
   - `workout_session`, `workout_session_exercise`, `workout_set`
4. **Sync infrastructure**
   - `outbox_op`, `sync_state`, `sync_run`
5. **App metadata / settings**
   - `app_meta`

The database is opened through Expo SQLite in `src/db/db.ts`, with migrations applied at startup via `src/db/migrate.ts`.

### Migration model

Migrations are versioned and recorded in `schema_migrations`. They run during app startup before normal app usage.

Important implication: schema evolution is code-driven and sequential. If you change table shape, you must think about all three of these together:

- fresh install bootstrap
- upgrade path from older installs
- sync column handling in `applyDeltas.ts`

### Repository + transaction model

Repositories use shared DB helpers from `src/db/db.ts`. Multi-step operations use `inTransaction()` from `src/db/tx.ts`.

A non-obvious detail: transaction nesting is handled with a **depth counter**, not SQLite savepoints. If an outer transaction already exists, an inner `inTransaction()` joins it silently. An error inside the inner operation rolls back the full outer transaction.

That matters when reading repository code: nested transaction calls are not independent units.

---

## Local write path and persistence flow

The core local write path is:

```text
User action
  -> repository writes domain rows in SQLite
  -> same transaction enqueues outbox op(s)
  -> transaction commits
  -> UI reads updated local state immediately
```

This is the main offline-first invariant: **no domain write depends on network success**.

The outbox exists because network operations can fail. If the backend is unreachable:

- the domain write still succeeds locally
- the outbox entry remains pending or retries later
- the UI keeps working from SQLite

Outbox enqueue and domain mutation are intentionally committed together so the app does not end up in a state where local data changed but sync intent was lost.

---

## Workout and session architecture

This section explains how workout-session-related behavior is structured technically. Detailed product rules belong in `docs/product-rules.md`.

### Session generation

The main entry point is `createSessionFromPlanDay()` in `apps/mobile/src/db/workoutSessionRepo.ts`.

At a high level it does this:

1. checks whether another session is already in progress
2. snapshots plan-day metadata into a new `workout_session`
3. materializes `workout_session_exercise` rows from planned exercises
4. seeds `workout_set` rows for each session exercise
5. enqueues outbox snapshots for the created rows

The important architectural point is that **session generation is snapshot-based**. A session is created from plan data at that moment, then stored as its own local session records.

### Next-session prefill

Historical prefill is implemented during session generation, not as a later UI overlay.

The session seeding code looks up recent completed sets for the same planned exercise identity and uses those values when creating new `workout_set` rows. The linkage relies on `source_program_day_exercise_id` stored on `workout_session_exercise`.

Architecturally, that means prefill is part of the **data materialization step** for a new session, not a runtime rendering concern.

### Swap exercise

Exercise swapping is implemented in `swapWorkoutSessionExercise()` in `apps/mobile/src/db/workoutLoggerRepo.ts`.

The architecture goal is to preserve already performed session data while still allowing a replacement exercise to appear in the current session.

The function branches based on current session state:

- update-in-place path when no completed sets exist
- insert-new-row path when completed data already exists

In the insert path, positions are shifted safely inside a transaction before the new row is added.

Architecturally, swap is a **session mutation**, not a plan mutation. The repository code operates on `workout_session_exercise` and `workout_set`, not on plan tables.

---

## Sync architecture

### What “sync” means in this repo

The word “sync” can mean three different things in the codebase:

- the overall eventual-consistency feature
- a single local sync cycle via `syncNow()`
- the backend `/sync` endpoint

When writing code or docs, be precise about which one you mean.

### How sync is triggered today

The sync system exists, but it is **not automatically triggered** by app launch, focus, or a background timer in the current MVP.

In development, sync is primarily triggered from the hidden Debug screen. See `docs/local-development.md` for the operational details.

### Core sync loop

The main mobile orchestrator is `apps/mobile/src/sync/syncWorker.ts`.

The sync cycle is:

```text
1. local writes exist in SQLite and pending outbox rows exist
2. syncNow() starts (or joins an existing in-flight sync)
3. pending ops are claimed for sending
4. client POSTs ops + cursor to /sync
5. backend validates, dedupes, resolves conflicts, stores canonical state, returns acks + deltas + cursor + hasMore
6. client writes ack effects, applies deltas, and updates sync_state in one local transaction
7. UI continues to read from SQLite
```

A few important architectural details:

- sync uses a **single-flight guard** (`inFlightSync` promise), so concurrent callers share one sync run rather than issuing parallel requests
- continuation paging is driven by `hasMore`
- stale in-flight operations can be repaired before normal flow continues
- on 401, the client clears its local device token so registration/auth can recover

### Outbox model

The outbox table (`outbox_op`) tracks ops and retry metadata. The important distinction is:

- local row `id` is a SQLite row identifier
- `op_id` is the protocol-level identifier sent to the server and acknowledged back

Do not confuse those two when debugging retries or acknowledgements.

### Acks and deltas

A `/sync` response contains both:

- **acks** — what happened to the submitted ops
- **deltas** — what rows the client should apply locally

An important subtlety: “acked” does **not** necessarily mean “the server accepted the local version as the winner.” The backend can acknowledge an op as processed even if it became a noop or was rejected by business rules. The next delta application is what corrects local state toward the backend’s canonical result.

### Atomic delta application

After a successful `/sync` response, the mobile app applies:

- ack effects
- delta effects
- sync cursor / sync state updates

inside the **same local transaction**.

If delta application fails, the whole post-response write block rolls back. That atomicity is an important invariant.

### Delta application strategy

`apps/mobile/src/sync/applyDeltas.ts` maps sync entities to SQLite tables using explicit table configs.

Important architectural consequences:

- column lists are allowlists; if a column is omitted, incoming deltas do not write it
- delta ordering is dependency-aware and may require retry passes for foreign-key-safe application
- stale incoming rows can be skipped by version / timestamp comparison
- there is a special guard for local in-progress session conflicts
- deletes are soft when a table uses `deleted_at`, otherwise hard deletes are used

For the exact conflict rules and wire semantics, see `docs/conflicts.md` and the future `docs/sync-protocol.md`.

---

## Backend architecture

### Role and non-role

The backend is a sync server, auth boundary, and claim-flow coordinator.

It is **not** a conventional domain database that mobile screens query directly. A developer looking for first-class `workout_sessions` tables in Postgres will not find them. Instead, the backend stores canonical sync state in generalized tables that support conflict resolution and delta delivery.

### Layering

The backend follows a straightforward split:

- **controllers** — HTTP endpoints
- **services** — orchestration and business rules
- **repositories** — JDBC persistence against PostgreSQL
- **Flyway** — schema migration management

Main source areas:

- controllers: `apps/backend/src/main/java/com/gymapp/backend/controller/*`
- services: `apps/backend/src/main/java/com/gymapp/backend/service/*`
- repositories: `apps/backend/src/main/java/com/gymapp/backend/repository/*`
- config/security: `apps/backend/src/main/java/com/gymapp/backend/config/*`
- migrations: `apps/backend/src/main/resources/db/migration/*`

### Backend data model

The core sync storage model is built around three concepts:

- **`op_ledger`** — dedupe ledger for submitted ops
- **`entity_state`** — latest winning state per entity
- **`change_log`** — append-only delta stream used for cursor-based sync

A helpful mental model is:

- `op_ledger` answers: “have we already processed this op?”
- `entity_state` answers: “what is the current winning row state?”
- `change_log` answers: “what changes happened after cursor X?”

This is why the backend looks more like a sync engine than a CRUD API.

### Cursor model

The sync cursor is based on `change_log.change_id`, not on timestamps.

The client sends its last-known cursor. The backend returns later changes up to a limit, plus `hasMore` when continuation paging is needed.

### Security and auth pipeline

The backend is stateless under Spring Security.

The main authentication path for sync uses device-token bearer auth. Device registration issues the data needed for subsequent authenticated sync requests.

At a high level, the identity/auth pieces are:

- `device_id`
- `device_secret`
- `device_token`
- `guest_user_id`

The important ownership key for synchronized data is **`guest_user_id`**, not the device itself.

### Sync internals

`SyncService` and `SyncRepository` are responsible for:

- validating ops
- enforcing ownership
- deduping through `op_ledger`
- resolving conflicts
- writing `entity_state`
- appending `change_log`
- serving cursor-based deltas

The backend uses last-write-wins logic plus additional guards and tie-breakers. Completed workout entities have immutability protection. Deleted rows are treated as tombstones rather than temporary UI flags.

Keep the full rule set in `docs/conflicts.md`, not in this document.

### Known backend tradeoffs

A few current MVP choices are intentional and worth knowing up front:

- device token lookup is currently O(n) in application code before BCrypt verification
- rate limiting is in-process only, not shared across multiple backend instances
- `/claim/confirm` is still dev-oriented in its current form

---

## Identity and claim architecture

### Identity lifecycle

There are three useful states to understand:

1. **pre-registration**
   - device is local-only
   - no sync identity has been assigned yet
2. **registered device**
   - backend has issued device auth data and a `guest_user_id`
   - sync is available
3. **claimed identity**
   - guest identity is linked to a real account identity on the backend

This lifecycle is easy to misunderstand if you assume the device itself is the user namespace. It is not. The important backend ownership namespace is the guest user identity, later linked through claim flow.

### Mobile claim flow

On mobile, the claim flow lives in screens such as:

- `ClaimStartScreen`
- `ClaimConfirmScreen`

During claim flow, sync is paused and later resumed. The flow starts a claim, then confirms it with the backend, and finally updates local claimed-state metadata.

### Backend claim flow

On the backend, claim flow logic lives in `ClaimService` and related repositories.

At a high level it does this:

- generates and stores pending claim codes
- validates confirmation attempts
- links guest identity to user identity
- prevents conflicting claims
- marks claims as claimed or expired as appropriate

The exact user-facing claim rules belong in product documentation rather than architecture documentation.

---

## Theme and UI architecture

Theme behavior is implemented as a runtime theme system rather than scattered local style overrides.

Core pieces:

- `src/theme/tokens.ts` — theme tokens and shared design constants
- `src/theme/primaryColors.ts` — finite primary color option set and derived values
- `src/theme/theme.tsx` — theme provider and hook usage
- `settingsRepo` / `app_meta` — persistence of selected theme settings

`ThemeProvider` exposes themed values to screens and shared UI components through context. Navigation and reusable UI primitives consume these values at runtime.

This area is architecture-relevant because theme state is stored and propagated as app-level configuration rather than ad hoc screen state.

---

## Technical boundaries and invariants

These are the most important architectural boundaries to preserve:

### 1. Local-first writes

No core workout write should depend on network success. Local SQLite mutation happens first.

### 2. Outbox and domain writes move together

When a repository mutates syncable domain state, it should enqueue the corresponding outbox operation in the same transaction.

### 3. UI reads local state

Screens should render from SQLite-backed repository data, not from backend response bodies.

### 4. Sync is eventual consistency, not request-response CRUD

The backend receives ops, applies conflict logic, and later sends deltas back. The local state the user sees may temporarily differ from the backend’s eventual winning state.

### 5. Backend is the multi-device conflict arbiter

The backend decides canonical cross-device outcomes. SQLite remains the local read source for a device UI.

### 6. Deleted rows are tombstones

`deleted_at` is both a local soft-delete signal and a sync tombstone that prevents resurrection.

### 7. Completed workout entities have server-side immutability protection

The client can make local edits that later get rejected by the backend. If you build features around completed sessions or sets, keep that asymmetry in mind.

### 8. Sync post-processing is atomic

Acks, delta application, and sync-state updates are written together after a successful `/sync` response.

### 9. `applyDeltas.ts` is a schema boundary

If you add a sync-relevant column to SQLite, you must also think about how it is mapped in delta application.

### 10. Transaction nesting is not savepoint-based

Nested `inTransaction()` calls join the same transaction boundary.

---

## Known gaps and intentional tradeoffs

The current implementation has a few important limitations that are useful to know while reading the architecture:

- sync is not auto-triggered in the current MVP
- `last_modified_by_device_id` exists in conflict logic but is not currently populated by mobile write paths
- device token lookup is not yet optimized for large scale
- rate limiting is single-process only
- claim confirm remains partially dev-oriented

These are known tradeoffs, not necessarily immediate bugs.

---

## Where to look next

- [`docs/local-development.md`](./local-development.md) — how to run backend + mobile locally
- [`docs/conflicts.md`](./conflicts.md) — detailed conflict rules and tie-breakers
- `apps/mobile/src/db/workoutSessionRepo.ts` — session generation and prefill
- `apps/mobile/src/db/workoutLoggerRepo.ts` — set logging and swap behavior
- `apps/mobile/src/sync/syncWorker.ts` — sync orchestration
- `apps/mobile/src/sync/applyDeltas.ts` — delta-to-SQLite application logic
- `apps/backend/src/main/java/com/gymapp/backend/service/SyncService.java` — backend sync flow
- `apps/backend/src/main/java/com/gymapp/backend/service/ClaimService.java` — claim/link orchestration

