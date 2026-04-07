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

The client asks for all deltas where:

- `change_id > cursor`

The backend returns deltas ordered by `change_id ASC`.

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

Implementation note (PR 11): backend sync ownership is resolved from authenticated principal type (`guest` vs `account`) through `OwnerScope`/`PrincipalOwnerResolver`. Account-authenticated sync writes persist explicit no-device transport context by storing `op_ledger.device_id = NULL` instead of synthesizing fake IDs.

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
- `rejected`: the backend refused the op, for example due to immutability rules

Important consequence:

- `applied`, `noop`, and `rejected` all stop retries for that `opId`
- if an op was explicitly acked, it becomes `acked` locally
- rejected ops are **not retried**

So “acked” does **not** mean “successfully applied.” It means “the backend has definitively processed this op.”

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
   - account JWT (if an account session token exists)
   - device token (fallback guest/device path)
   - device registration (only when no other token exists)
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
    - if auth used an **account JWT**, do not clear device token
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

If `/sync` returns `401` while using an **account JWT**, the app records an account-session auth failure and does not clear device credentials.

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
- `rejected`

All three are terminal from the outbox retry perspective.

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
4. process each op
5. fetch deltas after cursor
6. return `acks`, `deltas`, `cursor`, `hasMore`

### Per-op backend processing

For each op:

1. enforce ownership boundary
2. attempt idempotency insert into `op_ledger`
3. if duplicate:
   - return `noop`
4. otherwise:
   - run conflict checks
   - run immutability checks
   - if accepted:
     - upsert `entity_state`
     - append `change_log`
     - return `applied`
   - if not accepted:
     - return `rejected` or `noop` depending on reason

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
- `workout_set` whose parent session is completed

These are enforced on the backend, not just the client.

### Conflict resolution

The backend applies last-write-wins style conflict handling with tie-break logic.

This document does not restate the full decision tree.

For the exact policy, see:

- `docs/conflicts.md`

### Sanitization before outbound deltas

The backend strips or suppresses sensitive data before sending deltas.

Current examples:

- `device_token` deltas are not sent back to clients
- sensitive `app_meta` keys are denylisted from outbound payloads

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

- Sync is not automatically triggered in normal app flow.
- In development, sync is often triggered manually.
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
