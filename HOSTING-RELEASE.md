# GaGa Chat 1.0.2 hosting release — 2026-09-16

## What is included

`dist/` is a completed frontend hosting build, not a placeholder compilation. `.env.production` contains only the public browser configuration recovered from the existing gagachat.app deployment: Firebase project `oumagachat`, Supabase project `fcjgbbmfqdkucfpqjxae`, and calling gateway `https://calls.gagachat.app`. Keep the existing Supabase data and accounts. No database migration was applied, no account was created, and no server credentials are included.

`alibaba-calling/` contains the self-hosted signaling/relay deployment source and templates. Deploy it separately to your existing Alibaba ECS instance. Do not upload its secrets/configuration to Firebase Hosting. See `alibaba-calling/README.md`.

## New in this release

Bounded signaling recovery using refreshed session tokens; unanswered-offer rollback; authenticated TURN renewal and ICE renegotiation for long calls; packet-loss/jitter/RTT quality badges; hangup timer cleanup; honest partial-history deletion errors; disabled callback actions for unknown participants and unsupported group calls.

## Current release status

- TypeScript and Vite production build: passed.
- Frontend tests: 141 passed in 16 files.
- Calling gateway tests: 3 passed, including local WebSocket SDP/ICE exchange using mock auth.
- Release verification: passed; 140 hosting files, package/service worker/manifest version 1.0.2, live public configuration, no ZEGO runtime, no source maps or server-secret names in the JavaScript output.
- `RELEASE-MANIFEST.json` lists file sizes and SHA-256 hashes.
- Firebase CLI: no authenticated account in the build environment. Nothing was published.
- Live calling gateway health check: HTTP 502 on 2026-09-16. The new UI checks gateway health before creating or accepting an invitation and reports temporary unavailability. A healthy gateway alone does not prove TURN or device media works.

## Preview before replacing the live app

This source came from an older source archive and is not proven to match every feature in the current live app. Preserve your current source/release and compare the preview before promoting this release. In particular verify sign-in, existing chat history, sending/retrying messages, navigation, media uploads, notifications, account settings and the wallet display using existing test accounts. Do not use real money to test payments.

From the extracted `app-main` directory, with Node.js 22 or later:

```sh
npm ci
npm run verify:release
npx firebase login
npx firebase hosting:channel:deploy gaga-rtc-review --expires 7d --project oumagachat
```

The preview command publishes the supplied `dist/` through the supplied Firebase routing, caching, permissions and CSP configuration. Sign in using an account with access to project `oumagachat`. Never substitute another project simply to make the command succeed. Preview uses the existing production Supabase backend: use test accounts and avoid changing real user data.

After reviewing the preview and completing the relevant device/data checks, deploy the same verified frontend files:

```sh
npm run deploy:prepared
```

This verifies the supplied output and deploys Hosting only. It does not deploy a database, change RLS rules, or install the Alibaba calling server. Verify the live site after publishing; the authenticated Firebase console provides Hosting release history for rollback.

## Rebuilding after further changes

The included `.env.production` preserves the live app's public config. Keep server secrets in the Alibaba service environment only. To rebuild and verify:

```sh
npm run build
npm run verify:release
```

To run the full local release checks:

```sh
node scripts/verify-final-build.mjs
```

Rebuild after any source/config changes; do not publish stale output. If the calling hostname changes, update both `VITE_CALLING_API_URL` and Firebase Hosting CSP, then rebuild.

## Remaining production work

Deploy Alibaba signaling and authenticated coturn, configure DNS/TLS/firewalls, verify real Supabase call membership/RLS, and test voice/video with devices on different mobile networks, including forced TURN relay tests. Group calls are unavailable in this release. Voice-room and live-stream media still need migration. Bounded reconnection and 45-minute relay renewal are implemented and tested with browser doubles; production recovery and long-duration media remain unverified. Background native calls, monitoring, capacity/regional tests and the remaining screen/features inventory are not complete. `SCREEN-IMPROVEMENT-MAP.md` is an inventory, not a full visual or functional acceptance report.

This package is ready for a hosting preview. It is not a claim that every screen or global production calling has been completed.
