# Product Rules

These rules describe current user-facing behavior that must not change accidentally.

This document focuses on product behavior invariants, not setup steps or low-level protocol internals.

See also:

- `docs/local-development.md`
- `docs/architecture.md`
- `docs/conflicts.md`

---

## Workouts and sessions

### Only one in-progress session can exist

A user must never have two active workout sessions at the same time.

### Back-navigation during a workout returns Home

During an active workout session, back-navigation must return the user to Home without ending the session.

### Completed sessions are not editable

Completed workout sessions are final from the user perspective.

---

## Set editing and keyboard behavior

### Weight and reps select all text on focus

The current field value is selected on focus for overwrite-first logging.

### Inputs save on end-editing, not every keystroke

Set edits persist on blur/submit-style end-editing events.

### Reps are integers; weight supports decimals

Reps normalize to non-negative integers. Weight accepts decimal parsing (including comma decimal input).

### Focused set row must remain visible above keyboard

During workout logging, keyboard overlap handling must keep the active row visible and hide the sticky finish CTA while keyboard is open.

---

## Exercise swap

### Swap is session-only

Swap mutates session rows only and must not mutate plan tables (`program*`, `planned_set`).

### Swap branches on completed-set count

- If completed-set count is `0`: replace in place.
- If completed-set count is `>= 1`: keep original row and insert replacement immediately after it with one default empty set.

### Swap must not affect future prefills

Swapped-in exercises must not become prefill history for the original planned slot.

### No “Alternative for X” labeling

The UI should not add “Alternative for X” labels for swapped exercises.

---

## Next-session prefill

### Prefill is plan-slot based

Prefill lookup is based on planned slot identity, not visual row position.

### Prefill uses completed sets only

Only completed sets can seed future prefill values.

### Set-count carryover rule

New session set count is `max(plan set count, historical completed set count)`.

### Remaining sets use plan defaults

When historical completed sets are fewer than target set count, unmatched sets use current plan defaults.

### Plan tables remain unchanged during prefill

Prefill only affects generated session rows.

---

## History

### History list shows completed sessions only

History excludes in-progress/discarded sessions.

### History detail shows performed exercises only

History detail hides exercises with zero logged sets.

### “Delete all history” disabled when empty

Bulk-delete should not be active when there are no completed sessions.

---

## Personal records (PRs)

### PR detection runs at session completion

PR detection occurs when a session is completed.

### PRs use completed, non-zero sets only

Only completed sets with non-zero weight and reps are PR-eligible.

### PR visibility is conditional

PR UI appears only when actual PR events exist for the session.

### PR badge is always gold

PR badge color remains gold and does not follow user-selected primary theme color.

---

## Theme and appearance

### Primary theme color is user-selectable and persisted

The user-selected primary color persists.

### Invalid theme keys fall back safely

Unknown/invalid keys fall back to default (`orange`).

### Primary color affects accents, not semantic colors

Primary color can style accents (buttons/chips/active tab/CTA accents), while semantic colors remain stable:

- PR badge stays gold
- destructive stays red
- success/completion stays green

---

## Account logout, reset, and account switching

### Logout is destructive for local synced identity state

Logout clears sensitive auth/session material, clears local synced user-scoped SQLite state, and returns device to guest/bootstrap-ready mode.

### Switching accounts requires explicit reset

Switching from one linked account to another on one device requires explicit destructive reset first.

### Same-user re-link is non-destructive while already linked

If already linked to the same user identity, do not silently trigger destructive reset.

---

## Destructive actions

### Destructive deletes require explicit confirmation

Deleting plans/history and similar destructive actions must use the app’s destructive confirmation dialog pattern.

### Active-workout set deletion is exception

Deleting a set during an active workout is immediate but undoable via snackbar.
