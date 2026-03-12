# Product Rules

These rules describe current **user-facing behavior that must not change accidentally**.

This document is about **product decisions**, not implementation internals, setup, or sync protocol details.

---

## Scope

A product rule in this project is a behavior that a future developer must preserve unless there is a deliberate decision to change it.

This document does **not** cover:

- local setup and run commands
- sync protocol internals
- conflict-resolution mechanics
- claim-flow implementation details
- low-level migration or schema issues

See also:

- `docs/local-development.md`
- `docs/architecture.md`
- `docs/conflicts.md`

---

## Workouts and sessions

### Only one in-progress session can exist

A user must never have two active workout sessions at the same time.

If the user tries to start a workout while another session is already in progress, the app must route them back to the existing in-progress session instead of creating a new one.

Why this matters: workout state must stay singular and recoverable.

### Back-navigation during a workout returns Home

During an active workout session, back-navigation must return the user to Home rather than popping back through the previous screen stack.

This must not end the session.

Why this matters: users should not accidentally lose the active-workout flow by navigating backward through entry screens.

### Completed sessions are not editable

Once a workout session is completed, it is treated as final from the user’s perspective.

Why this matters: history should represent what was actually logged, not an editable draft.

---

## Set editing and keyboard behavior

### Weight and reps select all text on focus

When the user focuses either the weight field or the reps field, the current value must be selected so the next typed value replaces it.

Why this matters: fast gym logging depends on overwrite-first editing rather than manual clearing.

### Inputs save on end-editing, not every keystroke

Set edits are committed on end-editing events such as blur or submit, not on every character typed.

Why this matters: the app is optimized for stable, deliberate set-entry behavior rather than keystroke-level persistence.

### Reps are integers; weight supports decimals

Reps must be normalized to non-negative integers. Weight may be decimal and supports decimal parsing, including comma-style decimal input.

Why this matters: reps feed progression and PR logic and must remain structurally consistent.

### Focused set row must remain visible above the keyboard

When the keyboard opens during workout editing:

- the active set row must remain visible
- the screen must compensate for keyboard overlap
- the sticky **Finish workout** CTA must hide while the keyboard is open

Why this matters: set logging must stay usable on a phone during real workouts.

---

## Exercise swap

### Swap is session-only

A swap changes the current workout session only.

A swap must **not** modify any plan tables such as:

- `program`
- `program_week`
- `program_day`
- `program_day_exercise`
- `planned_set`

The swapped exercise remains part of that session’s recorded history, but it must not rewrite the plan for future sessions.

Why this matters: plans stay stable; session execution stays flexible.

### Swap has two branches based on completed sets

The branch condition is **completed sets**, not total sets.

#### If completed set count is 0

The exercise is replaced **in place**.

- same slot
- same position
- no extra row inserted

#### If completed set count is 1 or more

The original exercise remains, and the replacement is inserted **immediately after it**.

- completed work stays visible
- the replacement becomes a new row
- the inserted row starts with one default empty set

Why this matters: logged work must never disappear just because the user changed direction mid-session.

### Swap must not affect future prefills

Swapped-in exercises must not become the future prefill source for the original planned slot.

Why this matters: session flexibility must not pollute long-term plan-based progression.

### No “Alternative for X” labeling

The UI must not add labels such as “Alternative for X” to swapped exercises.

Why this matters: the session UI should stay clean and direct.

---

## Next-session prefill

### Prefill is plan-slot based, not visual-position based

When a new session is created from a plan day, each planned slot is prefilled using the most recent completed history for that same planned slot.

The matching rule is based on the planned slot identity, not the visible row order alone.

Why this matters: reordering or swapping should not corrupt progression history.

### Prefill uses completed sets only

Only completed sets may be used as the source for future prefills.

Why this matters: unfinished attempts should not become progression history.

### Swapped exercises do not pollute original slot history

Swapped-in exercises must not be used as prefill history for the original planned slot in future sessions.

Why this matters: the plan should remember the intended lift history for that slot, not an ad hoc substitute.

### Set-count carryover uses the larger of plan count and completed history count

New session set count must be:

