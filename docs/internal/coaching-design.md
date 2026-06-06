# TrainFrame Coaching Design

## Status / Scope

Status: planning document. This document describes a future TrainFrame Coaching feature before implementation.

Scope:

- Android-first mobile app experience.
- Backend and data model designed to support a later web dashboard.
- Public-safe technical design suitable for a public repository.
- No implementation, migrations, tests, credentials, private operations data, tester information, or real user data are included here.

Out of scope for this document:

- Exact UI copy and final screen designs.
- Production operations runbooks.
- Billing, trainer discovery, organizations, teams, marketplace features, and web dashboard implementation.

## Executive Summary

TrainFrame Coaching should let trainers connect with trainees, assign workout plans, review eligible completed workouts, read trainee-authored notes, and leave coaching feedback. Trainees should explicitly accept or reject trainer access, revoke access at any time, follow assigned plans offline, log workouts normally, and read coach feedback.

Coaching is not just more sync entities. The current backend is a principal-scoped JSON sync engine built around `entity_state`, `change_log`, and `op_ledger`. Coaching introduces controlled cross-user reads and server-authored read-only data in a trainee's sync scope. That requires typed backend coaching tables for permissions, a split sync policy, a server-published sync writer, and strict backend authorization before mobile feature work.

The v1 product should stay intentionally narrow:

- Account-only coaching.
- Invite-code relationship flow.
- Trainer-assigned plans with immutable revisions.
- Trainee offline use of assigned plans.
- Trainer online-only reads of workouts from that trainer's assignments.
- Workout-level coach feedback.

## Current Architecture Constraints

TrainFrame is offline-first:

- Mobile SQLite is the UI source of truth on a device.
- Mobile writes domain rows locally first and enqueues outbox operations in the same transaction.
- Sync is a push-pull round trip through `/sync`.
- Backend sync is the cross-device conflict arbiter.

Backend constraints:

- Sync storage is generic JSONB state, not fully typed workout domain tables.
- Current sync scope is principal-derived from account JWT or guest device token.
- Backend must never trust client-sent owner IDs.
- Current synced entity types are personal workout entities such as `program`, `program_day`, `planned_set`, `workout_session`, and `workout_set`.
- Completed workout immutability already exists server-side for workout-session entities.

Mobile constraints:

- Plan and workout screens read from SQLite.
- Existing trainee notes are stored on trainee-owned workout rows:
  - workout-level `workout_note`
  - exercise-level `notes`
  - set-level `notes`
- Assigned plans must fit the local-first model so trainees can train without network access.
- Trainer-side trainee data should not be cached offline in v1.

## Coaching MVP Scope

MVP includes:

- Account profile display name for trainer identity.
- Invite-code relationship flow.
- Explicit trainee accept, reject, and revoke actions.
- Trainer assignment from synced trainer-owned plans.
- Immutable assignment revisions.
- Read-only assigned plans in trainee SQLite.
- Normal trainee workout logging from assigned plans.
- Trainer online review of workouts performed from that trainer's assigned plan revisions.
- Workout-level coach feedback.
- Account deletion and revocation handling.

MVP does not include:

- Guest coaching.
- Self-coaching.
- Full chat.
- Set-level feedback threads.
- Trainer offline cache of trainee workout data.
- Web dashboard.
- Billing, trainer marketplace, discovery, organizations, or teams.
- FCM push notification infrastructure as a core dependency.

## Explicit v1 Deferrals

- Web dashboard.
- Trainer business profiles beyond a simple display name.
- Billing and subscriptions.
- Public trainer discovery.
- Organizations, gyms, teams, or multi-trainer groups.
- Full chat or inbox.
- Set-level threads.
- Shared media attachments.
- Background trainer data sync/offline review.
- Push notifications as a blocking dependency.
- Complex email/deep-link onboarding.
- Fine-grained plan collaboration between multiple trainers.

