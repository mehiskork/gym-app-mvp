# Account Ownership and Sync Scope Decision

- **Status:** Accepted (target model for PR 7+)
- **Date:** 2026-03-31
- **Owner:** Gym App MVP maintainers
- **Decision type:** Architecture / identity and sync ownership

---

## Context

We are about to begin real account/auth work. Before implementing auth providers or account-scoped sync, we need to freeze the canonical ownership model so future work does not pull in conflicting directions.

Current system behavior is intentionally local-first:

- Mobile SQLite is the runtime read source and local writes happen first.
- Outbox is the transport intent layer.
- Backend is the cross-device conflict arbiter via `/sync`.

This decision does **not** implement full auth. It defines the ownership model that auth, migration, and sync-scope work must follow.

---

## Current state in this repo

### Backend identity and sync scope today

- Device bearer auth resolves a `DevicePrincipal` containing `deviceId` and `guestUserId`.
- `SyncController` passes principal-derived guest identity into `SyncService`.
- Sync persistence/query surfaces are guest-scoped today (`entity_state`, `change_log`, `op_ledger` keyed by `guest_user_id`).
- Ownership enforcement is already server-side and principal-derived.

### Guest/device bootstrap today

- Device registration creates or reuses a device identity and returns device auth material plus guest identity.
- Mobile bootstrap stores device/account-adjacent metadata locally and uses it to establish guest-mode sync.

### Claim/link seams today

- Claim start is device-authenticated.
- Claim confirm is currently a guarded/dev-oriented bridge, not real account auth.
- `identity_link (guest_user_id -> user_id)` already exists as a transitional seam.

### Mobile local ownership assumptions today

- Local outbox and metadata already contain some user/device ownership seams.
- The app can represent guest vs linked/account-adjacent state locally.
- Local-first write behavior is already structurally separated from remote identity resolution.

---

## Decision

## 1) Canonical owner after login

**After authenticated login exists, account user identity becomes the canonical sync owner.**

- In account mode, the canonical owner key is the authenticated account user id derived from the backend principal.
- Guest identity is no longer the long-term owner once account mode is active.
- Device identity remains transport/security context (device registration, token/session binding, rate-limit context), not the durable data ownership namespace.

For clarity: canonical owner identity and authentication credentials are different concerns. Device ids, device tokens, sessions, and access tokens are authentication or transport artifacts and must not be treated as ownership identifiers.

## 2) Guest/device identity becomes bootstrap-only

In this codebase, **bootstrap-only** means:

- Used to initialize a brand-new install/device before account login exists.
- Used to obtain initial device auth and enable guest-mode sync.
- Used for pre-login ownership only.
- Not allowed to override account ownership once authenticated account mode is active.
- Not accepted as a client-controlled way to choose account sync scope.

Concretely: guest scope continues to exist for pre-login and transition, but account-scoped ownership wins immediately for authenticated account mode.

## 3) Claim/link role going forward

Claim/link is **not primary auth**.

It becomes:

- **Transitional migration tooling:** attach existing guest-owned history to an authenticated account during rollout.
- **Device-linking aid:** optionally connect an already-existing guest/device history namespace to an authenticated account.

It is **not** the steady-state sign-in mechanism once real auth exists.

## 4) Canonical sync scope after accounts

- **Guest mode:** sync scope = guest owner id.
- **Account mode:** sync scope = authenticated account owner id derived from backend principal.

Both modes may coexist during transition, but each `/sync` request is processed under exactly one server-resolved owner scope: guest scope or account scope, never both.

No client-supplied `userId`, owner field, or local flag may choose sync scope.

## 5) Backend source of truth for identity

Backend ownership and sync scope must be derived from the authenticated security principal, never from client payload ownership identifiers.

This preserves and extends the current trust boundary where `/sync` already relies on server-derived identity rather than client ownership claims.

## 6) Logout and account-switch policy (MVP)

To avoid premature multi-account complexity on one device, MVP uses a conservative safety-first policy:

- **Logout:** clear authenticated session state and reset user-scoped local sync state/data before returning to guest/bootstrap state.
- **Re-login as same user:** treated as normal sign-in after reset, or no-op if still authenticated.
- **Different user on same device:** require explicit logout/reset before sign-in.

This keeps ownership boundaries simple and prevents accidental local data cross-contamination.

## 7) Migration direction (guest -> account)

Recommended staged direction:

1. Introduce authenticated account principal support in backend auth flow.
2. Introduce server-side owner-resolution vocabulary/abstraction so sync internals are not permanently hard-coded to guest naming.
3. On first authenticated account bind, run controlled migration/link of existing guest scope into account scope.
4. Keep guest mode operational for users who have not signed in yet.
5. De-emphasize claim-confirm dev-oriented behavior as real auth arrives.

Guest-to-account migration must be retry-safe and must not duplicate, orphan, or cross-assign ownership.

## 8) Invariants / non-negotiables

Future work must preserve:

1. Local-first writes remain unchanged (domain write + outbox enqueue in one SQLite transaction).
2. Backend determines sync ownership scope from authenticated principal.
3. Client cannot escalate ownership by sending `userId` or owner fields.
4. `/sync` remains the existing cursor + ack + delta protocol with current reliability semantics.
5. Guest mode continues to work during transition.
6. Account mode does not weaken current ownership enforcement guarantees.
7. Any guest-to-account migration path is idempotent, retry-safe, and conflict-safe.
8. Logout/account-switch UX prioritizes safety over multi-account convenience for MVP.
9. Device identity remains transport/security context, not canonical post-login ownership.

