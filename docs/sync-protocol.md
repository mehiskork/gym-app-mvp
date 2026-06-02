# Sync Protocol

This document describes the **current implemented sync contract** between the mobile app and the backend.

It is intentionally focused on **protocol, lifecycle, and safety behavior**.

This document does **not** cover:

- local setup and build commands
- product-rule decisions such as swap or prefill behavior
- detailed conflict-policy theory beyond what is necessary to understand the protocol
- claim-flow implementation details outside their effect on sync

See also:

- `docs/architecture.md`
- `docs/conflicts.md`
- `docs/local-development.md`

---

## Mental model

Sync in this app is a **single push-pull round trip**.

Every call to `POST /sync` does both:

- sends outgoing client ops from the outbox
- receives incoming server deltas after the client’s current cursor

These are related, but they are not the same pipeline:

- **outbox ops** go **client → server**
- **deltas** go **server → client**
- **cursor** tracks how far the client has read the server delta stream

Important:

- the cursor is **not a timestamp**
- the cursor is **not a version**
- the cursor is the last processed `change_log.change_id` value, stored as a string on the client

Also important:

- an **op** is a client-originated write intent
- a **delta** is a server-originated state update
- both are full-entity snapshots, not diffs

---

## The three sync pipelines

### 1. Outbox pipeline (`client → server`)

The mobile app writes locally first and records syncable changes in `outbox_op`.

Each outbox row contains two different identifiers:

- `id`: local SQLite row ID for the outbox table
- `op_id`: protocol-level op identifier sent to the server and matched in acks

`op_id` is the important one for sync semantics.

Outbox statuses:

- `pending`
- `in_flight`
- `failed`
- `acked`

Lifecycle:

- `pending → in_flight`: claimed at the start of a sync attempt
- `in_flight → acked`: server returned an explicit ack for that `op_id`
- `in_flight → failed`: request failed or sync response was incomplete
- `failed → in_flight`: claimed again on a later retry
- stale `in_flight` rows are repaired and made retryable on the next sync start

An outbox op is a **full snapshot of the entity at write time**, not a partial patch.

### 2. Delta pipeline (`server → client`)

The backend stores accepted state changes in `change_log`.

For normal incremental sync, the client asks for all deltas where:

- `change_id > cursor`

The backend returns deltas ordered by `change_id ASC`.

For a fresh restore cursor (`null`, blank, or `"0"`), the backend does **not** replay raw historical `change_log` rows. It returns dependency-closed current `entity_state` snapshots so an empty local database can restore the latest account state without replaying old reorder transitions. The final snapshot page returns a numeric high-water cursor so later incremental sync continues from `change_log` after that point.

PR events are intentionally excluded from backend deltas. Workout history entities are canonical synced data; `pr_event` is a local-derived cache and is recomputed by mobile after workout-history restore or sync.

`app_meta` is also intentionally excluded from backend deltas. It stores local implementation metadata such as device/local identity, linked-state markers, debug state, and support diagnostics. If synced settings are needed later, add a narrow allowlisted settings entity instead of syncing broad `app_meta`.

A delta contains:

- `changeId`
- `entityType`
- `entityId`
- `opType`
- `payload`

A delta is the server’s current canonical state for that entity at that change point. It is not a diff from the previous version.

### 3. Cursor pipeline

The client stores a cursor in local sync state.

Rules:

- the client sends the cursor with every `/sync` request
- the server returns deltas after that cursor
- if deltas are returned, the client advances the cursor to the last returned `changeId`
- if no deltas are returned, the cursor stays unchanged

The cursor is independent from outbox state:

- acking ops does not advance the cursor
- advancing the cursor does not ack ops

The coupling happens only at the end of a successful sync, where:

- ack writes
- delta application
- cursor update

are committed together in one transaction.

---

## Wire contract

### Endpoint

`POST /sync`

Requires Bearer authentication with one of:

- device token (guest/device transport path)
- account JWT (account-principal transport path)