`max(plan set count, historical completed set count)`

That means:

- doing **more** completed sets than planned can increase the next session’s set count
- doing **fewer** sets than planned must **not** shrink the next session’s set count

Why this matters: progression can grow from real performance, but temporary under-completion must not erase the plan.

### Remaining sets fall back to plan defaults

If history has fewer completed sets than the current target set count:

- matching earlier sets are prefilled from history
- remaining sets use current plan defaults

Why this matters: history augments the plan; it does not replace the plan entirely.

### Plan tables must remain unchanged during prefill

Prefill must only affect generated session rows. It must not mutate plan data.

Why this matters: the plan is read-only during session generation.

---

## History

### History list shows completed sessions only

History must show completed sessions, not in-progress or discarded ones.

Why this matters: history is a record of finished training, not drafts.

### History detail shows performed exercises only

In session history detail, exercises with no logged sets must not appear.

History is intended to show what the user actually did, not everything they originally planned.

Why this matters: history should reflect performed work, not intent.

### “Delete all history” is disabled when there is nothing to delete

Bulk delete controls must not appear active when there are no completed sessions.

Why this matters: destructive actions should only be available when meaningful.

---

## Personal records (PRs)

### PRs are detected at session completion

PR detection runs when a session is completed.

Why this matters: PRs should be derived from finalized work, not live draft state.

### PRs use completed sets only

Only completed sets are eligible for PR calculation.

In addition, sets with zero weight or zero reps must not qualify as PR candidates.

Why this matters: PRs should reflect real performance, not placeholders or warm-up artifacts with zero values.

### PR visibility is conditional

PR badges or PR sections should only appear when there are actual PR events for that session.

Why this matters: the UI should celebrate real achievements without adding empty decoration.

### PR badge is always gold

The PR badge must remain gold and must not adopt the user’s selected primary theme color.

Why this matters: PRs are a special visual category and should remain visually consistent across themes.

---

## Theme and appearance

### Primary theme color is user-selectable and persisted

The user can select a primary color, and that choice must persist.

Why this matters: personalization is part of the app’s UI identity.

### Invalid theme keys fall back safely

If the stored primary-color key is invalid or unknown, the app must fall back to the default theme color.

Current default: `orange`.

Why this matters: corrupted or outdated settings must not break the UI.

### Primary color affects accent surfaces, not every semantic color

The selected primary color should drive accent surfaces such as:

- primary buttons
- chip/badge accents
- active tab/icon styling
- CTA card accents

But semantic colors must remain semantically stable:

- PR badge stays gold
- destructive elements stay red
- success/completion states stay green

Why this matters: personalization must not weaken meaning.

---

## Destructive actions

### Destructive deletes require explicit confirmation

Deleting plans, plan exercises, history entries, or similar destructive items must use the custom dark destructive confirmation dialog.

Native system delete confirms must not be the default pattern for these flows.

Why this matters: destructive actions should feel consistent with the app and hard to trigger accidentally.

### Active-workout set deletion is an exception

Deleting a set during an active workout is immediate, but undoable via snackbar.

Why this matters: in-session logging needs to stay fast, while still giving the user a recovery path.

---

## Fragile rules to protect carefully

These are especially easy for future refactors to break accidentally.

### Swap branch condition is completed-set count, not total set count

A row can have sets and still be eligible for in-place replacement if none of them are completed.

### Prefill depends on planned-slot identity

Any change that matches prefill only by exercise identity or visible position risks reintroducing swap pollution.

### History is performed-only

Showing all planned exercises in history would be a behavior change, not a harmless UI tweak.

### PR badge must stay independent from theme accent color

A theme refactor that routes it through the general primary-color system would break this rule.

### Plan tables are read-only during session behavior

Future features must not “helpfully” write workout behavior back into the underlying plan unless that decision is explicitly revisited.

---

## What belongs elsewhere

Keep the following out of this document:

- sync conflict-resolution details
- `/sync` request/response mechanics
- claim-flow backend mechanics
- auth/token implementation details
- migration bugs or schema-repair notes
- local environment and build instructions

Those belong in architecture, setup, or sync-specific documentation.