---

## Rationale

- Aligns with strategic direction: real accounts become first-class durable owners.
- Preserves the proven local-first architecture while changing identity source rather than rewriting sync behavior.
- Keeps trust boundaries strong by preventing client-selected ownership scope.
- Reduces migration risk by allowing staged coexistence of guest mode and account mode.
- Avoids overengineering multi-account local storage before it is clearly needed.

---

## Implications

### Backend

- Introduce principal-aware owner resolution for guest vs account modes.
- Evolve schema/query surfaces away from guest-only assumptions toward owner-scope semantics.
- Keep the sync/conflict model intact; change identity source first, not the core sync algorithm.

### Mobile

- Keep SQLite local-first and outbox behavior unchanged.
- Treat authenticated account session as the authoritative identity context when present.
- Add safe logout/reset behavior as the default MVP account-switch mechanism.

### Product / UX

- Guest onboarding still works.
- Account onboarding becomes an explicit upgrade path from guest mode.
- Clear user messaging is required for logout/reset and account-switch behavior.

---

## Transition plan

- **PR 7:** decide auth approach and prove backend/mobile principal flow in a narrow spike; introduce owner-scope vocabulary where needed.
- **PR 8:** move sensitive mobile credentials/session material to secure storage.
- **PR 9:** add backend account principal foundation and owner-resolution abstraction.
- **PR 10:** add principal-derived owner-scope routing in sync internals while preserving guest/device `/sync` behavior; defer external account-authenticated `/sync` enablement if auth composition is not yet clean.
- **PR 11:** implement explicit sync transport seam for account-authenticated `/sync` (no fake device IDs), while keeping guest/device sync stable.
- **PR 12+:** implement idempotent guest-to-account migration/link flow.
- **PR 13+:** add MVP logout/reset and account-switch UX/policy enforcement on mobile.

### PR 9 implementation note (foundation only)

PR 9 introduces a lightweight backend owner-resolution seam:

- `OwnerScope` value object (`guest` or `account` + owner id)
- `PrincipalOwnerResolver` principal-to-owner mapper for `DevicePrincipal` and `AccountPrincipal`
- `SyncService` now executes through owner-scoped internals while `/sync` still enters through guest/device auth only
- `SyncRepository` remains guest-keyed in SQL/schema and adds owner-named adapter methods for future account scope wiring

No `/sync` protocol changes are part of PR 9, and no account-scoped `/sync` behavior is enabled yet.

---

## Rejected alternatives

1. **Keep guest identity as permanent canonical owner after account login**
   - Rejected: conflicts with real-account direction and makes account-level ownership ambiguous.

2. **Let client send `userId` to choose sync scope**
   - Rejected: breaks trust boundary; ownership must remain principal-derived and server-enforced.

3. **Build full multi-account local storage now**
   - Rejected: too much complexity for MVP; conservative reset policy is safer.

4. **Remove guest mode immediately when auth ships**
   - Rejected: creates a risky migration cliff; staged coexistence is safer.

5. **Use device identity as canonical owner after login**
   - Rejected: device identity is transport/security context, not portable ownership, and cannot support correct multi-device account behavior.

---

## Open questions for PR 7+

1. Exact backend schema evolution shape: additive owner-scope columns/abstraction vs broader renaming.
2. Exact one-time migration mechanics, rollback posture, and operational telemetry.
3. Whether guest-to-account migration should always auto-merge or require explicit confirmation in edge cases.
4. Long-term policy for optional multi-account support on one device after MVP.
5. Exact observability needed to detect migration failures and ownership mismatches.

### PR 10 implementation note (safe foundation)

PR 10 keeps the externally exposed `/sync` authentication path device-token based while moving sync entry/service logic to resolve ownership via backend principal-to-owner mapping seams.

- `SyncController` resolves `OwnerScope` from principal type (`DevicePrincipal`/`AccountPrincipal`).
- `SyncService` executes owner-scoped repository flows and keeps owner selection server-derived.
- Client payload ownership fields (for example `userId`) remain non-authoritative.
- No guest->account migration is implemented in this PR.
- No sync protocol shape change is implemented in this PR.

### PR 12 implementation note (guest -> account move/re-scope)

PR 12 implements a **server-driven move/re-scope** migration during claim confirmation.

- Trigger: `/claim/confirm` after server-side claim validation + `identity_link` upsert.
- Owner pair source: server-validated `claim.guest_user_id` + linked `user_id` only.
- Client payload owner fields remain non-authoritative.

Migration behavior:

1. Register a migration attempt in `guest_account_migration_audit` for `(guest_user_id, user_id)`.
2. If this pair already has `completed_at`, short-circuit (idempotent retry no-op).
3. Move sync ownership from guest -> account in:
   - `entity_state`
   - `change_log`
   - `op_ledger`
4. Mark migration completed with moved-row counters and conflict counters.

Deterministic conflict rule (no merge engine):

- If both guest and account already have the same `entity_state` identity (`entity_type`, `entity_id`), winner is the row with newer `last_received_at`.
- Ties keep the incoming guest row (`>=` comparison).
- Conflict occurrences are counted in `guest_account_migration_audit.entity_conflicts_resolved`.

Non-goals retained in PR 12:

- No `/sync` protocol redesign.
- No client-controlled owner reassignment.
- No broad schema rewrite (single additive audit table only).
- No logout/account-switch UX changes.
- Guest-only users remain on existing guest sync behavior.