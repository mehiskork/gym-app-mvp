# Conflict Resolution & Immutability

This backend resolves conflicts deterministically on the server. Mobile clients apply deltas idempotently and treat the server as the cross-device conflict arbiter; SQLite remains the mobile runtime source of truth.

## Resolution rules (server-resolved)

### 1) Last-write-wins (LWW)
* The primary sort key is `updated_at` (newer wins).
* If only one side has `updated_at`, the side with a value wins.

### 2) Tie-breaker when `updated_at` is equal
* If both sides have `last_modified_by_device_id`, the lexicographically greater value wins.
* If either side is missing `last_modified_by_device_id`, the server uses the op ledger receive time (`op_ledger.received_at`). Later wins.
  * The server persists this timestamp into `entity_state.last_received_at` whenever it applies an op, and uses it as the tie-breaker for future conflicts.

### 3) Deletes & resurrection
* Deletes are treated as LWW against the current row.
* **No resurrection**: if a row has `deleted_at` set, subsequent updates are no-ops unless a future explicit “undelete” op type is added.
* When `deleted_at` is already set, it always wins over later updates (even if the update’s `updated_at` is newer).

### 4) Immutability
* `workout_session`: if the session was already `status = 'completed'` before the current `/sync` request, only `deleted_at` may change. Any other field update fails the request with `IMMUTABLE_ENTITY`.
* `workout_session_exercise`: if the related `workout_session` was already completed before the current `/sync` request, only `deleted_at` may change. Any other field update fails the request with `IMMUTABLE_ENTITY`.
* `workout_set`: if the related `workout_session` was already completed before the current `/sync` request, only `deleted_at` may change. Any other field update fails the request with `IMMUTABLE_ENTITY`.
* Same-request completion is allowed: if a `workout_session` was not completed before the request, the same request may include child `workout_session_exercise` / `workout_set` writes and the session completion.
* `program`, `program_day`, `program_day_exercise`, and `planned_set` remain editable under LWW.

### 5) Sync acknowledgements and immutable failures
Accepted inbound ops are acknowledged with:
* `applied`: op won conflict resolution and was persisted.
* `noop`: op lost conflict resolution (stale or delete already applied).

Immutable completed-workout violations are not returned as per-op rejected acks. They fail the whole `/sync` request with request-level `409 IMMUTABLE_ENTITY` before persistence.

For a failed immutable request, the backend writes no rows for that request to:

* `entity_state`
* `change_log`
* `op_ledger`

## Examples

### LWW by `updated_at`
* Existing row: `updated_at = 2024-01-02T00:00:00Z`
* Incoming row: `updated_at = 2024-01-01T00:00:00Z`
* Result: **incoming is `noop`** (stale update).

### Tie-break by device id
* Both rows: `updated_at = 2024-01-02T00:00:00Z`
* Existing: `last_modified_by_device_id = device-a`
* Incoming: `last_modified_by_device_id = device-b`
* Result: **incoming wins** (`device-b` > `device-a` lexicographically).

### Delete wins (no resurrection)
* Existing row: `deleted_at = 2024-01-03T00:00:00Z`
* Incoming update: `updated_at = 2024-01-04T00:00:00Z`
* Result: **incoming is `noop`** (delete wins, no resurrection).

### Immutability conflict
* Existing server state before the request: `workout_session.status = completed`
* Incoming update attempts to change `duration_sec`
* Result: the whole `/sync` request fails with `409 IMMUTABLE_ENTITY`; no request ops are persisted to `entity_state`, `change_log`, or `op_ledger`.

### Same-request completion allowance
* Existing server state before the request: `workout_session` is not completed or does not exist yet.
* Incoming request contains child `workout_session_exercise` / `workout_set` writes and sets the parent `workout_session.status = completed`.
* Result: allowed under normal conflict rules because the session was not completed before the request.
