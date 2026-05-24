# Android Tester and Play Readiness Runbook

## Purpose

Use this runbook to prepare and validate Android TrainFrame builds before wider Play testing. It is operational documentation only; it does not change app, backend, Firebase, or EAS behavior.

## Build Profiles

Preview builds are for direct Android device install and private QA. Production/Play build and signing details are canonical in [Android release baseline](./android-release.md).

```bash
cd apps/mobile
npx -y eas-cli@latest build -p android --profile preview --clear-cache
```

Play closed-testing builds use the `production` EAS profile from [Android release baseline](./android-release.md#build-profiles). That profile outputs an AAB, uses `https://www.trainframe.eu`, and targets EAS Update channel `production`.

Build identity, shared by preview and production:

- App display name: `TrainFrame`
- Expo slug: `mobile`
- Android package: `com.mehka.gymappmvp`
- Initial Android `versionCode`: `1`

Do not change Expo slug from `mobile` unless deliberately migrating the EAS project and credentials. Android `versionCode` must increase for every Play upload. See [Android release baseline](./android-release.md) for signing, fingerprints, API restrictions, Play App Signing, and production AAB status.

## Pre-Build Checklist

Before building:

- Backend `/ready` is green for the target environment.
- Backend uses the expected Java/runtime profile.
- Firebase Android app package is `com.mehka.gymappmvp`.
- `google-services.json` belongs to Firebase project `gym-app-mvp-1d7f0`.
- Firebase SHA-1 and SHA-256 fingerprints are added for the relevant signing certificate.
- Firebase API key restrictions have been externally verified and are rechecked after signing changes.
- Production public pages are reachable:
  - `https://www.trainframe.eu/privacy`
  - `https://www.trainframe.eu/terms`
  - `https://www.trainframe.eu/account-deletion`
- Support contact is `trainframe1@gmail.com`.

## Android Smoke Test Checklist

### Fresh install

- Install the app.
- Confirm the app name shows `TrainFrame`.
- Confirm icon and splash render correctly.
- Confirm startup reaches the home screen.
- Confirm seeded exercises are visible.

### Guest mode

- Create a plan.
- Add a session.
- Add an exercise.
- Add planned sets.
- Delete a session from a plan and confirm the plan remains usable.
- Open a zero-session plan and confirm the empty state shows Add session.
- Create a custom exercise.
- Start a Quick Workout.
- Start a Planned Workout.
- Complete the workout.
- Verify history appears.
- Verify PR/history behavior if easily visible.
- In the exercise picker, confirm the bottom-pinned CTA says `Create a custom exercise`, uses secondary styling, and opens Create Exercise.

### Templates

- Open Templates.
- Confirm the list is browse/preview-only.
- Open a Template preview.
- Confirm preview is read-only and shows sessions/exercises.
- Import from preview.
- Reopen the same Template preview and confirm duplicate import is disabled or shown as already added.

### Sync

- Verify guest outbox drains when online.
- Put the device offline.
- Make a local change.
- Reconnect.
- Verify sync completes after foreground/outbox trigger.

### Guest -> Google account

- Continue/sign in with Google.
- Confirm claim/migration succeeds after guest outbox is acked.
- Confirm data remains visible after sign-in.
- Confirm local guest data is added/merged into the selected Google account.
- Confirm existing cloud data for that Google account is preserved.
- Confirm account sync mode becomes `account_jwt` where Debug exposes it.
- Confirm there is no fallback to device token after a linked account session.
- Confirm sync cursor resets before first account sync after successful claim where Debug/support output exposes it.

### Reconnect

- Clear/reinstall or reset local data if needed.
- Sign in with the same Google account.
- Confirm synced data restores.
- Confirm direct Account A -> Account B switch requires destructive reset and does not keep multi-account local storage.
- Confirm missing guest device-token recovery by clearing guest credentials where safe, triggering sync, and verifying device registration recovers without restarting the app.

### Notifications

- On a fresh install, confirm unfinished workout reminders are not presented as active before OS notification permission is granted.
- Turn unfinished reminders on and confirm the app requests notification permission.
- Deny or revoke permission and confirm unfinished reminders stay off/blocked and scheduling skips safely.
- Grant notification permission and confirm rest timer notifications can be scheduled from an active workout.

### Online sync edits

- Start an active workout while online.
- Edit sets, session exercises, and session state.
- Confirm `workout_set`, `workout_session_exercise`, and `workout_session` edits sync without stale remote deltas overwriting the active local workout.

### Account deletion/recreation

- Delete a signed-in TrainFrame account from Settings.
- Recreate/sign in again with the same Google account after fresh auth.
- Confirm deleted account data does not restore.
- Confirm stale old sessions/tokens cannot write into the recreated account owner.
- Confirm `/account-deletion` is reachable for users who cannot access the app.

### Support

- Export a support bundle.
- Confirm the privacy warning appears.
- Confirm the filename starts with `trainframe_support_`.
- Confirm the bundle does not contain raw auth tokens or secrets.

## Backend Smoke Commands

For preview direct-install QA, use the direct Railway preview/dev QA endpoint:

```bash
BASE="https://gym-app-mvp-production.up.railway.app"
curl -i "$BASE/health"
curl -i "$BASE/ready"
curl -i "$BASE/me"
curl -i "$BASE/me" -H "Authorization: Bearer invalid-token"
```

Expected high-level behavior:

- `/health` returns `200`.
- `/ready` returns healthy database, Flyway, and required-table status.
- `/me` without auth is unauthorized.
- `/me` with an invalid token is unauthorized.

Do not hardcode fragile full JSON assertions in manual runbooks.

For Play closed-testing production AAB validation, use:

```bash
BASE="https://www.trainframe.eu"
curl -i "$BASE/health"
curl -i "$BASE/ready"
```

## Known Destructive Actions

- Reset local data clears this device only.
- Account switch on the same device requires destructive local reset.
- Delete plan syncs deletion across devices but does not delete workout history.
- Delete account deletes synced TrainFrame account data through account-JWT-only `DELETE /me`.
- Deleting a TrainFrame account does not delete the user's Google account.

## Support Bundle Privacy

Support bundles may contain diagnostic IDs, sync status, local counts, and error metadata.

Support bundles should not contain:

- raw auth tokens
- passwords
- private keys
- keystores

Testers should share support bundles only with TrainFrame support. Already shared support bundles cannot be recalled.

## Play Readiness Notes

Before Play production:

- Production build outputs AAB.
- Production EAS profile uses `EXPO_PUBLIC_API_BASE_URL=https://www.trainframe.eu` and channel `production`.
- Production AAB build is waiting for EAS quota reset.
- `versionCode` is incremented before every Play upload.
- Privacy policy URL is `https://www.trainframe.eu/privacy`.
- Terms URL is `https://www.trainframe.eu/terms`.
- Account/data deletion URL is `https://www.trainframe.eu/account-deletion`.
- Play Data Safety answers match actual app behavior.
- Firebase SHA for Play App Signing is added after the first AAB upload / Play Console app integrity setup.
- API restrictions are rechecked after signing changes.

## Rollback Note

Play `versionCode` cannot be reused. If a bad build is uploaded or released, rollback usually means uploading a fixed build with a higher `versionCode`.

Keep preview/internal testing separate from production Play rollout.

## Out Of Scope

This runbook does not implement:

- Firebase console changes
- backend behavior changes