## Product Decisions

- Mobile app first; web dashboard later.
- Same account can be both a normal trainee and a trainer.
- No guest coaching.
- Self-coaching is blocked in v1.
- Trainer access requires explicit trainee acceptance.
- Trainee can revoke trainer access at any time.
- Trainer identity shown during invite acceptance comes from `account_profile.display_name`.
- `account_profile.display_name` should default from Google display name when available, but TrainFrame should support an editable profile name.
- Trainer can only assign plans already synced to the backend.
- Trainer can only read workouts performed from that trainer's assigned plan revisions.
- Trainer cannot read trainee Quick Workouts or personal plans in v1.
- Trainer cannot mutate trainee workout logs.
- Assigned plans are read-only for trainees.
- Coach feedback is separate from existing trainee notes.
- Completed and in-progress workouts remain tied to the plan revision used when they were started.
- Completed workout history is never rewritten when a plan changes.

## Security and Permission Model

Backend services must enforce all permissions. Mobile UI restrictions are convenience and usability protections, not security boundaries.

Core rules:

- Coaching endpoints are account-authenticated only.
- Guest principals cannot create invites, accept trainer access, assign plans, read trainee data, or post feedback.
- Backend derives the authenticated owner from the active account principal.
- Backend never trusts client-sent owner IDs, trainee owner IDs, trainer owner IDs, source assignment IDs, or source revision IDs as authority.
- Relationship state controls access.
- Revocation takes effect immediately server-side.
- Trainer read APIs derive trainee owner from relationship and assignment records.
- Trainer write APIs derive trainer owner from the authenticated principal.
- Trainee-assigned plan rows are server-authored and read-only to the trainee client.
- Trainer cannot mutate trainee workout rows.

Recommended permission service responsibilities:

- Resolve active account owner.
- Require non-deleted account.
- Require active relationship for trainer/trainee access.
- Require trainee acceptance before any trainer access.
- Require assignment belongs to the active relationship.
- Require workout session was started from the assignment/revision owned by the trainer.
- Deny revoked, rejected, expired, archived, or deleted states.
- Return 403 or 404 consistently without leaking unrelated user data.

## Backend Model

Add typed backend tables for permissions, web-readiness, and auditability. Names are illustrative and can be adjusted during implementation.

### `account_profile`

Purpose: public-facing app profile metadata for account users.

Key fields:

- `owner_id`
- `display_name`
- `created_at`
- `updated_at`

Notes:

- Default from available Google display name during account setup.
- User-editable TrainFrame profile name should become the source shown to invite recipients.

### Invite and Relationship Tables

Possible tables:

- `coach_invite`
- `coach_relationship`

`coach_invite` key fields:

- `id`
- `trainer_owner_id`
- `code_hash`
- `code_fingerprint`
- `status`
- `expires_at`
- `accepted_at`
- `accepted_by_owner_id`
- `created_at`
- `updated_at`

`coach_relationship` key fields:

- `id`
- `trainer_owner_id`
- `trainee_owner_id`
- `status`
- `accepted_at`
- `revoked_at`
- `revoked_by_owner_id`
- `created_at`
- `updated_at`

Important states:

- invite: `pending`, `accepted`, `rejected`, `expired`, `cancelled`
- relationship: `active`, `revoked`

### Plan Assignment and Revision Tables

Possible tables:

- `coach_plan_assignment`
- `coach_plan_revision`
- `coach_plan_revision_entity`

`coach_plan_assignment` key fields:

- `id`
- `relationship_id`
- `trainer_owner_id`
- `trainee_owner_id`
- `status`
- `current_revision_id`
- `assigned_at`
- `archived_at`
- `created_at`
- `updated_at`

`coach_plan_revision` key fields:

- `id`
- `assignment_id`
- `revision_number`
- `snapshot_json`
- `snapshot_hash`
- `published_at`
- `created_by_owner_id`
- `created_at`