Implementation note: backend sync ownership is resolved from authenticated principal type (`guest` vs `account`) through `OwnerScope`/`PrincipalOwnerResolver`. Account-authenticated sync writes persist explicit no-device transport context by storing `op_ledger.device_id = NULL` instead of synthesizing fake IDs.

### Request shape

Conceptually:

```json
{
  "cursor": "string numeric cursor or null",
  "ops": [
    {
      "opId": "string",
      "entityType": "string",
      "entityId": "string",
      "opType": "upsert|delete",
      "payload": { "...": "json" },
      "clientTime": "optional string"
    }
  ]
}
```

Ownership and authorization are derived from the authenticated principal (device token vs account JWT), not from client-supplied op fields.

### Response shape

```json
{
  "acks": [
    {
      "opId": "string",
      "status": "applied|noop|rejected",
      "reason": "string|null"
    }
  ],
  "cursor": "string numeric cursor",
  "deltas": [
    {
      "changeId": 123,
      "entityType": "string",
      "entityId": "string",
      "opType": "upsert|delete",
      "payload": { "...": "json" }
    }
  ],
  "hasMore": true
}
```

### Meaning of the response fields

#### `acks`

These are per-op backend confirmations.

They are the **only** signal that allows the mobile app to mark an outbox op as `acked`.

Ack statuses:

- `applied`: the backend accepted and processed the op
- `noop`: the backend treated it as already seen or otherwise non-applying
- `rejected`: the backend refused the op for a non-immutable per-op reason, if such a protocol case is added or returned

Important consequence:

- `applied` becomes `acked` locally
- `noop` becomes `acked` locally because it is treated as an idempotent successful outcome
- `rejected` does **not** become `acked` locally
- rejected ops are marked `failed` with the server reason so they remain visible in Debug/support output
- missing ack entries are not marked `acked`; they are marked failed/retryable according to the outbox backoff policy

So “acked” means the backend explicitly confirmed an applied or idempotent outcome for that op. Rejections and missing acks are not silently dropped.

Immutable completed-workout conflicts are different from per-op rejected acks. If an inbound request attempts a later mutation of an already-completed `workout_session`, `workout_session_exercise`, or `workout_set`, the backend returns request-level `409 IMMUTABLE_ENTITY` and aborts the whole `/sync` request before persistence. No acks or deltas are returned for that failed request.

#### `deltas`

These are the server’s outbound state updates for the client’s current user scope.

The client may receive its own accepted writes back as deltas. That is expected.

#### `cursor`

This is the change-stream position after the returned page.

If the response contains deltas, the returned cursor matches the last delta `changeId`.

If the response contains no deltas, the cursor is effectively unchanged.

#### `hasMore`

This indicates that there are more deltas available beyond the current page.

It pages **deltas only**.

It does **not** mean the client should resend ops.

When `hasMore = true`, the client continues with an empty `ops` array and the updated cursor.

---

## `syncNow()` flow on mobile

The mobile sync entry point is `syncNow(options?)`.

Current behavior, in order:

1. A caller invokes `syncNow()`.
2. The single-flight guard checks whether a sync is already running.
3. If one is already running, the caller receives the same in-flight Promise.
4. If sync is paused, the call exits without network I/O.
5. If backoff is active and the call is not forced, the call exits early.
6. The client resolves `/sync` auth in this order:
   - account JWT if local state is linked and a usable account session exists
   - blocked reauth if local state is linked but account auth is missing, invalidated, expired with failed refresh, or otherwise unusable
   - device token only in true guest mode
   - device registration only in true guest mode when no device token exists
7. The client repairs stale `in_flight` outbox rows.
8. The client claims a batch of retryable outbox ops and marks them `in_flight`.
9. The client reads the current cursor from local sync state.
10. The client sends `POST /sync` with `{ cursor, ops }`.
11. If the response succeeds:
    - parse `acks`, `deltas`, `cursor`, `hasMore`
    - mark explicitly acked ops as `acked`
    - apply deltas locally
    - update sync state
    - mark any sent-but-unacked ops as `failed`
