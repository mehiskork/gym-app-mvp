# Conflict Resolution Policy

This document defines how the backend resolves conflicts for sync ops. Mobile clients apply deltas idempotently; the backend is the source of truth for conflict outcomes.

## Rule 1 — Last Write Wins (LWW)

We use `updated_at` (ISO-8601 string) as the primary timestamp for conflict resolution.

- If `incoming.updated_at` is newer than `existing.updated_at`, the incoming op **wins**.
- If `incoming.updated_at` is older, the incoming op is a **noop**.

## Rule 2 — Tie-break when `updated_at` is equal

When `updated_at` is equal (or missing), we use:

1. **`last_modified_by_device_id`** (lexicographically greater wins), if present on both sides.
2. **Server receive time** as a fallback. We use `change_log.created_at` as the stored receive time for the existing row and `Instant.now()` for the incoming op. Later timestamps win.

This tie-break is deterministic even when devices do not send `last_modified_by_device_id`.

## Rule 3 — Deletes (no resurrection)

Delete behavior is **no resurrection**:

- If `deleted_at` is set in the existing row, **updates never resurrect** that row.
- If an incoming delete arrives, it **wins** over updates. If both sides are deletes, the newer `deleted_at` (or tie-break) wins.

In other words: once `deleted_at` is set, only delete metadata may advance; updates are always ignored.

## Rule 4 — Immutability

These entities are immutable once completed:

- `workout_session`: once `status = 'completed'`, **reject** updates to any field other than `deleted_at`.
- `workout_set`: if its parent `workout_session` is completed, **reject** updates to any field other than `deleted_at`.

Rejected ops are **acked as rejected** with a reason and do not crash sync.

## Examples

### LWW

- Existing: `updated_at = 2024-08-01T10:00:00Z`
- Incoming: `updated_at = 2024-08-01T10:05:00Z`

→ Incoming wins (applied).

### Tie-break

Both updates have `updated_at = 2024-08-01T10:00:00Z`.

- Existing `last_modified_by_device_id = dev_a`
- Incoming `last_modified_by_device_id = dev_b`

→ `dev_b` wins (lexicographic).

### Delete vs update (no resurrection)

- Existing: `deleted_at = 2024-08-01T09:00:00Z`
- Incoming update: `updated_at = 2024-08-01T10:00:00Z`

→ Delete wins (noop, no resurrection).

### Immutability rejection

If a `workout_session` is already completed, any update that changes `title`, `status`, or set contents is **rejected**. A delete is still allowed.