`coach_plan_revision_entity` key fields:

- `revision_id`
- `trainee_owner_id`
- `entity_type`
- `entity_id`
- `original_entity_id`

Notes:

- `snapshot_json` stores the immutable plan structure for the revision.
- `coach_plan_revision_entity` maps published trainee-scope entity IDs back to revision and source entities.
- Trainer can assign only synced trainer-owned plans.

### Feedback Table

Possible table:

- `coach_feedback`

Key fields:

- `id`
- `relationship_id`
- `assignment_id`
- `revision_id`
- `workout_session_id`
- `trainer_owner_id`
- `trainee_owner_id`
- `body`
- `created_at`
- `updated_at`
- `deleted_at`

Notes:

- V1 feedback is workout-level only.
- Feedback is trainer-authored and separate from trainee workout notes.
- Feedback should be published read-only into trainee sync scope.

## Mobile / Local DB Model

The trainee mobile app needs assigned plans and feedback offline. Trainer-side trainee reads remain online-only in v1.

Potential SQLite additions:

- `coach_relationship_local`
- `coach_assignment_local`
- `coach_feedback`

Potential columns on `program`:

- `origin`: `personal` or `coach_assigned`
- `coach_assignment_id`
- `coach_plan_revision_id`
- `assigned_by_display_name`
- `is_read_only`

Potential columns on workout rows:

- `workout_session.source_coach_assignment_id`
- `workout_session.source_plan_revision_id`

Additional assignment/revision columns can be added to `program_week`, `program_day`, `program_day_exercise`, and `planned_set` if useful for local guards, diagnostics, or future migrations.

Mobile repository rules:

- Plan edit repositories must reject edits to read-only assigned plans.
- Session creation may start workouts from assigned plans.
- Workout logging remains normal once the workout is started.
- Workout rows must store assignment and revision IDs at start time.
- Existing trainee notes remain trainee-owned workout fields.
- Coach feedback is read from a separate local table.

## Sync Strategy

Before coaching entities are added, split backend sync policy into:

- inbound client-writable entity types
- outbound/server-readable entity types
- server-authored read-only entity types

Why this is required:

- The trainee client must receive assigned plans and feedback through sync.
- The trainee client must not be allowed to mutate server-authored assigned plan rows.
- Trainer cross-user reads should not be represented as normal trainee sync on trainer devices.

Add a server-published sync writer:

- Backend service writes server-authored entities into `entity_state`.
- Backend appends matching rows to `change_log`.
- Published rows are scoped to the trainee owner.
- Published rows are eligible for trainee restore and incremental sync.
- Client writes to those read-only rows are rejected by `SyncService`.

Trainer-side read strategy:

- Trainer uses `/coaching/**` online APIs.
- Trainer mobile does not store trainee workout graphs in SQLite in v1.
- Trainer read responses are transient UI data.

## Assigned Plan Lifecycle

1. Trainer creates or edits a normal personal plan.
2. Trainer syncs the plan to the backend.
3. Trainer selects an active trainee relationship and assigns the synced plan.
4. Backend validates:
   - trainer account is active
   - relationship is active
   - source plan belongs to the trainer
   - source plan is present in backend `entity_state`
5. Backend creates assignment and revision 1.
6. Backend creates an immutable revision snapshot.
7. Backend publishes a read-only assigned plan tree into trainee owner scope.
8. Trainee syncs and can use the assigned plan offline.
9. Trainee starts workouts from the assigned plan.
10. Workout rows capture assignment and revision IDs.

Assigned plan editing:

- Trainer edits by creating a new immutable revision.
- Backend publishes the new revision as a new read-only plan tree where needed.
- Old revision is hidden/tombstoned for future starts.
- Existing in-progress and completed workouts continue to point at the revision used at start.

## Plan Revision Strategy

Rules:

