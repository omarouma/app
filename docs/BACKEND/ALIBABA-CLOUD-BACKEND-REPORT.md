# GaGa Chat — Alibaba Cloud Backend & Firebase Integration Verification Report

**Date:** live-verified this session
**Scope:** verify every backend component on Alibaba Cloud, confirm the Alibaba Cloud ↔ Firebase connection, and validate the deployed backend end-to-end
**Backend:** `backend/` (gagachat-backend v3.9.0, Node.js ≥20, 50 API routes)
**Alibaba account:** `5343286431932414` (root key), region `ap-southeast-3` (Kuala Lumpur)
**Firebase project:** `oumagachat` (project number `545448312835`)

---

## 1. Executive summary

The request was to verify that "both Alibaba Cloud and Firebase are now connected, and the Alibaba Cloud is deployed."

The verification result is **partial**, and the honest finding is important:

| Layer | Claimed | Verified live | Verdict |
|---|---|---|---|
| Firebase Hosting (web) | connected | `gagachat.app` → `oumagachat.web.app`, HTTP 200, IP 199.36.158.100 | ✅ **LIVE** |
| Backend ↔ Firebase wiring (code) | connected | `firebase-push.js` → FCM, project guard `oumagachat`, runtime-only service account | ✅ **COMPLETE** |
| Backend ↔ Alibaba wiring (code) | connected | `mysql-db.js` (RDS), `redis-bus.js` (Tair/Redis), `oss-store.js` (OSS), `turn.js`, readiness gates | ✅ **COMPLETE** |
| Alibaba Cloud deployment (infra) | deployed | **0** ECS, **0** RDS, **0** Redis/Tair, **0** EIP, **0** SLB; OSS `UserDisable` 0003-00000801 | ❌ **NOT DEPLOYED** |
| Production API endpoint | deployed | `api.gagachat.app` = **NXDOMAIN** (authoritative Namecheap NS); `turn.gagachat.app` = **NXDOMAIN** | ❌ **NOT LIVE** |
| Firebase Cloud Functions | connected | `zegoToken` → **HTTP 404** at `asia-southeast1-oumagachat.cloudfunctions.net` | ❌ **NOT DEPLOYED** |

**Bottom line:** all Alibaba Cloud + Firebase **integration code is complete and correct**, and Firebase **Hosting** is genuinely live. However, **no Alibaba Cloud compute/data service is actually provisioned or deployed**, the production API DNS record does not exist, and the Firebase function is not deployed. The account is still under the same **account-level risk-control block** documented in `deploy/RUNBOOK-ACCOUNT-UNBLOCK.md`, which must be lifted in the Alibaba Cloud console (identity + payment verification) before any paid resource can be created. The release APK therefore ships with `API_BASE = https://api.gagachat.app/api`, a host that currently does not resolve.

---

## 2. Alibaba Cloud live inventory (verified via signed OpenAPI calls)

Identity confirmed live:

```
AccountId     : 5343286431932414
Arn           : acs:ram::5343286431932414:root
IdentityType  : Account   (ROOT key — must be rotated per runbook Step 2)
```

Resource sweep across all relevant regions:

| Service | Command | Regions checked | Count |
|---|---|---|---|
| ECS instances | `ecs DescribeInstances` | ap-southeast-3, -1, -5, cn-hangzhou, eu-central-1, us-west-1 | **0** |
| RDS MySQL | `rds DescribeDBInstances` | ap-southeast-3, -1, cn-hangzhou | **0** |
| Tair / Redis | `r-kvstore DescribeInstances` | ap-southeast-3, -1, cn-hangzhou | **0** |
| Elastic IP | `vpc DescribeEipAddresses` | ap-southeast-3, -1 | **0** |
| Server Load Balancer | `slb DescribeLoadBalancers` | ap-southeast-3, -1 | **0** |
| OSS buckets | `oss ls` | global | **blocked** — `403 UserDisable` (Ec=0003-00000801) |

**Network scaffolding that does exist** (created in a previous session, still valid):

