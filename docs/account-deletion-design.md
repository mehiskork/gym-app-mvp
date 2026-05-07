# Account Deletion Design

TrainFrame needs a clear account deletion path for release readiness and user trust. This document defines the intended behavior before implementation so the backend, mobile app, and Play readiness work can be reviewed against the same target.

This is a design document only. It does not implement account deletion.

## Purpose

Provide a user-accessible way to delete a TrainFrame account and its synced TrainFrame data. The flow should be explicit, authenticated, irreversible, and safe against deleting the wrong account.

The design must respect the current architecture:

- Firebase is used for Auth only.
- Backend PostgreSQL owns synced account data.
- Mobile SQLite is the runtime source of truth on device.
- Guest mode exists.
- Account mode uses Firebase account JWT / `account_jwt`.
- Guest -> Google account migration exists.
- Account switch on the same device requires destructive local reset.
- The app does not support multi-account local storage.

## Scope

For TrainFrame, "delete account" means:

- Delete backend account-owned synced TrainFrame data.
- Delete, tombstone, or invalidate TrainFrame identity-link and account ownership records according to the chosen retention policy.
- Invalidate the account association for this app.
- After backend deletion succeeds, clear local SQLite data, auth state, session state, device/session credentials, and account credentials on this device.
- Return the app to a fresh guest-start state.

Deleting a TrainFrame account does not delete the user's Google account or Firebase account globally.

## Out Of Scope

Account deletion does not:

- Delete the user's Google account.
- Delete Firebase project/global identity outside TrainFrame app usage.
- Affect unrelated apps that use the same Google account.
- Preserve multiple account profiles in local SQLite.
- Provide partial per-plan, per-session, or per-category deletion.
- Implement account deletion in this PR.
- Change backend sync/auth behavior, mobile sync behavior, schemas, or migration logic in this PR.

## Guest Users

Guest-only users do not have a cloud account deletion flow because they have not linked a Google account to TrainFrame.

Intended guest behavior:

- Local reset clears guest local SQLite data and device-local auth/session material on this device.
- Guest device/server records may be cleaned up later through retention or admin cleanup.
- If guest data has synced to the backend through device-token sync, local reset alone may leave server-side guest-scoped sync records.

Open release question: before public launch, decide whether guest server data needs self-service deletion or whether retention/admin cleanup is acceptable for guest-only data.

## Account Users

Signed-in Google/account users should delete their TrainFrame account through an authenticated account flow.

Required behavior:

- The user must be authenticated with a valid Firebase account JWT.
- The backend derives the account owner from the authenticated principal.
- The backend must never trust client-sent `userId`, `accountId`, `guestUserId`, or owner fields for deletion.
- Deletion removes or tombstones account-owned TrainFrame data.
- Backend deletion must be transactionally scoped to the principal-derived owner.
- After successful backend deletion, mobile clears local SQLite, SecureStore auth/session material, account state, and device/session credentials.
- If backend deletion fails, mobile must keep local data/session state and show friendly recovery copy.
- After successful local cleanup, the app returns to a fresh guest-start state.

## Data Inventory

Deletion handling should be explicit for each category.

| Data category | Intended handling |
|---|---|
| Synced workout data/entities | Delete or tombstone all account-owned TrainFrame entities for the principal-derived owner. Exact hard-delete vs tombstone choice is open. |
| `entity_state` | Delete or tombstone account-owned rows for the deleted owner. |
| `change_log` | Delete, tombstone, or retain only minimal non-user audit metadata according to the retention decision. Must not continue serving deleted account data through sync. |
| `op_ledger` | Delete or retain minimal dedupe/audit records according to the retention decision. Must not retain user payloads if the deletion policy requires erasure. |
| `identity_link` | Remove or invalidate links between guest owners and the deleted account owner. |
| Claim / guest migration audit records | Delete, tombstone, or retain minimal security/audit rows according to the retention decision. |
| `device` records | Remove, invalidate, or detach devices associated only with the deleted account, subject to guest/account ownership modeling. |
| `device_token` records | Revoke/delete tokens associated with the deleted account flow where applicable. |
| Local SQLite data | Clear only after backend deletion succeeds. |
| SecureStore account/session material | Clear only after backend deletion succeeds. Includes account tokens/session secrets and device/session credentials used by this app. |
| Support bundles already shared outside the app | Not recallable. The app should continue avoiding raw auth tokens/secrets in support bundles. |

