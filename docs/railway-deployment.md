# Railway backend deployment

This project expects Railway to provide runtime configuration through Railway service variables. Resolved Railway values, database credentials, and deployment secrets must stay outside the repo.

## Railway environment variables

Set these variables on the Railway backend service:

```text
SPRING_PROFILES_ACTIVE=prod

SPRING_DATASOURCE_URL=jdbc:postgresql://${{Postgres.PGHOST}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}
SPRING_DATASOURCE_USERNAME=${{Postgres.PGUSER}}
SPRING_DATASOURCE_PASSWORD=${{Postgres.PGPASSWORD}}

APP_AUTH_FIREBASE_PROJECT_ID=gym-app-mvp-1d7f0
SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUER_URI=https://securetoken.google.com/gym-app-mvp-1d7f0
SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_JWK_SET_URI=https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com

TRAINFRAME_SUPPORT_EMAIL=trainframe1@gmail.com
```

The backend requires Java 25. If Railway builds the checked-in backend Dockerfile, no `NIXPACKS_JDK_VERSION` variable is needed because the Dockerfile pins Java 25 build and runtime images. If Railway uses Nixpacks/Railpack instead of the Dockerfile, verify Java 25 support in that builder and set the Java 25 runtime/build configuration before deploying.

`SPRING_PROFILES_ACTIVE` must be `prod` so production safety checks are enforced. Prod-like profiles are `prod`, `production`, and `staging`; Railway should use `prod` for deployed shared backend services.

`TRAINFRAME_SUPPORT_EMAIL` must be a real support address for prod-like Railway deployments. Missing, blank, `support@example.invalid`, or `.invalid` placeholder values are rejected by startup validation.

Firebase is used for authentication only. Synced backend data is stored in PostgreSQL through the Spring Boot `/sync` API; mobile SQLite remains the runtime source of truth. Do not use Firebase as the app database.

Spring Boot 4 uses the explicit `spring-boot-starter-flyway` dependency in this repo along with Flyway core and PostgreSQL support. Keep that dependency when changing backend build files; otherwise Flyway auto-configuration/readiness can silently break.

Mobile Google Sign-In is implemented. A valid account request to `GET /me` returns `200` only with a real Firebase ID token from the mobile sign-in flow or a controlled test token setup.

> **Do not use this datasource form for the Spring Boot backend:**
>
> ```text
> SPRING_DATASOURCE_URL=jdbc:${{Postgres.DATABASE_URL}}
> ```
>
> Railway `DATABASE_URL` contains username and password. Prefixing it with `jdbc:` can produce a malformed JDBC URL where the PostgreSQL driver parses the credential section as part of the hostname.

## Railway-provided variable

Railway sets `PORT` for the service. The backend reads it via `server.port=${PORT:8080}`.

## Firebase account auth

The backend validates Firebase token signature, expiry, issuer, audience, and nonblank subject. Railway needs the Firebase/JWT environment variables above before account auth can be tested in prod.

The JWK Set URI is an explicit Railway configuration value for the current deployment. The backend can also build the decoder from issuer discovery, but prod-like startup requires at least the Firebase project id and issuer URI so account auth cannot be accidentally deployed with missing config.

Firebase Console SHA-1 configuration is not required for Spring Boot backend startup or Railway deployment. SHA-1 is required for Android Google Sign-In and mobile auth testing.

Firebase mobile client config is handled separately from Railway backend secrets. `apps/mobile/google-services.json` is intentionally tracked because it contains Firebase Android client configuration required by the app build. It is public mobile client config, not a server credential. The associated Google Cloud API key must remain restricted to the intended app/package, signing fingerprints, and required Firebase APIs; see `docs/firebase-client-config.md`. Do not upload Firebase service-account JSON or private keys to the repo. Backend Railway config should use environment variables only.

## Startup proof checklist

After each deploy, confirm:

1. Startup logs show active profile `prod`.
2. Flyway migrations run successfully.
3. `GET /ready` returns `200` only when database connectivity and schema readiness are both healthy.

`/ready` validates:

- DB connectivity (`SELECT 1`)
- Flyway readiness (`flyway_schema_history` has successful migrations and no failed migration rows)
- Required core tables exist:
  - `flyway_schema_history`
  - `device`
  - `device_token`
  - `entity_state`
  - `change_log`
  - `op_ledger`
  - `claim`
  - `identity_link`
  - `guest_account_migration_audit`
  - `account_deletion_tombstone`
  - `account_identity`

If any readiness check fails, `/ready` returns non-200 with a safe structured response and without secrets. `/ready` is only a meaningful production-safety signal when Railway is also running a prod-like profile with the required environment variables above.

## Smoke tests

Use the production custom domain for production smoke tests:

```bash
BASE="https://www.trainframe.eu"

curl -i "$BASE/health"
curl -i "$BASE/ready"
curl -i "$BASE/me"
```

Expected results:

- `/health` -> `200`
- `/ready` -> `200` with `database`, `flyway`, and `requiredTables` all `true`
- `/me` -> `401`
- To test invalid auth handling, send a deliberately malformed token from your local shell; do not commit real tokens to docs.

The direct Railway service URL may still be used for preview/dev QA or as a fallback when diagnosing custom-domain routing:

```text
https://gym-app-mvp-production.up.railway.app
```

Treat the direct Railway URL as an internet-public service endpoint, not a secret or the primary production URL.

## Mobile app default during QA

The checked-in mobile config in `apps/mobile/app.json` currently names the app `TrainFrame` and points preview/internal builds to this Railway backend:

```text
https://gym-app-mvp-production.up.railway.app
```

Treat this Railway service as the shared preview/dev QA backend. Production builds use `https://www.trainframe.eu`; see [Android release baseline](./android-release.md). For local backend testing, temporarily override `expo.extra.EXPO_PUBLIC_API_BASE_URL` in `apps/mobile/app.json` and confirm the resolved value in the mobile Debug screen under **Backend / Environment** -> **Backend URL**.

Operational incident handling belongs in [Production Incident Runbook](./ops-runbook.md). Migration recovery belongs in [Flyway / Postgres Migration Rollback](./migration-rollback.md).

## Troubleshooting

### `/ready` fails after a successful build

Symptom:

- Railway build succeeds, but `/ready` healthcheck fails.
- Logs contain `UnknownHostException: postgres:<password>@postgres.railway.internal`.

Fix:

- Replace `SPRING_DATASOURCE_URL=jdbc:${{Postgres.DATABASE_URL}}` with `SPRING_DATASOURCE_URL=jdbc:postgresql://${{Postgres.PGHOST}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}`.
- Keep credentials in `SPRING_DATASOURCE_USERNAME=${{Postgres.PGUSER}}` and `SPRING_DATASOURCE_PASSWORD=${{Postgres.PGPASSWORD}}`.

## Security note

If a malformed JDBC URL caused the database password to appear in logs, rotate or regenerate the Postgres password in Railway if possible. Avoid sharing screenshots or logs that contain resolved secrets.

## Important

Do **not** hardcode `SPRING_PROFILES_ACTIVE=prod` in the Dockerfile. It must be set in Railway environment variables.