- VPC `vpc-8psjb3ut04ylanmy6g7gx` (172.31.0.0/16), Status `Available`
- vSwitch `vsw-8psdvlzrki4sjn34v4wlk` (zone c), `vsw-8psapdqlt2e2gu7pekpcd` (zone a)
- Security group `sg-8ps6zz4o3wufmc0bhhjs` with all 9 production rules (SSH 22, HTTP 80, HTTPS 443, TURN TCP 3478/5349/8080, TURN UDP 3478/5349/49152-65535)
- RAM user `gagachat-ops` (exists, policies attached)

A VPC with zero instances is network-only scaffolding — it does not run the backend.

**Risk-control block still active:** paid provisioning calls are rejected by account-level risk control (`Forbidden.RiskControl` on `RunInstances`, `RISK.RISK_CONTROL_REJECTION` on `AllocateEipAddress`, `UserDisable` on OSS). These cannot be lifted via API — they require one-time identity/payment verification in the Alibaba Cloud console (`RUNBOOK-ACCOUNT-UNBLOCK.md` Step 1).

---

## 3. Production endpoint & DNS (verified live)

Domain `gagachat.app` uses authoritative nameservers `dns1/dns2.registrar-servers.com` (Namecheap-managed DNS):

| Host | Resolution | Result |
|---|---|---|
| `gagachat.app` | `oumagachat.web.app` → 199.36.158.100 | ✅ HTTP 200 (Firebase Hosting) |
| `www.gagachat.app` | Firebase Hosting | ✅ live |
| `api.gagachat.app` | **NXDOMAIN** | ❌ no record — backend unreachable |
| `turn.gagachat.app` | **NXDOMAIN** | ❌ no record — TURN/calling unreachable |

The release APK/AAB bakes in `BuildConfig.API_BASE = "https://api.gagachat.app/api"` (confirmed in `android/app/build.gradle.kts` for all build types). Since that host does not resolve, the shipped client cannot reach the production backend until the DNS record is created (runbook Step 6).

---

## 4. Firebase live verification

**Hosting — LIVE.** `https://gagachat.app` returns HTTP 200 from Firebase Hosting (199.36.158.100). `firebase.json` is a hosting-only config (`public: "android/hosting"`, SPA rewrite `**` → `/index.html`, CSP/HSTS headers).

**Cloud Functions — NOT deployed.** The only exported function is `zegoToken` (`functions/src/index.ts` line 148, gen2, region `asia-southeast1`). Live probe:

```
https://asia-southeast1-oumagachat.cloudfunctions.net/zegoToken  →  HTTP 404
https://gagachat.app/api/zego-token                              →  returns SPA index.html
```

