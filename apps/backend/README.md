# Gym App Backend (Step 9 Sync Foundations)

This Spring Boot backend provides device-bound guest registration and sync endpoints for the Expo client.

## Run locally

From the repo root:

```bash
docker compose up --build
```

The API will be available at `http://localhost:8080`.

## Curl examples

Register a device:

```bash
curl -X POST http://localhost:8080/device/register \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"dev_123","deviceSecret":"sec_abc"}'
```

Sync with ops and cursor:

```bash
curl -X POST http://localhost:8080/sync \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <deviceToken>" \
  -d '{"cursor":"0","ops":[{"opId":"op_1","entityType":"workout_set","entityId":"set_1","opType":"upsert","payload":{"reps":10}}]}'
```

## Auth boundaries (PR 7 spike)

This repo now has a narrow account-auth spike with explicit route boundaries:

- `POST /sync` -> **device bearer token only**
- `POST /claim/start` -> **device bearer token only**
- `GET /me` -> **account JWT only** (OAuth2 Resource Server)

`/me` returns principal identity derived from verified JWT claims (`issuer + subject`) so account ownership can be plumbed end-to-end without changing guest/device sync behavior.

To enable JWT verification, configure one of:

- `SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUER_URI`
- `SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_JWK_SET_URI`