# Gym App Backend

Spring Boot 4.0.2 backend for Gym App MVP sync, ownership/auth boundaries, and claim migration seams.

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

Configure one of:

- `SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUER_URI`
- `SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_JWK_SET_URI`

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