## Recommended Implementation Shape

Split implementation into small PRs.

### PR A: Backend Deletion Endpoint

Add a backend deletion endpoint, for example `DELETE /me` or `DELETE /account`.

Requirements:

- Firebase account JWT required.
- Principal-derived owner only.
- No client-sent owner/user/account id accepted.
- Transactionally delete or tombstone account-owned data.
- Revoke or invalidate TrainFrame account association.
- Return structured success/error responses.
- Be idempotent: repeating deletion for the same authenticated deleted account should return a safe success or stable deleted/not-found response without leaking data.
- Tests must cover ownership, idempotency, auth failures, and data removal boundaries.

### PR B: Mobile Deletion UI

Add Settings -> Delete account.

Requirements:

- Strong confirmation copy.
- Optional typed confirmation if desired.
- Call the backend deletion endpoint with the current account JWT.
- On success, clear local SQLite/auth/session/device state using the existing destructive local reset machinery where appropriate.
- On failure, keep local data/session state and show friendly error copy.
- Do not support account switching without local reset.
- Do not attempt multi-account local storage.

### PR C: External Web Deletion Request Path

For Google Play readiness, TrainFrame should provide a web-accessible account/data deletion request resource in addition to the in-app deletion flow or in-app deletion link. This gives users a deletion path even if they no longer have the app installed.

Requirements:

- Provide a public web page, support form, or documented support email process for deletion requests.
- Clearly explain that deleting TrainFrame data does not delete the user's Google account.
- Identify the account safely.
- Do not ask users to send passwords, raw tokens, private keys, keystores, or support bundles through an insecure path.
- Use a manual support process until automated web deletion exists.
- Link this resource from the privacy policy and Play Console data deletion fields when ready.

## Open Decisions

Decide these before coding:

- Hard delete vs tombstone for backend synced entities.
- Retention period for audit, claim, rate-limit, and security records.
- Whether guest server data needs self-service deletion before public launch.
- Exact endpoint name: `DELETE /me`, `DELETE /account`, or another route.
- Whether deletion requires recent login / Google re-auth.
- Whether to provide web deletion request before or after in-app deletion.
- Privacy policy URL and in-app/web location.
- Whether account deletion should revoke all device tokens for devices linked through the deleted account.
- Whether deleted account owners can later recreate a fresh TrainFrame account with the same Google account.

## Recommended Initial Direction

For private beta / first public release, the recommended starting policy is:

- Hard-delete user workout/domain data.
- Retain only minimal non-payload security/audit metadata where legally or operationally necessary.
- Do not retain user workout payloads after account deletion.
- Make deletion idempotent.
- Allow the same Google account to create a fresh TrainFrame account later unless abuse controls require otherwise.

This is a recommendation for the implementation PRs, not an implemented decision in this document.

## Proposed User-Facing Copy

Settings title:

```text
Delete TrainFrame account?
```

Confirmation body:

```text
This permanently deletes your synced TrainFrame data from our servers. It also clears TrainFrame data and account credentials from this device. This does not delete your Google account. This action cannot be undone.
```

Cancel:

```text
Cancel
```

Confirm:

```text
Delete account
```

Failure:

```text
Couldn't delete your account. Check your connection and try again.
```

Success:

```text
Your TrainFrame account was deleted.
```

## Tests Required

Backend tests:

- Unauthenticated deletion is rejected.
- Invalid token is rejected.
- Expired token is rejected.
- Backend derives owner from authenticated principal only.
- Client-sent owner/user/account ids are ignored or rejected.
- A user cannot delete another account's data.
- Deletion removes/tombstones synced workout data for the correct owner.
- `entity_state`, `change_log`, and `op_ledger` handling matches the chosen retention policy.
- `identity_link` and claim records are removed/tombstoned according to the chosen policy.
- Device/device-token handling matches the chosen invalidation policy.
- Deletion is idempotent.
- Structured success/error responses are stable and do not leak data.

Mobile tests:

- Delete account is visible only for signed-in/account users, not guest-only users.
- Confirmation copy is explicit and destructive.
- Cancel does not call backend deletion.
- Confirm calls the deletion endpoint with account auth.
- Local reset runs only after backend success.
- Backend failure does not clear local SQLite or SecureStore state.
- Session-expired and wrong-account cases show friendly copy.
- Success returns the app to a fresh guest-start state.
- Support bundle does not expose raw auth tokens before or after deletion.
