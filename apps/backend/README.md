# Gym App Backend

Spring Boot 4.0.5 backend for Gym App MVP sync, ownership/auth boundaries, and claim migration seams.

## Requirements

- JDK 25 for local Maven commands. GraalVM CE 25.0.2 is the tested local runtime; any compatible JDK 25 should work.
- Docker for `docker compose up --build` and Testcontainers-backed integration tests.

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
- `POST /claim/confirm` -> **account JWT only**
- `GET /me` -> **account JWT only**

Ownership scope is always resolved from authenticated principal on the server.

## Claim-confirm auth

`/claim/confirm` requires a verified Firebase account JWT. The backend derives the target account owner from `AccountPrincipal.externalAccountId` (`issuer|subject`) and does not accept client-sent account/user ids.

`/claim/start` remains device/guest-authenticated. The mobile app now orchestrates guest-to-Google migration by draining guest sync, starting a claim with the device token, completing Google Sign-In, confirming the claim with the Firebase ID token, and only then storing the account session.

## JWT config for account endpoints

Firebase is used for authentication only. App data remains in PostgreSQL through the Spring Boot `/sync` API; do not add Firestore, Realtime Database, Storage, or Hosting for app persistence.

Firebase project ID:

- `gym-app-mvp-1d7f0`

Configure:

- `APP_AUTH_FIREBASE_PROJECT_ID=gym-app-mvp-1d7f0`
- `SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUER_URI=https://securetoken.google.com/gym-app-mvp-1d7f0`

Optional override, normally not needed with issuer discovery:

- `SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_JWK_SET_URI`

The backend validates Firebase token signature, expiry, issuer, audience, and nonblank subject. The account owner identity is derived from the verified issuer + Firebase UID. Missing JWT/Firebase configuration fails closed for account-token endpoints.

Mobile Google Sign-In is implemented. Firebase is authentication-only; app data remains in PostgreSQL through the Spring Boot sync API.

Prod-like profiles (`prod`, `production`, `staging`) fail startup unless datasource settings, `APP_AUTH_FIREBASE_PROJECT_ID`, and `SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUER_URI` are configured. Railway should set `SPRING_PROFILES_ACTIVE=prod`; otherwise those production safety checks are not active. `SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_JWK_SET_URI` is supported as an explicit decoder override, but issuer discovery is sufficient for backend startup.

`GET /ready` checks database connectivity, required tables, and Flyway state. It reports not-ready if `flyway_schema_history` contains any failed migration row.

## Tests

From `apps/backend`:

```bash
./mvnw test
./mvnw verify
```

- `./mvnw test` runs the Surefire test phase and excludes `*IT.java` / `*IntegrationTest.java`
- `./mvnw verify` runs the Failsafe integration-test/verify phases and includes `*IT.java` / `*IntegrationTest.java`
- On Windows, use `mvnw.cmd test` and `mvnw.cmd verify`

Backend integration tests use Testcontainers and require a running Docker daemon.

## Rate limiting

`POST /sync` uses layered in-process limits: every request gets a remote-address safety bucket, device-token sync gets a device-id bucket, and account JWT sync gets an account-owner bucket derived from the authenticated principal. Account sync limits default to the general sync settings and can be overridden with:

- `rateLimit.sync.account.capacity`
- `rateLimit.sync.account.refillPerSecond`

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