12. If the response is `401`:
    - if auth used a **device token**, clear local device token and self-heal via re-registration on the next run
    - if auth used an **account JWT**, mark the stored account session as invalidated (`sync_401`) and do not clear device token
    - do not ack the sent ops
13. If another error occurs:
    - mark sent ops `failed`
    - increment failure counters
    - compute exponential backoff
14. If `hasMore = true`, run another page in pull-only mode with empty ops.
15. Stop when `hasMore = false` or continuation-page cap is reached.

---

## Single-flight behavior

Only one sync chain runs at a time inside the mobile app process.

Important behavior:

- the second caller does **not** queue another sync
- the second caller gets the same Promise as the first caller
- newly enqueued ops after the first sync has started are **not** included in that already-running sync chain
- those later ops wait for the next explicit sync call

This is intentional.

---

## Device registration and 401 self-heal

The mobile app requires either an account JWT or a device token for `/sync`.

### Missing-token path

If no token exists locally:

1. client calls `/device/register`
2. backend returns device token and guest user identity
3. client stores them
4. sync proceeds

### `401` recovery path

If `/sync` returns `401` while using a **device token**:

1. client clears the stored token
2. the current sync attempt stops
3. sent ops remain unresolved
4. next sync attempt sees no token
5. client re-registers
6. sync resumes with fresh credentials

This is a self-healing auth path.

Important detail:

- the 401 path does **not** immediately mark the sent ops as acked
- stale `in_flight` repair on the next run is what makes those stuck ops retryable again
If `/sync` returns `401` while using an **account JWT**, the app records an account-session auth failure, persists that invalidated state, and does not clear device credentials.

Invalidated account sessions are treated as **present but unusable**:

- they are not selected for `/sync`
- if local state is linked to an account, `/sync` is blocked with `account_reauth_required` / `blocked_reauth` and does not fall back to device-token transport
- device-token sync remains allowed only in true guest mode
- the invalidation survives app restart until account sign-in writes a fresh session

`/me` follows the same lifecycle guard:

- it only uses a usable (non-invalidated) account session
- `401` from `/me` also invalidates the account session (`me_401`)

### PR 15 observability signals

For account rollout diagnostics, the app and backend now expose a small, explicit auth/sync signal set:

- `syncAuthModeLastUsed`: `account_jwt` or `device_token` from the last sync attempt.
- `syncAuthModeNextPlanned`: which mode the next sync would choose (`account_jwt` when the linked account session is usable, `device_token` only in true guest mode, or `blocked_reauth` when linked state requires reauth/reset).
- `accountSessionStatus`: `missing` | `usable` | `invalidated`.
- `accountInvalidationReason`: enum-like reason (for example `sync_401`, `me_401`) when invalidated.
- `accountInvalidatedAt`: ISO timestamp when invalidation was recorded.
- `deviceTokenPresent`: boolean only (never token value).
- `linkedState`: `guest` | `linked`.

Backend error responses for auth failures also include low-cardinality `details.authMode` metadata where applicable, and backend logs include low-cardinality sync/migration observability fields (auth mode, owner scope type, op counts, and migration counters) without raw token values.


If `/sync` returns `401` while using an **account JWT**, the app records an account-session auth failure, does not clear device credentials, and blocks later linked-state sync until reauth or destructive reset.

Missing guest device-token recovery can also happen from the missing-token path: in true guest mode, sync can register fresh device credentials and continue without restarting the app.

---

## Outbox lifecycle in detail

### `pending`

Newly enqueued op, not yet claimed.

### `in_flight`

Claimed for the current request.

This means the client believes this op is part of an active sync attempt.

### `acked`

The server returned an explicit ack for the `op_id`.

This includes:

- `applied`
- `noop`

Rejected ops are not marked `acked`; they are marked failed with the server reason so Debug/support output can surface the rejected state.

### `failed`

The op was sent but could not be safely concluded in that attempt.

This happens for example when:

- network request fails
- non-401 server error occurs
- sync response is missing an expected ack

Failed ops are retried later according to backoff policy.

### Stale `in_flight` repair

