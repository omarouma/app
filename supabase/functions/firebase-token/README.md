# Firebase custom-token session boundary

Every mint verifies the caller with Supabase Auth, then calls the existing
`gaga_session_active()` RPC with the same user bearer token and public API key.
Only a literal JSON `true` permits signing. Logout, remote revocation, missing
sessions, RPC errors and timeouts deny new tokens. Client body/query identities
are never used. Neither verification request uses a service-role credential.

The deployed database must retain authenticated EXECUTE on the RPC. This was
verified read-only on project `fcjgbbmfqdkucfpqjxae` on 2026-10-21 (Dhaka).
No schema migration is needed. Both upstream requests have an 8-second timeout.

Verify with Node 24:

```sh
node --test supabase/functions/firebase-token/tests/session.test.mjs supabase/functions/delete-account-secure/tests/deletion.test.mjs
```

Tests use an ephemeral RSA test key and mocked Supabase responses, including
verification of a genuinely signed custom token. They do not access live users
or production Firebase keys. CI runs the same tests without signing secrets.

Deployment preserves `verify_jwt=false` because the handler performs its own
Supabase Auth and live-session verification. This session-validation patch does not rotate existing runtime credentials.
Rotate the exposed Firebase service-account credential separately before public
release; never commit it.

This check prevents **new** Firebase custom tokens for a revoked Supabase
session. It does not revoke existing Firebase ID/refresh tokens or perform
Firebase account/data cleanup. Cross-provider deletion and existing Firebase
session revocation remain tracked in issue #148. Keep hybrid chat transport off
until those and trusted membership synchronization are qualified.

Reference: https://supabase.com/docs/guides/auth/sessions#how-to-ensure-an-access-token-jwt-cannot-be-used-after-a-user-signs-out
