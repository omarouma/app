# GaGa Chat 2.7.5 — Backend compatibility and push stability audit
**Date:** 2026-10-12. **Base:** merged `main` (GaGa 2.7.4). **Branch:** `fix/gaga-2.7.5-backend-push-stability`.
**Production Supabase:** `fcjgbbmfqdkucfpqjxae`. **Firebase Android project:** `oumagachat`.
Status: **source implementation awaiting CI and staged verification**. This document does NOT certify Play readiness.

## Evidence / verified failure modes
1. Supabase `function_logs` show three `FCM_DELIVERY_FAILED UNREGISTERED` events (2026-10-11), plus `A call notification delivery path failed`. These point to invalid/expired FCM tokens and/or call delivery failure; they do not establish a general database failure. Existing production FCM v36 invalidates tokens after `UNREGISTERED`, but a device must register its current token again on sign-in/refresh.
2. `friend-event-push` sent `friend_request` and `friend_accepted` to live `send-fcm-push` v36, whose `supportedTypes` lacked both values. Result: durable database inbox may succeed while push is rejected.
3. Production sender includes a `recipient_user_id` data field. Android `PushHandler` had been checking `user_id`, `callee_id`, and `recipient_id` but not `recipient_user_id`. A queued push for a previous account could be displayed under the wrong active account.
4. Production `user_devices` has a unique index on `(user_id,device_id)`, but Android used two-step lookup and insert/patch for registration. The split path is race-prone after refresh and on competing workers.
5. Server revocation: `user_devices.revoked_at` is intentionally preserved; background token refresh must **not** automatically re-enable a user-revoked device.

## Changes included
| Area | File | Behavior |
|---|---|---|
| Account isolation | `core/model/PushRecipientPolicy.kt`, `app/push/PushHandler.kt` | All declared recipient identifiers must match the active signed-in user. Personal events without an explicit recipient are rejected; release-update notifications still get validated against the signed release feed. |
| Privacy regression | `core/model/src/test/.../PushRecipientPolicyTest.kt` | Covers matching/conflicting user IDs, missing recipients, signed-out sessions and legitimate app-update events. |
| Device registration | `core/network/.../SupabaseRestApi.kt` | Atomic PostgREST `upsert` on verified unique key, requiring same active account and a non-empty token; does not clear device revocation. |
| FCM server reproducibility | `supabase/functions/send-fcm-push/index.ts`, `payload.ts` | Repository matches the deployed v36 service-only architecture; payload supports `friend_request`, `friend_accepted`; preserves generic privacy-friendly text, request identifier and authoritative recipient identity. |
| FCM tests | `supabase/functions/send-fcm-push/tests/push.test.mjs` | Service-role-only access, inactive-device filter, data-only friend event payloads, stale-token revocation and non-revocation on unrelated FCM errors. |
| Version | `app/build.gradle.kts` | 2.7.5 / versionCode 50, preserving `gagachat.app`. |

## Release and safety gates
- **CI before deployment:** Node FCM/friend/call tests, Kotlin model unit tests, Android assemble/bundle, signing-key verification and code/security review.
- **Stage backend tests:** real two-account friend request, accept, notification inbox, push delivery on active device, no push to revoked device; two Android devices in foreground/background/locked. Confirm server function uses exact public project and secret-based credentials.
- **FCM errors:** test `UNREGISTERED` clears only a stale push token for the recipient, not account data or other devices; test healthy second device still receives a push.
- **Safely deploy only verified functions:** if CI green, release `send-fcm-push` `index.ts` + `payload.ts` together, retain ability to roll back, monitor errors and compare previous deployed version.
- **No databases reset:** no SQL writes or changes to RLS, authenticated RPCs, balances or production user records in this patch.
- **Keystore blocker:** 2.7.2 signer BD:95:B2..., 2.7.3 signer A8:7B:AF..., user-mentioned third certificate C0:6F:D3...; uploaded JKS was not password-validated earlier. Neither passwords nor signing keys should enter the repository. Unsigned CI output is not Play-ready.
- **Credentials:** uploaded Firebase Admin private key must be rotated safely via Google Cloud server-side secret rotation; do not store it in APK/GitHub source.
- **Remaining feature backlog**: full chat attachment real-device tests, long-running LiveKit call/reconnect, Today/Circles tasks sync, groups, settings/privacy/RLS, all feature controls, account deletion, payment/wallet regulatory compliance, accessibility/sounds and Play Data Safety. CI alone cannot certify these.
- **Supabase advisories (not automatically bugs):** Security Definer RPC grants need auth-context audit; leaked-password detection disabled (enable via dashboard); RLS/initPlan and multiple permissive policies are performance/security review items. `chat_hidden_users`, `chat_user_settings`, and `friend_push_dispatches` have intentionally restricted direct API access via RPC/service.