If the app dies mid-sync, some ops may remain `in_flight`.

Those are repaired at the **start of the next sync**, not by a timer.

Repair behavior:

- identify stale `in_flight` rows older than configured threshold
- move them back into retryable flow
- allow them to be claimed again

---

## Continuation paging with `hasMore`

The backend returns deltas in pages.

If the response says `hasMore = true`, the client performs another request with:

- the updated cursor
- an empty `ops` array

Important:

- original ops are sent only once, on the first page
- continuation requests are delta pulls only
- `hasMore` says nothing about remaining outbox ops

Current MVP cap:

- maximum continuation pages per `syncNow()` call: `10`

So large delta backlogs may require multiple sync calls.

---

## Atomicity invariant on the client

After a successful `/sync` response, these three actions are committed together in one local transaction:

- mark outbox ops as acked
- apply deltas
- update sync state, including cursor

This is a correctness rule, not just an implementation detail.

Why it matters:

- cursor must not advance without deltas being written
- deltas must not be written without the corresponding sync-state update
- ack state must not be committed separately from the rest of the successful sync result

If one part fails, the whole transaction rolls back.

---

## Delta application on mobile

Deltas are applied by explicit entity-to-table mapping.

### Ordering

Deltas are not blindly applied in arrival order.

They are:

1. mapped to local table config
2. sorted by dependency order
3. applied with retry passes for foreign-key dependency resolution

This allows parent entities to be written before child entities even if the raw delta order is inconvenient.

### Table config is a write whitelist

`tableConfigs` is not just schema documentation.

It is the **write gate** for delta application.

Only columns listed there are written during sync apply.

If a column exists in SQLite but is missing from `tableConfigs`, incoming deltas will not correctly persist it.

This is a critical maintenance rule: adding a synced column requires updating the delta-write whitelist.

### Per-delta decision flow

For each delta:

1. look up entity config
2. normalize payload and primary-key fields
3. run special in-progress-session guard when relevant
4. read the local row if present
5. compare local and incoming staleness metadata
6. decide whether to skip or apply
7. if delete:
   - soft-delete when supported
   - hard-delete otherwise
8. if upsert:
   - write whitelisted columns with conflict update semantics

### Staleness rules on the client

The client may skip an incoming delta when the local row is already newer.

Current comparison shape:

- for versioned entities: compare `version` first, then timestamps
- otherwise compare `updated_at`
- stale incoming rows are skipped rather than overwriting newer local state

A skipped delta is not an error. It means the local row currently wins.

### Special in-progress-session guard

There is a specific mobile-side guard that prevents the app from importing a second conflicting `IN_PROGRESS` workout session into local state.

This is a client-local protection on top of the general sync logic.

---

## Delete behavior

Delete deltas are not treated like ordinary upserts.

Current rules:

- if the local table supports `deleted_at`, deletes are applied as soft deletes
- otherwise delete becomes a hard delete
- delete payload must include delete metadata such as `deleted_at`
- once deleted, later resurrection is blocked by current conflict rules

Delete markers are part of the sync contract, not just a UI concern.

---

## Backend processing flow

For a single `/sync` call, backend processing is:

1. parse request
2. validate cursor
3. validate all inbound ops
4. canonicalize and build the full request plan
5. fail request-level conflicts, including immutable completed-workout violations, before persistence
6. persist the accepted plan
7. fetch deltas after cursor
8. return `acks`, `deltas`, `cursor`, `hasMore`

### Per-op backend processing

While building the request plan, the backend:

1. enforce ownership boundary
2. detect duplicate ops that will return `noop`
3. run conflict checks
4. run immutability checks against pre-request completed-workout state
5. validate parent references for applied ops

If the plan is accepted, persistence happens after planning:

- insert `op_ledger` rows for accepted non-duplicate ops
- upsert `entity_state` for applied ops
- append `change_log` for applied ops
- return per-op `applied` / `noop` acks

If an immutable completed-workout conflict is found, the backend throws `IMMUTABLE_ENTITY` and aborts before those persistence steps. That failed request writes no `entity_state`, `change_log`, or `op_ledger` rows.

