# Production Incident Runbook

Use this when the shared backend, auth, sync, or account deletion path is unhealthy during TrainFrame closed testing or production readiness work. Keep actions factual, preserve logs, and avoid manual user-data edits unless there is no safer recovery path.

Primary production URL:

```bash
BASE="https://www.trainframe.eu"
```

Related docs:

- [Railway backend deployment](./railway-deployment.md)
- [Android release baseline](../android-release.md)
- [Android tester runbook](./android-tester-runbook.md)
- [Account deletion design](./account-deletion-design.md)
- [Firebase client config](../firebase-client-config.md)
- [Migration rollback](./migration-rollback.md)

## Quick Triage Checklist

Run public health checks first:

```bash
curl -i https://www.trainframe.eu/health
curl -i https://www.trainframe.eu/ready
```

Then check:

- Railway deployment status and latest backend logs.
- Railway Postgres service status.
- Firebase / Google Sign-In status and project configuration.
- Recent deploys, commits, migrations, Firebase changes, and mobile build changes.
- Support inbox: `trainframe1@gmail.com`.

Record the incident start time, the first failing symptom, and whether the impact is all users, signed-in users only, guest sync only, or a single reported account.

## Backend Unreachable Or `/health` Failing

Expected symptoms:

- `curl -i https://www.trainframe.eu/health` times out, returns 5xx, or cannot resolve/connect.
- Mobile app shows network/server errors for backend-backed flows.
- `/ready`, `/me`, `/sync`, `/account-deletion`, and `/privacy` may also be unreachable.

First checks:

- Confirm the failure from a network outside the Railway dashboard if possible.
- Check Railway backend service status, latest deploy status, restart loops, and logs.
- Check whether the custom domain `https://www.trainframe.eu` is still routed to the backend service.
- Check recent deploys and commits for backend startup, Dockerfile, Java, Spring profile, or config changes.
- Check whether Railway reports a regional/service incident.

Railway restart/redeploy steps are UI-dependent:

- In the Railway project, open the backend service.
- Inspect the latest deployment logs before restarting so the original failure is not lost.
- Restart the current deployment if it looks like a transient runtime failure.
- Redeploy the last commit if the latest deployment did not complete cleanly.
- If the current deploy introduced the failure, roll back or redeploy the last known good deployment from Railway's deployment history.

Rollback guidance:

- Prefer Railway rollback/redeploy of the last known good backend when `/health` fails after a deploy.
- Do not roll back across a database migration without reading [Migration rollback](./migration-rollback.md). Code rollback can be unsafe if the database has already moved forward.
- After rollback, verify `/health`, `/ready`, auth, and sync smoke checks before telling testers the issue is resolved.

Tester-facing update:

```text
TrainFrame is having a backend outage right now. Sync and account actions may fail until this is fixed. Your on-device workout data should stay local; please avoid reinstalling or clearing app data while we investigate.
```

## `/ready` Failing

