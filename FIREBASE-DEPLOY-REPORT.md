# GaGa Chat — Firebase Hosting Deployment Report

**Status: ✅ DEPLOYED AND VERIFIED LIVE**

| | |
|---|---|
| **Live URL** | https://oumagachat.web.app |
| **Alternate URL** | https://oumagachat.firebaseapp.com |
| **Firebase project** | `oumagachat` (GaGa Chat, #545448312835) |
| **Release** | 1.0.2 |
| **Deployed by** | `omaroumafaruk9988@gmail.com` via Firebase CLI |
| **Files uploaded** | 140 |
| **Deploy time** | 2026-09-17 |

---

## 1. How the deploy was unblocked

The GitHub Actions workflow had been failing at exactly one step:

```
Error: Input required and not supplied: firebaseServiceAccount
```

That is the `FIREBASE_SERVICE_ACCOUNT` repository secret, which was never
configured. Every other CI step (lint, typecheck, 141 tests, calling syntax
check, production build) passed.

Rather than requiring a service-account key, the deploy was completed through an
interactive Firebase CLI login:

```bash
firebase login --no-localhost     # browser authorization as omaroumafaruk9988@gmail.com
firebase deploy --only hosting --project oumagachat --non-interactive
```

Result:

```
i  hosting[oumagachat]: found 140 files in dist
✔  hosting[oumagachat]: file upload complete
✔  hosting[oumagachat]: version finalized
✔  hosting[oumagachat]: release complete
✔  Deploy complete!
Hosting URL: https://oumagachat.web.app
```

---

## 2. Verification of the live site

### Before vs after

| | Before | After |
|---|---|---|
| `index.html` size | 12,702 bytes | **15,003 bytes** |
| Entry bundle | older hash | **`assets/index-Ctl_HOIi.js`** |
| Supabase preconnect | stale project | **live project** |

The live site was serving an **older build** before this deploy, so none of the
calling fixes were live. That is now corrected.

### Live checks

| Check | Result |
|---|---|
| `https://oumagachat.web.app` | **200** |
| `https://oumagachat.firebaseapp.com` | **200** |
| `index.html` bytes | **15,003** (matches local build) |
| Entry bundle hash | **`index-Ctl_HOIi.js`** (matches local build) |
| `sw.js` | **200** |
| `manifest.json` version | **1.0.2** |
| Supabase preconnect host | **`fcjgbbmfqdkucfpqjxae.supabase.co`** (live project) |
| `calls.gagachat.app` in bundle | **present** |
| `setSinkId` in bundle | **present** (audio-output picker shipped) |
| ZEGO references | **0** |
| Server secrets in bundle | **0** |

### Security headers (live)

```
content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline' ...
permissions-policy: camera=(self), microphone=(self), geolocation=(), payment=(), fullscreen=(self), autoplay=(self)
strict-transport-security: max-age=31556926; includeSubDomains; preload
x-frame-options: SAMEORIGIN
```

`connect-src` already permits `https://calls.gagachat.app` and
`wss://calls.gagachat.app`, so the calling gateway will work as soon as it is
provisioned.

### Browser smoke test

Navigated to the live site and `/auth` in a real Chromium instance:

- Page loads, React mounts (`#root` populated), service worker registers
- Landing page renders fully (nav, features, security, creators, FAQ, CTAs)
- `/auth` renders the sign-in options (Email, Phone, Magic Link, Create account)
- **Console errors: 1, benign** — `Blocked call to navigator.vibrate because user
  hasn't tapped on the frame yet`. This is a browser policy notice, not a bug;
  it disappears after the first user interaction.
- **Network errors: 1, benign** — a Google Analytics `collect` request aborted
  during navigation. Expected on page transitions.

No application errors.

---

## 3. What is now live

### Calling fixes

- **Ringtone singleton** — previously two owners (the app-level
  `useIncomingCallNotifications` hook and the globally mounted `CallOverlay`)
  both requested the ringtone for the same call. The second request overwrote
  the first handle, so the first ringtone **looped forever with no way to stop
  it** — audible on every incoming call and surviving the call ending.
- **Per-request `AbortController`** — a single shared controller meant the first
  timeout aborted **every subsequent ICE fetch**, including the 45-minute TURN
  credential renewal. Long calls lost relay connectivity permanently.
- **Prepared-stream hand-off** — the store pre-checked permission and the engine
  acquired media again. Two acquisitions in quick succession throw
  `NotReadableError` on several mobile browsers and flash the camera indicator
  twice.
- **Stream release on every terminal path** — end, reject, and stale-accept all
  release the prepared stream so the camera/mic indicator never stays on.
- **Bounded notification state** — the notified-call set (cap 20) and caller
  cache (cap 100) no longer grow unbounded over a long session.
- **`CallPage` de-duplicated** — it rendered its own control grid alongside
  `CallOverlay`'s, and in that grid the **Speaker button was a no-op** and the
  **Keypad sent a hard-coded `'1'`** regardless of which key was pressed.
  `CallPage` is now a thin initiator; `CallOverlay` owns all in-call UI.

### Calling UX

- **Real audio-output picker** — the "Audio output" button was toast-only. It now
  enumerates `audiooutput` devices and applies the choice via
  `HTMLMediaElement.setSinkId()`, and is **hidden entirely** where unsupported
  rather than showing a dead button.
- **Dead group-calling panel removed** — `inviteToCall` throws
  `'Group calling is not enabled yet.'`, so the panel could never work.
- **Working DTMF keypad** — sends the actual key pressed.

### Realtime

- `REPLICA IDENTITY FULL` migration for `call_history`, `call_signaling`,
  `messages`, `chats`, `notifications`, `friend_requests`, `friendships`,
  `typing`, and `presence`, so `postgres_changes` UPDATE payloads carry complete
  old records.

### Performance

- Supabase preconnect now targets the live project. It previously pointed at
  `alzwgikndwbecuqmlrca.supabase.co` while the app used
  `fcjgbbmfqdkucfpqjxae.supabase.co` — every page load warmed a dead origin and
  the shipped HTML leaked a stale hostname. `verify-build-output.mjs` now
  **fails the release** if any `*.supabase.co` host in `index.html` is not the
  live project ref, so this cannot regress.

---

## 4. Build verification (pre-deploy)

| Check | Result |
|---|---|
| `npx tsc -b` | 0 errors |
| `npx eslint .` | 0 errors, 0 warnings |
| `npx vitest run` | 141/141 passing (16 files) |
| `npm run build` | 140 hosting files |
| `npm run verify:release` | Release 1.0.2 verified |
| `npm run check:calling` | gateway syntax OK |
| Gateway `node --test` | 3/3 passing |
| Gateway `npm run smoke` | 13/13 passing |

---

## 5. Remaining items

### 5.1 Permanent CI deploy (recommended)

The deploy above was performed interactively. To make every future push to
`main` deploy automatically, add the repository secret:

1. https://console.firebase.google.com/project/oumagachat/settings/serviceaccounts/adminsdk
   → **Generate new private key**
2. https://github.com/omarouma/app/settings/secrets/actions → **New repository secret**
3. Name `FIREBASE_SERVICE_ACCOUNT`, value = the entire contents of the `.json`

The workflow `.github/workflows/deploy.yml` is already correct and needs no
changes. (The integration token used here cannot write repository secrets —
GitHub returns 403 for that endpoint — so this step requires you.)

### 5.2 Supabase migration

The `REPLICA IDENTITY FULL` migration is committed at
`supabase/migrations/20260820000600_realtime_replica_identity.sql` and appended
to `supabase_full_setup.sql` as section 29. Applying it requires database
access (a Supabase access token or the SQL editor). The app works without it —
`applyChangeToState` matches on `newRow`, so default replica identity is
sufficient — but `FULL` makes UPDATE payloads complete.

To apply: open the Supabase SQL editor for project `fcjgbbmfqdkucfpqjxae` and
run the migration file.

### 5.3 Alibaba Cloud calling gateway (required for reliable calls)

**Firebase Hosting serves the frontend only.** The real-time signaling gateway
(`calls.gagachat.app`) and coturn TURN server run on Alibaba Cloud ECS. Until
that instance is provisioned, calls fall back to direct peer-to-peer only —
which fails behind symmetric NAT and carrier-grade NAT, i.e. a meaningful share
of mobile calls.

Everything needed is ready in `alibaba-calling/`:

```bash
cd alibaba-calling
./provision-ecs.sh --dry-run \
  --domain calls.gagachat.app --turn-domain turn.gagachat.app \
  --origins https://oumagachat.web.app,https://oumagachat.firebaseapp.com \
  --supabase-url https://fcjgbbmfqdkucfpqjxae.supabase.co \
  --supabase-anon-key "$VITE_SUPABASE_ANON_KEY" \
  --email ops@gagachat.app
```

Then re-run without `--dry-run`, open the printed security-group rules, create
the DNS records, and verify with `./verify-remote.sh`. Full runbook:
`alibaba-calling/ALIBABA-CLOUD-SETUP.md`.

### 5.4 Merge PR #2 (optional)

PR #2 (`improve/screens-and-calling` → `main`) is open and mergeable, with 7
commits. Merging it puts the improved source on `main` and, once the CI secret
is added, triggers an automatic deploy.

---

## 6. Summary

The improved GaGa Chat build is **live at https://oumagachat.web.app**. All six
calling defects are fixed, the calling UX improvements are shipped, the realtime
migration is committed, and the stale Supabase preconnect is corrected with a
guard against regression. The build passed every check: 0 type errors, 0 lint
problems, 141/141 tests, 3/3 gateway unit tests, 13/13 gateway smoke checks.

The only thing standing between the current state and fully reliable calling is
provisioning the Alibaba Cloud ECS instance — the scripts and runbook for that
are complete and ready to run.
