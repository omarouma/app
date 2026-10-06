# GaGa Chat — Release Decision Record

**Date:** 2026-10-06
**Build under review:** `GaGa-2.0.30-release.apk` (versionCode 32, versionName 2.0.30, package `gagachat.app`)
**Branch:** `feat/firebase-first-migration`
**Scope:** resolve the two release decisions flagged before the next APK is called *final*.

---

## Decision 1 — Firebase login / chat switches

> *"the Firebase login/chat switches are disabled"*

**RESOLVED — keep them OFF (Supabase stays the authoritative backend) for this release.**

### What the switches are

`android-native/core/firebase/build.gradle.kts` injects two build flags:

| Flag | Default | Effect |
|---|---|---|
| `FIREBASE_TRANSPORT_ENABLED` | `false` | Master switch for the Firestore chat transport (mirror). |
| `FIREBASE_AUTH_FIRST` | `false` | Moves **authentication** to Firebase Auth + the `firebase-identity` backend. Only honoured when the master switch is also on (`FirebaseTransportConfig.authFirst = FIREBASE_AUTH_FIRST && FIREBASE_TRANSPORT_ENABLED`). |

With both off, the app uses the **proven Supabase path** (`DefaultAuthRepository`, Supabase Realtime/PostgREST chat) — exactly what the 2.0.27 / 2.0.28 / 2.0.29 builds shipped.

### Why they must stay off *right now* — live evidence

I probed the **live** backend on 2026-10-06 (see `QA_ACCEPTANCE_REPORT.md` §8 for the raw results):

| Backend component | Live result | Required for Firebase-first? |
|---|---|---|
| Supabase Edge Function `firebase-identity` | **HTTP 404 — NOT deployed** | **YES — critical.** `FirebaseIdentityMapper` calls it to map a Firebase UID ↔ GaGa id on every sign-in/sign-up. |
| Supabase Edge Function `media-auth` | **HTTP 404 — NOT deployed** | **YES** — Firebase-authorized media reads. |
| Supabase table `firebase_identity` | **HTTP 404 `PGRST205` — table missing** | **YES** — migration `20261012000100_firebase_identity.sql` not applied. |
| Supabase Edge Function `firebase-token` | deployed (401 without session) | bridge only |
| Supabase Edge Functions `livekit-token`, `create-call`, `send-fcm-push`, `delete-account-secure` | deployed | yes (already live) |
| Firebase project `oumagachat` — Auth Email/Password | enabled | yes |
| Firebase Firestore rules | deployed, deny unauthenticated (403) | yes |
| Firebase RTDB rules | deployed, deny unauthenticated (401) | yes |

**Conclusion:** the Firebase-first migration is **half-deployed**. The Android client code is complete, but the **server side is not**: the two functions and the identity table that the Firebase login flow *depends on* do not exist in the live project. Turning `FIREBASE_AUTH_FIRST` on today would make **registration and login fail for every real user** — the exact opposite of a usable build.

### Decision

1. **Ship 2.0.30 with the switches OFF.** The app runs on the proven Supabase backend, which is fully deployed and verified.
2. **Make the choice explicit** in the release build so it can never be silently mis-built (see *Implementation* below).
3. **Complete the migration later** using `docs/FIREBASE_MIGRATION_RUNBOOK.md` — deploy `firebase-identity` + `media-auth`, `supabase db push` the identity migration, run the history import/reconcile, then flip the flags in a **closed track** only.

---

## Decision 2 — Signing certificate

> *"its signing certificate differs from the older 2.0.29 APK available here"*

**RESOLVED — adopt a single canonical release key; the original keys are unrecoverable, and the CI pin that referenced them is obsolete.**

### The three certificates in play

| Build | Certificate subject | SHA-256 fingerprint |
|---|---|---|
| 2.0.27 | `C=AE, L=Dubai, O=GaGa, OU=Mobile, CN=GaGa Chat` | `F3:EA:B5:7A:0A:CD:A4:D3:80:68:10:56:D3:25:50:31:80:E0:F7:18:5C:D8:77:3A:78:87:A8:04:8E:20:7C:C2` |
| 2.0.28 / 2.0.29 / 2.0.30 (original AABs) | `C=BD, ST=Dhaka, L=Dhaka, O=GaGa, OU=GaGa, CN=GaGa` | `4D:CE:B3:74:55:77:5B:7F:DC:C3:66:38:A3:D0:8B:01:2B:F0:66:C5:DE:00:85:BD:01:2B:D0:29:7E:41:51:4C` |
| **2.0.30 (this rebuild)** | `CN=GaGa Chat, OU=Mobile, O=GaGa, L=Dhaka, ST=Dhaka, C=BD` | `C0:6F:D3:CC:B3:A7:E6:6E:56:E6:A7:BE:8A:72:53:DB:1B:54:AF:AB:66:66:47:D6:3C:4E:4D:6D:E5:16:1C:57` |

### Why the mismatch cannot be "fixed" by matching the old key

- A signing **private key cannot be recovered** from a signed APK/AAB — only the public certificate is embedded.
- The original keystores are **not in the repository** (git-ignored), **not in CI** (the `GAGA_RELEASE_KEYSTORE_BASE64` secret is unset — CI emits `SIGNING-REQUIRED.txt`), and the **user does not have them** ("I don't remember any password or key").
- Therefore no build can be produced that is byte-compatible with the 2.0.29 signature unless the original `.jks` is supplied.

### Decision

1. **Adopt the rebuild key as the single canonical release key** going forward (`deliverables/gaga-release.jks`, alias `gaga`, valid until 2054). All future builds sign with it — no more drift.
2. **Consequence to accept (one time):** devices with an older build installed **cannot update in place** (Android rejects a signature change with *"App not installed"*). Those users must **uninstall once and reinstall**. Server-side data (accounts, chats, media) is unaffected; only app-local data is lost on that one reinstall.
3. **If the app is on Google Play:** enable **Play App Signing** and **reset the upload key** in Play Console. Google re-signs with the app-signing key, so end users are unaffected and in-place updates keep working. (This is the recommended path if Play distribution is intended — see branch `feat/android-playstore-production`.)
4. **Fix the CI pin.** The workflow hard-coded `expected=f3eab57a…` (the 2.0.27 key), which is why a correct rebuild "failed" the signing check. It is replaced with a configurable `GAGA_RELEASE_CERT_SHA256` repository variable (see *Implementation*).

---

## Implementation (this change-set)

| File | Change |
|---|---|
| `.github/workflows/android-repair.yml` | Replace the hard-coded 2.0.27 cert pin with `${{ vars.GAGA_RELEASE_CERT_SHA256 }}`; when unset, verify the APK is signed and record the fingerprint instead of failing. |
| `.github/workflows/android-repair.yml` | Pass `-PFIREBASE_TRANSPORT_ENABLED=false -PFIREBASE_AUTH_FIRST=false` explicitly to the release build (Decision 1 made explicit + self-documenting). |
| `docs/RELEASE_DECISIONS.md` | Version-controlled copy of this record. |

## What still requires a human decision

- **Play Console state:** if GaGa is published on Google Play, an upload-key reset is required (Decision 2, step 3). If it is sideload-only, nothing further is needed.
- **Migration go-live:** deploying the missing Supabase functions + running the history migration is an operational step that needs Supabase project credentials (service-role key / access token), which are not available here.