### Backend data structures involved

#### `op_ledger`

Used for idempotency.

Same `op_id` must not be applied twice.

#### `entity_state`

Stores the current winning state for each entity.

This is the backend’s current conflict-resolved state.

#### `change_log`

Append-only delta stream used to serve client cursor-based sync.

The cursor points into this stream by `change_id`.

---

## Backend validation and enforcement

The backend currently enforces several safety boundaries during sync.

### Ownership enforcement

A user’s sync scope is isolated server-side.

An entity cannot be mutated by the wrong guest-user ownership context.

### Idempotency

Duplicate `op_id` replays are safe.

They are deduplicated using `op_ledger`.

### Immutability rules

Certain entities become immutable after completion, except for delete-marker cases.

Current important examples:

- completed `workout_session`
- `workout_session_exercise` whose parent session is completed
- `workout_set` whose parent session is completed

These are enforced on the backend, not just the client.

The immutability check uses the completed-session state from before the current request. This allows the offline completion batch where a request writes child `workout_session_exercise` / `workout_set` rows and completes the parent `workout_session` in the same request, as long as that session was not already completed before the request. Later requests that mutate the completed session, session exercise, or set fail with request-level `409 IMMUTABLE_ENTITY`.

### Conflict resolution

The backend applies last-write-wins style conflict handling with tie-break logic.

This document does not restate the full decision tree.

For the exact policy, see:

- `docs/conflicts.md`

### Local-only metadata before outbound deltas

The backend suppresses local-only metadata and strips sensitive data before sending deltas.

Current examples:

- `device_token` deltas are not sent back to clients
- `app_meta` deltas are not sent back to clients

---

## Important invariants

These are protocol-level rules that future changes must preserve.

### Ack safety

The client must never mark an outbox row `acked` unless the response contains an explicit matching `ack.opId`.

### Idempotency safety

Replaying the same `op_id` must not apply state twice.

### Cursor safety

The cursor must only advance to the last delta actually returned and durably applied.

### Push-pull safety

A single `/sync` request may contain both outgoing ops and incoming deltas. Those must continue to be treated as two distinct flows sharing one round trip.

### Continuation safety

When `hasMore = true`, the next request must continue with updated cursor and empty ops.

### Delete safety

Deleted rows must not be resurrected by ordinary later upserts under current rules.

### Single-flight safety

Only one sync chain runs at once per process.

### Recovery safety

Stale `in_flight` rows must be repairable on the next sync attempt.

---

## Known MVP limitations and tradeoffs

- Sync is scheduled after outbox writes, app startup, foreground resume with cooldown, and account-entry flows.
- Routine periodic/background sync is not implemented yet.
- In development, manual Debug sync remains available for troubleshooting.
- Continuation paging is capped per `syncNow()` call.
- Old `acked` outbox rows are not automatically pruned by sync logic.
- Missing ack entries are treated as failures and retried later.
- Conflict quality depends partly on client-supplied timestamps.
- `last_modified_by_device_id` exists in the wider design but is not fully leveraged by all current write paths.

---

## What belongs elsewhere

Keep these topics out of this document:

- local backend/device setup and network instructions
- claim-flow UX and onboarding behavior
- workout product rules such as swap, prefill, PR display, or history visibility
- full conflict-resolution theory and edge-case matrix

See:

- `docs/local-development.md`
- `docs/architecture.md`
- `docs/product-rules.md`
- `docs/conflicts.md`


## Production intent vs dev seams

- `/sync` dual auth transport (device token + account JWT) is production-intended.
- Device-token sync is only for true guest mode. Account sync uses Firebase/account JWT.
- `/claim/start` is device/guest-authenticated.
- `/claim/confirm` is account-authenticated with Firebase JWT and derives account ownership from the verified account principal.
- Guest claim requires local guest outbox rows to be acked before claim starts. After successful claim, the mobile sync cursor resets before the first account sync.
- Guest claim migration is additive; existing account rows win on conflict.