- Every assignment starts with revision 1.
- Revisions are immutable.
- Editing an assigned plan creates a new revision.
- New revision should publish a new plan tree or new entity IDs where needed.
- Old revision is hidden or tombstoned for future starts.
- In-progress workouts continue against their original revision.
- Completed workouts keep `source_coach_assignment_id` and `source_plan_revision_id`.
- Historical workout data is never rewritten.

Design rationale:

- Plan structure changes should not silently alter completed workout history.
- Trainer review must know what the trainee was asked to do at the time.
- Offline devices may start workouts from a revision before learning about a newer revision.

Handling stale offline starts:

- If a trainee starts a workout from an older locally available revision, that workout remains valid and tied to that revision.
- Backend may later hide the old revision for future starts once the device syncs.

## Feedback Strategy

V1 feedback is workout-level only.

Flow:

1. Trainer opens an eligible workout through online coaching API.
2. Backend verifies the workout was performed from that trainer's assignment/revision.
3. Trainer posts feedback.
4. Backend stores typed `coach_feedback`.
5. Backend publishes a read-only feedback delta into trainee owner scope.
6. Trainee syncs and can read feedback offline.

Separation from trainee notes:

- Trainee workout notes remain trainee-owned fields.
- Coach feedback is not stored in `workout_note`, exercise `notes`, or set `notes`.
- Trainer never mutates trainee workout rows to leave feedback.

Deferred:

- Full chat.
- Set-level feedback.
- Threaded comments.
- Attachments.

## Revocation and Account Deletion Behavior

### Trainee Revokes Trainer Access

Expected behavior:

- Relationship becomes revoked immediately.
- Trainer read/write endpoints return 403 or 404.
- Active assigned plans are hidden/tombstoned for future starts.
- Trainee workout history remains.
- Historical coach feedback remains visible but marked as from a former coach unless a later retention policy changes.
- Trainer cannot post new feedback after revocation.

### Trainer Deletes Account

Expected behavior:

- Open invites are cancelled.
- Relationships are revoked.
- Active assigned plans are archived/tombstoned.
- Trainer-authored payloads are deleted or anonymized according to the final retention policy.
- Trainee workout history remains trainee-owned.

### Trainee Deletes Account

Expected behavior:

- Trainee sync data is deleted according to account deletion policy.
- Coaching relationships are revoked.
- Assignments, plan snapshots, and feedback payloads connected to the trainee are removed or anonymized as appropriate.
- Trainer access is revoked immediately.

Deletion and revocation logic should be added incrementally as each coaching table is introduced. It should not be left to final cleanup.

## Privacy / Security Notes

- Explicit consent is recorded when a trainee accepts a trainer invite.
- Trainer identity must be shown before acceptance.
- Invite codes must expire.
- Invite resolution and acceptance must be rate-limited.
- Invite code hashes, not raw reusable invite secrets, should be stored.
- Revocation must take effect immediately server-side.
- Trainer access should be limited to the minimum data needed for the coaching feature.
- Trainer can read only workouts from that trainer's assigned plan revisions in v1.
- Public documentation must not expose private credentials, tester identities, user data, private operational details, or secrets.
- Support and diagnostics must avoid raw tokens and private user payloads.

## Recommended PR Sequence

### PR 0 - Coaching Design Document

Goal: Record the public-safe coaching design before implementation.

Key touched areas:

- `docs/internal/coaching-design.md`

Test expectations:

- No app tests required unless docs tooling is introduced.

Acceptance criteria:

- Document captures scope, architecture, permissions, sync strategy, revocation/deletion behavior, and PR plan.
- Document contains no secrets or private operational details.

Main risk:

- Design can become stale if implementation diverges without updating the document.

### PR 1 - Backend Ownership Audit and Tests

Goal: Reconfirm current backend sync ownership boundaries before adding cross-user coaching access.

Key touched areas:

- Sync controller/service/repository tests.
- Ownership and parent-isolation test coverage.

