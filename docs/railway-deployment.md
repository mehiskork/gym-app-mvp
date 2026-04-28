# Railway backend deployment

This project expects Railway to provide runtime configuration through Railway service variables.

## Required backend environment variables

Set these variables on the Railway backend service:

- `SPRING_PROFILES_ACTIVE=prod`
- `SPRING_DATASOURCE_URL`
- `SPRING_DATASOURCE_USERNAME`
- `SPRING_DATASOURCE_PASSWORD`

`SPRING_PROFILES_ACTIVE` must be `prod` so production safety checks are enforced.

## Railway-provided variable

Railway sets `PORT` for the service. The backend reads it via `server.port=${PORT:8080}`.

## Account-auth JWT variables (future Firebase account auth)

Set these when Firebase-backed account auth is wired to real ID-token validation:

- `SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUER_URI`
- `SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_JWK_SET_URI`

Until Firebase-specific Google Sign-In and Firebase ID-token validation are completed, these can remain unset. The current code has a generic account-JWT foundation, not completed Firebase auth.

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

## Important

Do **not** hardcode `SPRING_PROFILES_ACTIVE=prod` in the Dockerfile. It must be set in Railway environment variables.
