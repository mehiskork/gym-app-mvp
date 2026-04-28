# Gym App Backend

Spring Boot 4.0.5 backend for Gym App MVP sync, ownership/auth boundaries, and claim migration seams.

## Local run

From repo root:

```bash
docker compose up --build
```

API base URL: `http://localhost:8080`

Health check:

```bash
curl http://localhost:8080/health
```

## Current endpoint auth boundaries

- `POST /device/register` -> public bootstrap endpoint
- `POST /sync` -> **device bearer token OR account JWT**
- `POST /claim/start` -> **device bearer token only**
- `POST /claim/confirm` -> **dev/test seam only** (`X-User-Id` header when enabled)
- `GET /me` -> **account JWT only**

Ownership scope is always resolved from authenticated principal on the server.

## Claim-confirm seam (important)

`/claim/confirm` is intentionally not production auth. It is a guarded dev/test bridge:

- default `claim.devUserHeaderEnabled=false`
- dev profile enables it for local workflows
- prod-like profiles are guarded against unsafe enablement

Do not depend on `X-User-Id` header flow for production deployments.

## JWT config for account endpoints

The current backend has a generic account-JWT foundation. Firebase-specific Google Sign-In and real Firebase ID-token validation are not completed yet.

Configure one of:

- `SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUER_URI`
- `SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_JWK_SET_URI`

These variables are required once Firebase-backed account auth is wired to real token validation.

## Tests

From `apps/backend`:

```bash
mvn test
mvn verify
```

- `mvn test` runs the Surefire test phase and excludes `*IT.java`
- `mvn verify` runs the Failsafe integration-test/verify phases and includes `*IT.java`

Backend integration tests use Testcontainers and require a running Docker daemon.

## Quick curl examples

Register device:

```bash
curl -X POST http://localhost:8080/device/register \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"dev_123","deviceSecret":"sec_abc"}'
```

Sync with device token:

```bash
curl -X POST http://localhost:8080/sync \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <deviceToken>" \
  -d '{"cursor":"0","ops":[]}'
```

Sync with account JWT:

```bash
curl -X POST http://localhost:8080/sync \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accountJwt>" \
  -d '{"cursor":"0","ops":[]}'
```