Test expectations:

- Client-sent owner IDs do not affect sync scope.
- Foreign parent references are rejected.
- Entity ownership mismatch returns forbidden behavior.
- Completed workout immutability remains enforced.

Acceptance criteria:

- Current single-owner sync model is well covered before coaching changes.

Main risk:

- Audit may reveal pre-existing hardening gaps that need separate fixes.

### PR 2 - Split Sync Inbound/Outbound/Read-Only Entity Policy

Goal: Separate sync entity policy so server-authored read-only entities can be delivered without allowing client writes.

Key touched areas:

- Backend sync entity configuration.
- Sync validation.
- Snapshot and delta fetch allowlists.

Test expectations:

- Client-writable entities still work.
- Server-readable entities can appear in deltas.
- Read-only entities are rejected when submitted by clients.

Acceptance criteria:

- Backend can distinguish client-writable, outbound, and server-authored read-only sync entities.

Main risk:

- Misconfigured allowlists could break restore or accidentally permit client writes.

### PR 3 - Account Profile Foundation

Goal: Add account profile metadata used to show trainer identity before trainee acceptance.

Key touched areas:

- Backend profile table/service/API.
- Mobile account/profile client and minimal UI if needed.

Test expectations:

- Account-only access.
- Display name defaults safely when available.
- User can update TrainFrame display name.
- Deleted accounts cannot use profile endpoints.

Acceptance criteria:

- Invite resolution can show `account_profile.display_name` without exposing private account identifiers.

Main risk:

- Profile naming policy may need product refinement.

### PR 4 - Coaching Relationship/Invite Schema and Permission Service

Goal: Add typed coaching relationship foundations and central permission checks.

Key touched areas:

- Flyway coaching relationship/invite schema.
- Coaching repositories.
- `CoachingPermissionService`.

Test expectations:

- No guest coaching.
- Self-coaching blocked.
- Same account can be trainer in one relationship and trainee in another.
- Revoked relationships deny access.

Acceptance criteria:

- Permission service can answer trainer/trainee relationship access questions without exposing workout data yet.

Main risk:

- Modeling trainer as a global role instead of a relationship role would limit future behavior.

### PR 5 - Invite-Code Backend Flow

Goal: Implement backend invite-code creation, resolution, acceptance, rejection, expiry, and cancellation.

Key touched areas:

- `/coaching/invites/**` endpoints.
- Invite service/repository.
- Rate limiting.

Test expectations:

- Trainer creates invite.
- Trainee resolves invite and sees trainer display name.
- Trainee accepts or rejects.
- Expired/cancelled invites fail safely.
- Brute force protections exist.

Acceptance criteria:

- Active trainer access exists only after trainee acceptance.

Main risk:

- Invite resolution could leak trainer or account metadata if responses are too detailed.

### PR 6 - Account Deletion/Revocation Cascade for Relationship Tables

Goal: Ensure relationship and invite data reacts correctly to deletion and revocation.

Key touched areas:

- Account deletion service/repository.
- Coaching relationship/invite repositories.

Test expectations:

- Trainer account deletion cancels invites and revokes relationships.
- Trainee account deletion revokes trainer access.
- Repeated deletion/revocation is idempotent.

Acceptance criteria:

- No active coaching access survives relevant account deletion.

Main risk:

- Retention/anonymization policy may need additional legal/product decisions.

### PR 7 - Mobile Coaching Shell

Goal: Add mobile navigation and account-gated coaching entry points.

Key touched areas:

- Mobile navigation.
- Settings/account surfaces.
- Shared coaching UI shell.

Test expectations:

- Coaching surfaces require signed-in account state.
- Guest users are guided to sign in.
- No trainee data is shown yet.

Acceptance criteria:

- Mobile has trainer/trainee coaching entry points without enabling unsafe data access.

Main risk:

- UX may imply trainer access exists before acceptance.