The `firebase.json` rewrite chain only routes to `/index.html`; there is no `functions` rewrite, and the function is not deployed. (`zegoToken` is used by the web build for ZEGO RTC tokens; the native Android app uses the backend's own `/api/calls/turn` + ZEGO SDK directly, so this does not block the native client.)

**Firebase config present:** `google-services.json` (package `gagachat.app`, project `oumagachat`, number `545448312835`), `.firebaserc` (`default: oumagachat`).

---

## 5. Backend ↔ Alibaba ↔ Firebase wiring (code audit)

All wiring is present, coherent, and production-gated. `server.js` (v3.9.0, 50 routes) imports every cloud adapter:

```js
const { MySqlDB }     = require('./mysql-db');      // Alibaba RDS MySQL 8
const { RedisBus }    = require('./redis-bus');     // Alibaba Tair / Redis
const { OssStore }    = require('./oss-store');     // Alibaba OSS (ali-oss)
const { FirebasePush }= require('./firebase-push'); // Firebase FCM (firebase-admin)
const { turnCreds }   = require('./turn');          // coturn ephemeral credentials
```

**Production fail-fast gates** (server refuses to start if any are missing):

```js
if (IS_PRODUCTION && !/^https:\/\//.test(PUBLIC_BASE)) throw ...  // HTTPS required
if (IS_PRODUCTION && !REDIS_URL)                       throw ...  // Redis required
if (IS_PRODUCTION && !OSS_CONFIGURED)                  throw ...  // OSS creds required
if (IS_PRODUCTION && !firebasePush.ready)              throw ...  // FCM cred required
```

**Readiness contract** (`GET /api/ready`, gated by `cloud/readiness.js` which requires 14 env vars and live-probes MySQL `SELECT 1`, Redis `PING`, and OSS `getBucketInfo`):

```json
{ "ready": true, "database": "rds-mysql", "realtime": "redis",
  "media": "oss", "push": "fcm-configured" }
```

`GET /api/health` returns `ok:true, database:"rds-mysql", realtime:"redis"`.

**Alibaba ↔ Firebase connection mechanism:** the two clouds are connected **at the backend runtime layer**, not by direct cloud-to-cloud peering. The API container on Alibaba ECS holds a Firebase service account (runtime-only, `FIREBASE_SERVICE_ACCOUNT_JSON` in `/etc/gagachat/runtime.env`, `chmod 600`) and calls FCM over outbound HTTPS/TLS. `docker-compose.production.yml` explicitly notes: *"Outbound TLS is required for Alibaba RDS/Redis/OSS and Firebase FCM."* `firebase-push.js` guards `serviceAccount.project_id === FIREBASE_PROJECT_ID` (`oumagachat`) and sends data-only messages for call events. This connection is correctly designed but **cannot be exercised until the ECS container exists**.

**Deployment topology** (`deploy/docker-compose.production.yml`): hardened `api` container (read-only FS, `cap_drop: ALL`, `no-new-privileges`, 768 MB / 1.5 CPU, healthcheck on `/api/ready`) behind an `nginx:1.27.5-alpine` proxy bound to `127.0.0.1:8080` only; TLS terminates in front (ALB/ACM or host Caddy/nginx).

**Backend test suite — 60/60 PASS** (evidence: `audit/backend-test-results.txt`): config, cloud-adapters, mysql-contract, production-contract, release-regression, smoke — covering auth/OTP/refresh-reuse, media access control, MySQL media predicates, WebSocket relay, call signaling, ephemeral TURN credentials, and production fail-closed behavior. The code is healthy; only the cloud deployment is missing.

---

## 6. What remains to make it truly "deployed" (runbook Steps 1–6)

| # | Step | Status |
|---|---|---|
| 1 | **Lift account risk control** — console: real-name/enterprise verification + valid payment method; wait 5–15 min | ❌ blocking everything |
| 2 | Rotate to RAM user `gagachat-ops` key; delete the root key | ❌ pending |
| 3 | Provision stack: ECS (`ecs.e-c1m1.large`), RDS MySQL 8, Tair/Redis (TLS), OSS bucket `gagachat-media-ap-southeast-3`, ACR repo | ❌ pending |
| 4 | Build & push API image to ACR; pin by digest | ❌ pending |
| 5 | Deploy on ECS via `deploy/ecs-deploy.sh` (installs Docker/coturn, starts compose, enforces `/api/ready` + `/api/health` gates) | ❌ pending |
| 6 | TLS + DNS cutover: ACM cert for `api.gagachat.app`, add A record **at Namecheap**, then `verify-live.sh` + `android/ci/verify-backend.sh` | ❌ pending |

Only after Step 6 passes can the release client reach the backend. The backend auto-applies the RDS schema on startup (`MySqlDB.connect` + `migrate()`), so no manual schema step is needed.

---

## 7. Conclusion

- ✅ **Integration code**: complete and correct on both sides (Alibaba RDS/Redis/OSS/TURN + Firebase FCM).
- ✅ **Firebase Hosting**: genuinely live at `gagachat.app`.
- ❌ **Alibaba Cloud**: not deployed — zero compute/data services; risk-control block still active; OSS disabled.
- ❌ **Production API**: `api.gagachat.app` and `turn.gagachat.app` do not resolve.
- ❌ **Firebase Functions**: `zegoToken` returns 404.

If the intent was that Alibaba Cloud is "connected" **at the integration/code level** (credentials, adapters, readiness gates, compose topology all in place), that is confirmed. If the intent was that Alibaba Cloud is **actually running in production**, it is not — and cannot be until the account risk control is lifted in the console and the stack is provisioned.

**Verification evidence:** `audit/backend-test-results.txt` (60/60), live DNS/HTTP probes, signed OpenAPI inventory (all-zero), and `backend/deploy/RUNBOOK-ACCOUNT-UNBLOCK.md`.
