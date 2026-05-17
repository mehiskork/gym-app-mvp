# Product Rules

These rules describe current user-facing behavior that must not change accidentally.

This document focuses on product behavior invariants, not setup steps or low-level protocol internals.

See also:

- `docs/local-development.md`
- `docs/architecture.md`
- `docs/conflicts.md`

---

## Workouts and sessions

### Home has Quick Workout and Planned Workout actions

When there is no active session, Home shows:

- Quick Workout: starts an ad-hoc workout.
- Planned Workout: routes based on plan state.

If a workout is already active, the active session guard wins and the user resumes that session instead.

### Only one in-progress session can exist

A user must never have two active workout sessions at the same time.

### Back-navigation during a workout returns Home

During an active workout session, back-navigation must return the user to Home without ending the session.

### Completed sessions are not editable

Completed workout sessions are final from the user perspective.

### Plans can have zero sessions

Plans with zero sessions remain openable and editable. A zero-session plan shows an empty state with Add session.

### Sessions can be deleted from plans

Deleting a session from a plan is allowed through the plan editing flow and must use the normal destructive confirmation pattern.

### User-facing hierarchy is Plan -> Session -> Exercises

Use Session in user-facing docs and copy. Legacy/internal names such as `program_day`, `DayDetail`, and `dayId` may remain in code, schema, and tests.

---

## Templates

### Templates are preview-first

User-facing terminology is Templates. Avoid old Prebuilt terminology in user-facing docs except when referring to legacy internal route/file names such as `PrebuiltPlans`.

The Templates list is browse/preview-only. Import happens from Template preview.

### Template preview is read-only

Template preview shows sessions and exercises. It does not edit the template.

### Duplicate imports are disabled

Already imported templates should be shown as already added and should not import again.

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

## Exercise picker

### Custom exercise CTA

The bottom-pinned exercise picker CTA says “Create a custom exercise”, uses secondary styling, and navigates to `CreateExercise`.

---

## Notifications and reminders

### Unfinished workout reminders require app setting and OS permission

Unfinished workout reminders are active only when both conditions are true:

- the TrainFrame unfinished reminder setting is enabled
- OS notification permission is granted

Fresh installs must not present unfinished reminders as simply active before notification permission exists. Turning unfinished reminders on requests notification permission. If permission is denied or later revoked, reminders stay off/blocked and scheduling skips safely.

### Rest timer notifications require permission

Rest timer notifications are local scheduled notifications. They schedule only when OS notification permission is granted; without permission, scheduling returns safely.

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

### Single history-item delete is allowed in product UI

Deleting one completed workout from History remains a normal product action, but it must use a destructive confirmation that clearly states:

- the workout is removed from history
- the deletion syncs across devices/backend
- the action is hard to undo

### Bulk history delete is dev/debug only

Bulk deleting completed history must not appear in normal product History UI.

If present, bulk history delete is only exposed through debug/dev tooling and must use stronger destructive copy/confirmation than single-item delete.

---

## Personal records (PRs)

### PR detection runs at session completion

PR detection occurs when a session is completed.

### PRs use completed, non-zero sets only

Only completed sets with non-zero weight and reps are PR-eligible.

### PR visibility is conditional

PR UI appears only when actual PR events exist for the session.

`pr_event` is a local-derived cache for MVP. Workout history (`workout_session`, `workout_session_exercise`, `workout_set`) is the canonical synced data; PR events are recomputed locally from that history and are not synced inbound or outbound.

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

### Guest data belongs to the device until sign-in

Signed-out guest data belongs to the device. When the user signs in with Google from signed-out guest mode, local guest data is intentionally added/merged into whichever Google account the user chooses.

Existing account cloud data must be preserved during guest claim. Guest claim migration is additive and existing account rows win on conflict.

### Logout is destructive for local synced identity state

Logout clears sensitive auth/session material, clears local synced user-scoped SQLite state, and returns device to guest/bootstrap-ready mode.

### Switching accounts requires explicit reset

Direct signed-in Account A -> Account B switching on one device requires explicit destructive reset first.

### Same-user re-link is non-destructive while already linked

If already linked to the same user identity, do not silently trigger destructive reset.

### Device-token sync is guest-only

Device-token sync is only for true guest mode. Account sync uses Firebase/account JWT. Backend ownership is derived from the authenticated principal and must not trust client-sent owner/user ids.

### Account deletion and recreation

Account deletion/recreation with the same Google account is supported. Deleted account data must not restore into the recreated account, and stale old account sessions/tokens must not be able to write into the recreated owner.

---

## Destructive actions

### Destructive deletes require explicit confirmation

Deleting plans/history and similar destructive actions must use the app’s destructive confirmation dialog pattern.

### Active-workout set deletion is exception

Deleting a set during an active workout is immediate but undoable via snackbar.