`/ready` is the production safety check. It validates database connectivity, Flyway state, and required core tables. The current required-table list is documented in [Railway backend deployment](./railway-deployment.md#startup-proof-checklist); treat the deployed `/ready` implementation as the source of truth when code and docs differ.

First checks:

```bash
curl -i https://www.trainframe.eu/ready
```

Then inspect Railway logs for readiness failures. Common causes:

- Missing or incorrect Railway environment variables.
- Database connection failure.
- Flyway migration failure or failed row in `flyway_schema_history`.
- Required table missing because a migration did not run or ran against the wrong database.
- Backend connected to the wrong Postgres service.

Railway env vars to check:

- `SPRING_PROFILES_ACTIVE=prod`
- `SPRING_DATASOURCE_URL`
- `SPRING_DATASOURCE_USERNAME`
- `SPRING_DATASOURCE_PASSWORD`
- `APP_AUTH_FIREBASE_PROJECT_ID=gym-app-mvp-1d7f0`
- `SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUER_URI=https://securetoken.google.com/gym-app-mvp-1d7f0`
- `SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_JWK_SET_URI`
- `TRAINFRAME_SUPPORT_EMAIL=trainframe1@gmail.com`

Database checks:

```sql
SELECT 1;
SELECT * FROM flyway_schema_history ORDER BY installed_rank DESC;
```

Do not proceed with tester rollout while `/ready` is non-200. If a migration is involved, follow [Migration rollback](./migration-rollback.md) before redeploying repeatedly.

## Sync Failing For Users

Expected symptoms:

- Users report workouts, plans, templates, or account migration changes not appearing on another device.
- Mobile shows sync errors, auth errors, or stale account/deleted-account messages.
- Backend logs show `/sync` failures.

First checks:

```bash
curl -i https://www.trainframe.eu/ready
```

- Check backend logs for the affected time window.
- Search by `requestId` if the mobile support bundle or logs include one.
- Check recent sync-related deploys, database migrations, and auth changes.
- Confirm whether the user is signed in with Google or using guest/device sync.
- Ask the user for a support bundle when logs are not enough. Support bundles must be shared only with TrainFrame support.

Known failure classes:

- Unauthorized or stale token.
- Database unavailable.
- Migration/schema mismatch.
- Delta apply failure on mobile.
- Account deleted or stale session blocked by account identity/tombstone checks.

Avoid manually editing `entity_state`, `change_log`, `op_ledger`, account identity, or deletion tombstone rows unless absolutely necessary. If a manual database correction is unavoidable, document the exact rows, SQL, reason, and validation before and after the change.

## Firebase / Google Sign-In Failing

Use this section when mobile sign-in fails before backend calls, or when the backend rejects Firebase account JWTs.

Check Firebase / Google configuration:

- Firebase project: `gym-app-mvp-1d7f0`.
- Android package: `com.mehka.gymappmvp`.
- SHA-1 and SHA-256 fingerprints for the relevant signing context.
- Freshness of `apps/mobile/google-services.json` after Firebase app or SHA changes.
- OAuth consent screen branding and authorized domain configuration.
- API key restrictions for Android package and signing certificate fingerprints.
- Firebase Auth / Google Sign-In APIs are enabled.

Distinguish failure type:

- Mobile sign-in failure: Google/Firebase flow fails before TrainFrame calls the backend. Check Android package, SHA fingerprints, `google-services.json`, API restrictions, and OAuth consent setup.
- Backend JWT rejection: Google sign-in succeeds, but `/me`, `/sync`, or `/claim/confirm` returns unauthorized. Check Railway Firebase env vars, issuer/audience, token expiry, and backend logs.

Useful smoke checks:

```bash
curl -i https://www.trainframe.eu/me
```

The unauthenticated request should return an unauthorized response, not 5xx. To test invalid auth handling, send a deliberately malformed token from your local shell; do not commit real tokens to docs.

## Account Deletion Failing

Check the signed-in account deletion path:

- `DELETE /me` requires a valid Firebase account JWT.
- Backend derives the account owner from the JWT principal.
- The endpoint should return `204 No Content` on success.
- The mobile app clears local data only after backend deletion succeeds.

Check the public deletion page:

```bash
curl -i https://www.trainframe.eu/account-deletion
```

Also check:

- Support email path: `trainframe1@gmail.com`.
- `TRAINFRAME_SUPPORT_EMAIL=trainframe1@gmail.com` in Railway.
- Public `/privacy` and `/account-deletion` pages are reachable.
- The support/manual request expectation is a 30-day manual deletion SLA.
- Current retention and tombstone behavior in [Account deletion design](./account-deletion-design.md).

Preserve audit/security metadata according to the current privacy/account deletion docs. Escalate carefully: do not promise immediate manual database deletion until the user's identity, account scope, and requested data scope are verified.

## Railway Deploy Rollback

Use Railway deployment history to identify the last known good deploy. The exact UI labels can change, so treat these steps as UI-dependent:

- Open the Railway backend service.
- Compare the latest failing deployment with the previous successful deployment.
- Check commit SHA, deployment time, environment changes, and migration logs.
- If the prior deploy is known good and the database schema is compatible, use Railway's redeploy/rollback action for that deployment.
- If a Flyway migration ran after the last known good deploy, read [Migration rollback](./migration-rollback.md) before rolling code back.

For Flyway/schema failures, use [Migration rollback](./migration-rollback.md) instead of repeating the recovery procedure here.

After rollback or redeploy, verify:

```bash
curl -i https://www.trainframe.eu/health
curl -i https://www.trainframe.eu/ready
curl -i https://www.trainframe.eu/me
```

Then smoke test:

- Invalid auth handling with a deliberately malformed token from your local shell; do not commit real tokens to docs.
- Google Sign-In on a real Android build.
- `GET /me` with a real signed-in account if available.
- Basic sync from mobile if possible: create or edit a low-risk item, sync, and verify it appears after refresh/reopen.

## Communication Templates

Tester-facing status:

```text
TrainFrame is currently investigating a backend issue affecting sync/account actions. Please keep using the app normally if your data is local, but avoid reinstalling or clearing app data until we post an update.
```

Resolved:

```text
The TrainFrame backend issue has been resolved. Please reopen the app and try sync/account actions again. If anything still looks wrong, send a support bundle to trainframe1@gmail.com.
```

Internal incident notes:

```text
Incident:
Time started:
Time resolved:
Symptoms:
Impact:
Suspected cause:
Actions taken:
Validation:
Follow-up items:
Links to logs/deploys:
```
