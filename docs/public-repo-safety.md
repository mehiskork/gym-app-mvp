# Public repo safety checklist

Use this checklist before changing GitHub visibility or sharing repository history outside the current private/internal audience.

## Client Firebase config

- `apps/mobile/google-services.json` is Firebase Android client configuration, not a Firebase Admin/service-account credential.
- Before making the repo public, verify the Firebase API key is restricted by Android package name plus SHA-1 and SHA-256 certificate fingerprints for every allowed build context.
- Firebase is intended to be Auth-only for this app. Firestore, Realtime Database, and Storage should remain unused or locked down by rules.
- Do not commit Firebase Admin SDK JSON, service-account keys, private keys, or Google Cloud credentials.

## Backend and deployment config

- Railway environment variables must stay outside the repo. Do not commit resolved Railway variables, database URLs with credentials, screenshots, logs, or support exports that include secrets.
- The checked-in Railway URL is a shared dev/QA preview backend endpoint. Its obscurity is not a security boundary; treat it as internet-public.
- Production builds must use a deliberate production backend URL and must not silently reuse the shared dev/QA endpoint.

## Signing and store credentials

- Google Play service-account JSON, upload keys, app signing keys, keystores, provisioning profiles, and signing passwords must never be committed.
- Keep release signing material in EAS, Google Play, or secure local storage only.

## Route exposure

- Public backend routes are `/`, `/assets/trainframe-logo.png`, `/health`, `/ready`, `/privacy`, `/terms`, `/account-deletion`, and `/account-deletion/request`.
- Protected routes such as `/me`, `DELETE /me`, `/sync`, `/claim/start`, and `/claim/confirm` must stay protected according to the auth model documented in `docs/sync-protocol.md`. `/device/register` is a public bootstrap endpoint, not an owner-selection mechanism.

## Final checks

- Run secret scanning on the current tree and Git history.
- Check `git status --short` and review every tracked file added since the last private audit.
- Verify `.gitignore` covers local env files, signing files, service-account credentials, support bundles, and generated native/build output.