### PR 8 - Mobile Invite Accept/Revoke and Trainer Invite Creation

Goal: Connect mobile invite flows to the backend.

Key touched areas:

- Mobile coaching API client.
- Invite creation screen.
- Invite resolve/accept/reject screen.
- Revoke access UI.

Test expectations:

- Trainer can create invite when signed in.
- Trainee can resolve, accept, reject, and revoke.
- Network failures show recoverable states.
- Guest is blocked.

Acceptance criteria:

- Users can establish and revoke coaching relationships from mobile.

Main risk:

- Invite codes entered on the wrong account need clear handling.

### PR 9 - Backend Server-Published Sync Writer

Goal: Let backend publish assigned plans and feedback into a trainee owner scope.

Key touched areas:

- Sync repository helper methods.
- Server-published sync service.
- Change log/entity state tests.

Test expectations:

- Server can publish rows to a target owner scope.
- Published rows appear in fresh restore and incremental sync.
- Published rows do not require client `op_ledger` entries.

Acceptance criteria:

- Backend has a safe mechanism for server-authored trainee sync data.

Main risk:

- Cursor and restore behavior can regress if published rows bypass normal invariants.

### PR 10 - Plan Assignment Backend with Immutable Revision Snapshot

Goal: Assign synced trainer plans to trainees through immutable revision snapshots.

Key touched areas:

- Assignment and revision schema.
- Snapshot builder from trainer `entity_state`.
- Assignment service/API.

Test expectations:

- Source plan must belong to trainer and be synced.
- Assignment requires active relationship.
- Revision 1 is immutable after creation.
- Custom exercise data is safely snapshotted.

Acceptance criteria:

- Backend can create assignment revision 1 and prepare publishable plan data.

Main risk:

- Snapshot structure may be too coupled to current mobile schema.

### PR 11 - Assigned-Plan Write Guards

Goal: Prevent malicious trainee writes to assigned plan rows.

Key touched areas:

- Backend `SyncService`.
- Coaching revision entity mapping.
- Mobile repository guards later depend on this.

Test expectations:

- Client attempts to mutate assigned `program*` rows are rejected.
- Client can still start and complete workouts from assigned plans.
- Trainer cannot mutate trainee workout rows.

Acceptance criteria:

- Backend enforces read-only assigned plan structure.

Main risk:

- Guard logic may accidentally block legitimate trainee workout logging.

### PR 12 - Mobile Assigned-Plan SQLite Migration and Delta Apply

Goal: Store assigned plan metadata and feedback-ready entities locally.

Key touched areas:

- Mobile SQLite migrations.
- `applyDeltas` table configs.
- Local repositories for assigned plans.

Test expectations:

- Assigned plan deltas apply on fresh restore.
- Read-only metadata persists.
- Old revisions can be hidden/tombstoned.

Acceptance criteria:

- Trainee device can receive assigned plan rows into SQLite.

Main risk:

- Ordered plan rows can collide with existing SQLite uniqueness constraints if IDs/order are not carefully generated.

### PR 13 - Mobile Trainee Assigned-Plan Display/Start

Goal: Let trainee see assigned plans, recognize they are read-only, and start workouts from them offline.

Key touched areas:

- Plans list/detail screens.
- Plan session picker.
- Workout session creation.
- Plan edit repositories.

Test expectations:

- Assigned plan is visible offline.
- Edit controls are disabled or blocked.
- Starting workout records assignment and revision IDs.
- Personal plan behavior remains unchanged.

Acceptance criteria:

- Trainee can train from assigned plans offline without editing plan structure.

Main risk:

- Some existing edit path may bypass UI and mutate assigned plan rows unless repository guards are complete.

### PR 14 - Trainer Online Read Endpoints

Goal: Let trainer read eligible trainee workouts through online APIs.

Key touched areas:

- `/coaching/**` read endpoints.
- JSON-state query/projection repository.
- Permission service.

