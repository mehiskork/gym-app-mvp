# Conflict Resolution & Immutability

This backend resolves conflicts deterministically on the server. Mobile clients apply deltas idempotently and treat the server as the source of truth.

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
* `workout_session`: if `status = 'completed'`, only `deleted_at` may change. Any other field update is rejected.
* `workout_set`: if the related `workout_session` is completed, only `deleted_at` may change. Any other field update is rejected.
* `program`, `program_day`, `program_day_exercise`, and `planned_set` remain editable under LWW.

### 5) Sync acknowledgements
Every inbound op is acknowledged with:
* `applied`: op won conflict resolution and was persisted.
* `noop`: op lost conflict resolution (stale or delete already applied).
* `rejected`: op violated immutability rules.

Rejections include a reason, but they do not halt the sync.

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

### Immutability rejection
* `workout_session.status = completed`
* Incoming update attempts to change `duration_sec`
* Result: **rejected** with reason `workout_session immutable after completion`.
