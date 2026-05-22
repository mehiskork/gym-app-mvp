# Account Deletion Design

This document records the implemented TrainFrame account deletion/recreation behavior and the remaining Play production decisions.

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
- Allow the same Google/Firebase identity to recreate a fresh TrainFrame account after fresh auth without restoring deleted data.

Deleting a TrainFrame account does not delete the user's Google account or Firebase account globally.

## Out Of Scope

Account deletion does not:

- Delete the user's Google account.
- Delete Firebase project/global identity outside TrainFrame app usage.
- Affect unrelated apps that use the same Google account.
- Preserve multiple account profiles in local SQLite.
- Provide partial per-plan, per-session, or per-category deletion.
- Preserve old deleted account data for same-Google recreation.

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
| Synced workout data/entities | Hard-delete account-owned TrainFrame entities for the principal-derived owner and linked claimed guest scopes. |
| `entity_state` | Hard-delete account-owned rows and linked claimed guest rows. |
| `change_log` | Hard-delete account-owned rows and linked claimed guest rows so old cursor replay cannot return deleted data. |
| `op_ledger` | Hard-delete account-owned rows and linked claimed guest rows. |
| `identity_link` | Remove links for the deleted account owner. |
| Claim / guest migration audit records | Remove rows for the deleted account owner and linked claimed guest scopes. |
| `device` records | Delete devices for linked claimed guest scopes. |
| `device_token` records | Delete tokens for devices in linked claimed guest scopes. |
| `account_identity` | Keep Firebase subject mapping and advance active owner/generation on recreation; use `auth_time_cutoff` to block stale old sessions. |
| Local SQLite data | Clear only after backend deletion succeeds. |
| SecureStore account/session material | Clear only after backend deletion succeeds. Includes account tokens/session secrets and device/session credentials used by this app. |
| Support bundles already shared outside the app | Not recallable. The app should continue avoiding raw auth tokens/secrets in support bundles. |

## Implemented Behavior

### Backend `DELETE /me`

TrainFrame implements authenticated account deletion at `DELETE /me`.

- Firebase account JWT is required.
- Owner scope is derived from the authenticated principal.
- The endpoint has no request body and ignores client-sent owner/user/account ids.
- Deletion is transactional and idempotent.
- The backend hard-deletes account-owned and linked claimed guest sync rows.
- The backend also writes an active `account_deletion_tombstone` row keyed by the derived account owner id.
- Account `/sync`, `GET /me`, and `/claim/confirm` return `410 ACCOUNT_DELETED` for stale/deleted account sessions that do not pass the active identity checks.
- Same Google/Firebase subject recreation is supported through `account_identity` incarnations. A recreated account receives a new active TrainFrame owner id.
- Old deleted account rows must not restore into the recreated account.
- Stale old sessions/tokens are blocked by `auth_time_cutoff`/active-owner checks and must not write into the recreated owner.
- Tombstone protection applies only to deletions performed after the tombstone migration is deployed.

### Mobile Settings Deletion

TrainFrame implements in-app deletion under `Settings -> Delete account` for signed-in users.

- The app requires typed destructive confirmation.
- Mobile calls `DELETE /me` with account JWT only and requires exactly `204 No Content`.
- Sync is paused, scheduled sync is canceled, and in-flight sync is awaited before deletion.
- SQLite and SecureStore cleanup only run after backend success.
- A durable local cleanup marker completes local cleanup on next startup if the app crashes after backend success.
- Backend deletion failure preserves SQLite, SecureStore, account session, and device credentials and resumes sync for retry.
- If a stale signed-in install later receives `410 ACCOUNT_DELETED` from account `/sync`, mobile invalidates the account session, signs out of Google best-effort, runs the same guest-bootstrap local cleanup path, and resumes as a fresh guest without retrying old account outbox ops.
- If guest `claim/confirm` receives `410 ACCOUNT_DELETED`, mobile preserves guest SQLite data, invalidates/signs out of the attempted account session, resumes guest sync, and tells the user to contact support if they want to use that Google account again.

### Public Web Deletion Resource

TrainFrame exposes a public deletion request resource:

- `GET /account-deletion`
- `POST /account-deletion/request`

The page explains the in-app deletion path, the manual web request path, and that deleting TrainFrame account data does not delete the user's Google account. It instructs users that the web form does not automatically delete data, manual requests are processed within 30 days, and passwords, JWTs, Firebase tokens, device tokens, keystores, private keys, and other secrets must not be sent. Support bundles are not needed for deletion requests.

The public page uses the configured support email and a `mailto:` link as the actual manual request path. It tells users what to include and to copy/paste the support email if `mailto:` does not open. The legacy public POST endpoint accepts the same minimal form fields but does not delete account data directly and does not claim an in-browser request was received; it returns email instructions instead. Email alone is not sufficient authentication for automatic deletion.

The support destination is configured with:

```text
TRAINFRAME_SUPPORT_EMAIL=trainframe1@gmail.com
```

Production-like profiles must configure a real support address. Missing, blank, placeholder, or `.invalid` values are rejected in production-like mode.

## Open Decisions

Decide these before Play production submission:

- Retention period for audit, claim, rate-limit, and security records.
- Whether guest server data needs self-service deletion before public launch.
- Whether deletion requires recent login / Google re-auth.
- Privacy policy URL and public hosting domain for Play Console fields.
- Manual support SLA / reasonable processing expectation for web deletion requests.
- Whether a stronger TrainFrame app session architecture is needed beyond the current account identity incarnation/auth-time cutoff model.

## Recommended Initial Direction

For private beta / first public release, the implemented starting policy is:

- Hard-delete user workout/domain data.
- Retain only minimal non-payload security/audit metadata where legally or operationally necessary.
- Do not retain user workout payloads after account deletion.
- Make deletion idempotent.
- Support same-Google recreation after fresh auth while keeping deleted data isolated from the new owner.

The public web form is a manual support request path, not an automatic unauthenticated deletion mechanism.

## Support Tombstone / Incarnation Runbook

`ACCOUNT_DELETED` means the current request is using a stale/deleted account owner or a Firebase token whose `auth_time` is not fresh enough for the active account identity. This is expected after in-app account deletion and prevents stale authenticated sync replay from offline devices.

Support/admin may clear a tombstone only manually in PostgreSQL if needed for an operational issue. Do not add a public tombstone-clear endpoint for v1.

Before clearing a tombstone, support must instruct the user to reset, uninstall, or sign out from all old TrainFrame installs. Clearing tombstones without understanding the current `account_identity` row can re-open stale replay paths.

Manual clear example:

```sql
UPDATE account_deletion_tombstone
SET cleared_at = now(),
    cleared_by = 'support',
    clear_reason = 'user requested same-Google recreation after confirming all old installs were reset'
WHERE account_owner_id = '<issuer>|<subject>'
  AND cleared_at IS NULL;
```

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
- Recreating with the same Google account creates/uses a new active TrainFrame owner and does not restore deleted data.
- Stale old account tokens/sessions cannot write into the recreated account owner.