Test expectations:

- Trainer can read workouts from own assigned revisions.
- Trainer cannot read trainee Quick Workouts.
- Trainer cannot read trainee personal plans.
- Revoked relationships deny access.
- Client-sent owner IDs are ignored.

Acceptance criteria:

- Trainer review data is available online without offline trainer caching.

Main risk:

- JSONB queries may need indexing or projection tables as data volume grows.

### PR 15 - Mobile Trainer Workout Review Screen

Goal: Add online-only mobile trainer review UI.

Key touched areas:

- Mobile coaching API client.
- Trainer trainee list/details.
- Workout review screen.

Test expectations:

- Review data is fetched online.
- No trainee workout graph is persisted to trainer SQLite in v1.
- Offline state is clear.

Acceptance criteria:

- Trainer can review eligible completed trainee workouts from mobile.

Main risk:

- Accidental local persistence of trainee data could violate v1 privacy goals.

### PR 16 - Workout-Level Feedback Backend

Goal: Add trainer-authored workout-level feedback.

Key touched areas:

- `coach_feedback` schema.
- Feedback service/API.
- Server-published sync writer.
- Permission service.

Test expectations:

- Trainer can post feedback only on eligible workouts.
- Revoked relationships deny feedback.
- Feedback publishes to trainee scope.
- Trainer cannot mutate workout rows.

Acceptance criteria:

- Feedback is stored separately from trainee notes and delivered to trainee sync.

Main risk:

- Feedback retention/anonymization behavior needs consistency with account deletion policy.

### PR 17 - Mobile Feedback UI

Goal: Let trainers post workout-level feedback and trainees read it offline.

Key touched areas:

- Trainer workout review feedback composer.
- Trainee feedback display.
- Local feedback read/unread state.

Test expectations:

- Trainer can post feedback online.
- Trainee can read synced feedback offline.
- Existing trainee notes remain unchanged.
- Revoked relationship behavior is clear.

Acceptance criteria:

- End-to-end workout-level feedback works without full chat.

Main risk:

- Users may expect chat semantics; UI should present feedback as contextual review.

### PR 18 - End-to-End Hardening

Goal: Validate full MVP flow and close permission gaps.

Key touched areas:

- Backend integration tests.
- Mobile integration/unit tests around coaching flows.
- Documentation updates.

Test expectations:

- Invite -> accept -> assign -> sync -> log -> review -> feedback -> revoke -> delete.
- Permission failures return safe errors.
- Deleted accounts cannot retain active coaching access.

Acceptance criteria:

- Coaching MVP is coherent, tested, and documented before broader rollout.

Main risk:

- Cross-feature edge cases may expose missing cascade or stale sync behavior.

### PR 19 - Optional Push Notifications

Goal: Add notifications for invites, assignments, and feedback after core behavior is stable.

Key touched areas:

- Notification registration.
- Backend notification publisher.
- Mobile notification handling.

Test expectations:

- App remains fully usable without notifications.
- Denied notification permission does not block coaching.
- Notification payloads do not include sensitive workout details.

Acceptance criteria:

- Push improves timeliness but is not required for correctness.

Main risk:

- Notification infrastructure can expand scope and operational complexity if introduced too early.

## Open Questions / Future Decisions

- Should former coach feedback always remain visible after revocation, or should trainees be able to hide it?
- What exact display-name editing rules should apply to `account_profile.display_name`?
- Should assignment revisions copy trainer custom exercises into trainee-scope exercise rows or rely entirely on plan snapshots?
- Should trainer read APIs use JSONB queries long term or introduce typed workout projections?
- How should retention/anonymization differ between trainer-authored feedback and trainee-authored workout notes?
- Should future full chat be relationship-level, assignment-level, or workout-contextual?
- Should a later web dashboard share the same `/coaching/**` APIs or introduce separate web-optimized projections?
- What additional consent text is required before public launch?
