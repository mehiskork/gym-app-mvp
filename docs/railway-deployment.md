# Railway backend deployment

This project expects Railway to provide runtime configuration through Railway service variables.

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
```

`SPRING_PROFILES_ACTIVE` must be `prod` so production safety checks are enforced.

Firebase is used for authentication only. App data remains in PostgreSQL through the Spring Boot `/sync` API; do not use Firebase as the app database.

Mobile Google Sign-In is a later PR. A valid account request to `GET /me` returns `200` only with a real Firebase ID token from the mobile sign-in flow or a controlled test token setup.

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

Firebase Console SHA-1 configuration is not required for Spring Boot backend startup or Railway deployment. SHA-1 is needed later for Android Google Sign-In and mobile auth testing.

## Startup proof checklist

After each deploy, confirm:

1. Startup logs show active profile `prod`.
2. Flyway migrations run successfully.
3. `GET /ready` returns `200` only when database connectivity and schema readiness are both healthy.

`/ready` validates:

- DB connectivity (`SELECT 1`)
- Flyway readiness (`flyway_schema_history` has successful migrations)
- Required core tables exist:
  - `flyway_schema_history`
  - `device`
  - `device_token`
  - `entity_state`
  - `change_log`
  - `op_ledger`

If any readiness check fails, `/ready` returns non-200 with a safe structured response and without secrets.

## Smoke tests

Use the deployed backend URL:

```bash
BASE="https://gym-app-mvp-production.up.railway.app"

curl -i "$BASE/health"
curl -i "$BASE/ready"
curl -i "$BASE/me"
curl -i "$BASE/me" -H "Authorization: Bearer invalid-token"
```

Expected results:

- `/health` -> `200`
- `/ready` -> `200` with `database`, `flyway`, and `requiredTables` all `true`
- `/me` -> `401`
- `/me` with `invalid-token` -> `401 AUTH_UNAUTHORIZED` / malformed token

## Mobile app default during QA

The checked-in mobile config in `apps/mobile/app.json` currently points to this Railway backend:

```text
https://gym-app-mvp-production.up.railway.app
```

Treat this Railway service as the shared dev/QA backend for the current phase, not as the final production environment. For local backend testing, temporarily override `expo.extra.EXPO_PUBLIC_API_BASE_URL` in `apps/mobile/app.json` and confirm the resolved value in the mobile Debug screen under **Backend / Environment** -> **Backend URL**.

Before public beta or real production, split dev/QA/prod backend config so local development and test builds cannot silently target production.

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
