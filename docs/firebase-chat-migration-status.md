# Firebase chat migration: identity foundation

## Target
Firebase Authentication and Firestore chat, Realtime Database presence/typing,
Supabase Storage media, and LiveKit calls. Firebase billing remains disabled.

## Implemented in this change
The reusable server identity verifier checks RS256 signatures using Google's
Secure Token public keys; project audience/issuer; expiry, issuance and login
time; verified email; trusted account state and login revocation; and a
server-controlled Firebase UID to stable GaGa UUID mapping.
Public keys are cached with a bounded lifetime. Account state is checked per
request. Client email, profile fields and token-controlled key URLs are never
used as mapping or signing-key authorities. Raw tokens are not logged.

Tests use generated RSA keys and cover valid authentication plus adversarial
claims/signatures, revocation, missing mappings and backend outages.
Run: node --test supabase/functions/_shared/tests/firebase-identity.test.mjs

## Deliberately pending
This verifier is not imported by production handlers yet. Integration requires:
1. A trusted Admin API lookup returning uid, disabled, emailVerified and
   tokensValidAfterSeconds; failures must deny access.
2. A protected UID-to-app-ID mapping provisioned through an authenticated
   migration flow. Never create mappings from an unproven email match.
3. Media and LiveKit handlers consuming the mapped app ID, with existing
   membership, blocking, privacy and recent-auth requirements preserved.
4. Supabase accepting the project's Firebase tokens wherever direct Storage
   requests remain, or a server media gateway enforcing Firestore membership.
5. Firebase registration, verification, reset, refresh and persistence flows.
6. Firestore conversation/message repositories, tested participant rules,
   pagination, receipts and durable idempotent outgoing sends.
7. History reconciliation and controlled cutover; no production records deleted.
8. Two-device messaging/media and real LiveKit audio/video tests.

The current release APK continues using its existing transport. This change
is a tested migration foundation, not a claim of completed Firebase migration.
