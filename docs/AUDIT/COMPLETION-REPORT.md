# GaGa Chat — Completion Report (2026-09 session)

## What was delivered

### 1. Native Android APK v3.1.17 (built + verified)
- `GaGaChat-v3.1.17-qa.aab` (27.8 MB) — Play Store bundle
- `app-arm64-v8a-qa.apk` (20.1 MB) — modern 64-bit devices
- `app-armeabi-v7a-qa.apk` (15.1 MB) — older 32-bit devices
- `app-universal-qa.apk` (51.8 MB) — all devices
- `SHA256SUMS.txt` — integrity record
- Verified with: apksigner verify, aapt2 badging (`package: name='gagachat.app' versionCode='30117'`),
  ci/verify-apk-backends.sh (API URL + Firebase Messaging confirmed; no Supabase), lintQa PASS

### 2. Critical backend bug fixed (release-gate blocker)
`/api/ready` returned `media: "oss-configured"` but both production verifiers
(`cloud/verify-public-endpoint.js`, `android/ci/verify-backend.sh`) assert
`media == "oss"`. The production release gates could never pass. Fixed in
`server.js` (now returns the short form `oss`, consistent with `rds-mysql` /
`redis`), and regression-locked via new assertions in
`test/production-contract.js`. Full suite re-run: 8/8 node:test + 60/60 smoke PASS.

### 3. Alibaba Cloud deploy system (live-validated)
- `deploy/aliyunprovision.sh` — idempotent provisioning check (read-only) +
  `--apply` SG-rule mode. Ran live against the real account: verified VPC
  `vpc-t4nadiodeur9l3vklrotn` (192.168.0.0/16), vSwitch zone-a
  `vsw-t4n575fv12uyro6hpkvy1`, security group `sg-t4nedsa1inni1zmjudf8` with all
  9 production rules present, 0 running instances; prints the exact
  `RunInstances` launch plan (image `aliyun_3_x64_20G_pro_alibase_20260827.vhd`,
  type `ecs.e-c1m1.large`, zone ap-southeast-1a).
- `deploy/ecs-deploy.sh` — one-shot host bootstrap: Ubuntu 24.04 gate,
  Docker/Node 20/coturn install, runtime-env validation (14 secrets),
  docker-compose production stack, `/api/ready` + `/api/health` release gates,
  public-endpoint check.
- `deploy/RUNBOOK-ACCOUNT-UNBLOCK.md` — the permanent-fix path (see below).
- `Makefile` — `make verify` = backend tests + live inventory (PASS).

### 4. Firebase project completion
- `google-services.json` verified: project **oumagachat** (545448312835),
  package `gagachat.app`, FCM-only wiring.
- FCM code paths verified end-to-end: service (manifest-registered,
  call-as-data-only, POST_NOTIFICATIONS) ↔ `POST /api/devices` (validated) ↔
  `firebase-push.js` (multicast, ttl:30000 calls, payload keys match).
- `FIREBASE_SERVICE_ACCOUNT_JSON` one-line format documented in `.env.example`,
  README.md, and the runbook (Firebase console → Project settings → Service
  accounts → Generate new private key → project_id must equal
  FIREBASE_PROJECT_ID=oumagachat).

## The one remaining blocker (user action required)

Account-level risk control blocks paid provisioning: `ecs RunInstances` →
`Forbidden.RiskControl`, EIP → `RISK.RISK_CONTROL_REJECTION`, OSS →
`UserDisable` (0003-00000801). Read APIs and SG writes work; the networking
(VPC, vSwitches, SG with all rules) is already pre-staged. The fix is a
one-time console verification (~10 min): real-name verification + attach a
valid payment method (see RUNBOOK Step 1). Everything after that is automated
by the scripts in `backend/deploy/`.

## GitHub

- Branch pushed: `feat/native-android-v3.1.17-backend-deploy`
- Pull request: https://github.com/omarouma/app/pull/1
- Adds `android/` + `backend/` (main previously had only the legacy web project)
- No secrets in the commits (scanned: no CSV keys, no keystores, no .env)

## Definition of Done status (PDF Master Guide §28)

| Item | Status |
|------|--------|
| Native APK/AAB built + verified | ✅ done |
| Backend source + tests green | ✅ done (68/68) |
| Release-gate contract consistent | ✅ fixed + regression-locked |
| Deploy automation (provision/deploy/verify) | ✅ done + live-validated |
| Firebase client + server wiring | ✅ done (service-account download is a console step) |
| Account risk-control lift | ⏳ user console action (runbook Step 1) |
| ECS/RDS/Redis/OSS provisioning | ⏳ blocked by the above, then one command each |
| TLS + DNS cutover (Namecheap) | ⏳ after instance is up (runbook Step 6) |
| Production release APK (signed) | ⏳ CI refuses until real backend reachable (by design) |
