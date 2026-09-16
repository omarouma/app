# GaGa Chat — Alibaba Cloud Account Unblock & Production Runbook

This runbook turns the current account state (networking pre-staged, all paid
provisioning blocked) into a running production backend. Everything except the
one-time account verification steps is fully automated by the scripts in this
directory.

## Current account state (verified live 2026-09)

Verified via OpenAPI (aliyun CLI + signed RPC calls) against account
`5343286431932414`, region `ap-southeast-1` (Singapore):

- Present and correct: VPC `vpc-t4nadiodeur9l3vklrotn` (gagachat-vpc, 192.168.0.0/16), vSwitch
  `vsw-t4n575fv12uyro6hpkvy1` (gagachat-vsw, zone ap-southeast-1a),
  security groups `sg-t4nedsa1inni1zmjudf8` (gagachat-sg-vpc), `sg-t4n8l4ys0wuasmvcqk9l` (gagachat-sg) and `sg-t4nf7fdomo8l1dp16bu2` (gagachat-sg-sg) with production rules (SSH 22,
  HTTP 80, HTTPS 443, TURN TCP 3478/5349/8080, TURN UDP 3478/5349/49152-65535),
  IPv6 gateway, RAM user `gagachat-ops` (exists, policies attached).
- Zero instances: no ECS, no RDS, no Redis/Tair, no OSS buckets.
- DNS: `api.gagachat.app` = NXDOMAIN; domain NS = `registrar-servers.com`
  (Namecheap — DNS is managed at Namecheap, not Alibaba).
- API responses: read operations work; `ecs RunInstances` returns
  `Forbidden.RiskControl`, EIP `AllocateEipAddress` returns
  `RISK.RISK_CONTROL_REJECTION`, OSS returns `UserDisable` (error 0003-00000801).
- The supplied AccessKey is the ROOT account key (Arn
  `acs:ram::5343286431932414:root`).

The blocks are account-level risk-control (new account + unverified payment
method + no prior paid usage). They cannot be lifted by API; they require
one-time identity/payment verification in the console.

## Step 1 — Lift account risk control (one time, ~10 minutes, console only)

1. Sign in to the Alibaba Cloud console with the account owner login
   (not the RAM user): https://www.alibabacloud.com/
2. Complete real-name/enterprise verification: Account → Real-name
   Verification. Risk control on new accounts is lifted once identity
   verification is complete.
3. Attach a valid payment method: Billing → Payment Methods. Add a credit
   card. Risk-control rejections on paid provisioning (ECS RunInstances, EIP
   allocation, OSS enablement) clear once a payment method is verified and
   the account has a small positive balance or valid credit card on file.
4. Top up a small balance (e.g. USD 10) — optional but recommended;
   `Forbidden.RiskControl` on OSS (`UserDisable`) clears when the account is
   activated for billing.
5. Wait 5–15 minutes; risk-control decisions refresh automatically.
6. Verify the block is lifted (run from this directory):
   `aliyun ecs DescribeAvailableResources --RegionId ap-southeast-1 --DestinationResource InstanceType --ZoneId ap-southeast-1a --InstanceChargeType PostPaid`
   and attempt the paid call from `aliyunprovision.sh` output.

If the console shows the account as verified and calls still fail, open a
support ticket (After-Sales → Submit a Ticket → Account category, quote error
codes `Forbidden.RiskControl`, `RISK.RISK_CONTROL_REJECTION`, OSS
`0003-00000801`). Risk control tickets are typically resolved in 1–2 business
days.

## Step 2 — Rotate to the RAM user key (security, 10 minutes)

The APK/build pipeline received a ROOT AccessKey. Rotate it after unblock:

1. Console → RAM → Users → `gagachat-ops` → Create AccessKey.
2. Update local config: `aliyun configure set --access-key-id <new> --access-key-secret <new> --region ap-southeast-1`
3. Re-run `./aliyunprovision.sh` — it now reports `identity: ...:gagachat-ops`
   and no longer prints the ROOT warning.
4. Console → RAM → Users → root key `LTAI5tFBJh...` → Disable/Delete.
   Never use the root key for tooling again.

## Step 3 — Provision the stack (one command)

After Steps 1–2, from the deploy directory:

```
./aliyunprovision.sh            # re-verify network + print launch plan
# execute the printed RunInstances command, then:
./aliyunprovision.sh            # confirm the instance appears in inventory
```

Then create the private data services (console or CLI — first paid creation
of each type):

- RDS MySQL 8 (same region, same VPC, private): `db.r6g.1.large`-class, 1
  instance, database `gagachat`, user per `.env.example` (`RDS_*`).
- Tair/Redis (same VPC, private, TLS): `REDIS_URL` =
  `rediss://:<password>@<host>:6379/0`.
- OSS bucket, private-read: `gagachat-media-ap-southeast-1` → `OSS_*`.
- ACR repository: `gagachat-api` → build & push the image (Step 4).

The backend auto-applies the RDS schema at startup (`MySqlDB.connect` +
`migrate()` in `server.js` `startServer()`), so no manual schema step is
required — `cloud/rds-schema.sql` is only needed for the optional
`npm run cloud:migrate` SQLite import.

## Step 4 — Build and push the API image

From the `backend/` directory:

```
docker build -t registry.ap-southeast-1.aliyuncs.com/<ns>/gagachat-api:3.9.0 .
docker push registry.ap-southeast-1.aliyuncs.com/<ns>/gagachat-api:3.9.0
# pin by digest for production:
docker inspect --format='{{index .RepoDigests 0}}' <ns>/gagachat-api:3.9.0
# put the @sha256:... digest into /etc/gagachat/runtime.env as GAGA_API_IMAGE
```

## Step 5 — Deploy on the ECS host

On your workstation: `rsync -av backend/ root@<public-ip>:/opt/gagachat/repo/backend/`
(create `/etc/gagachat/runtime.env` first — mirror of `.env.example`, `chmod 600`,
plus `GAGA_API_IMAGE` from Step 4 and `FIREBASE_PROJECT_ID=oumagachat`).

On the host: `cd /opt/gagachat/repo/backend/deploy && ./ecs-deploy.sh`

The script installs Docker/Node/coturn, writes coturn config, starts the
compose stack, and enforces the release gates:

- local `/api/ready` must return `ready:true, database:"rds-mysql", realtime:"redis", media:"oss"`
- local `/api/health` must return `ok:true, database:"rds-mysql", realtime:"redis"`
- public `$PUBLIC_BASE/ready` is checked but non-fatal (until DNS cutover)

Note: the `/api/ready` `media` value was fixed this session (2026-09) from
`oss-configured` to `oss` in `server.js` — it now matches both verifiers
(`cloud/verify-public-endpoint.js`, `android/ci/verify-backend.sh`).

## Step 6 — TLS + DNS cutover

1. TLS terminates in front of the compose proxy (127.0.0.1:8080). Either:
   - Alibaba ALB/SLB with an ACM cert for `api.gagachat.app` (recommended), or
   - Caddy/nginx on the host with a Let's Encrypt cert, listening on 80/443
     and proxying to 127.0.0.1:8080.
2. Set the DNS record **at Namecheap** (the domain uses
   `registrar-servers.com` nameservers): Advanced DNS → add A record
   `api` → `<ECS public IP>`.
3. From the host: `./ecs-deploy.sh --verify` — must show
   `public endpoint VERIFIED`.
4. From anywhere: `bash deploy/verify-live.sh` and
   `npm run deploy:verify` — RDS/Redis/OSS readiness + anonymous WebSocket
   rejection over HTTPS/WSS must all pass.
5. From the Android repo: `android/ci/verify-backend.sh` —
   `https://api.gagachat.app/api` health/ready/DNS checks must pass.

Only after all of the above: build the release APK/AAB (`./gradlew
assembleRelease bundleRelease` with the signing secrets) — the CI
`signed_release` job refuses to build unless the real backend is reachable.

## Definition of Done (PDF Master Guide §28)

The APK alone is not completion: production is complete only when the client
and cloud work together — real auth, RDS MySQL, Redis realtime, OSS media,
FCM push (Firebase service account), WebSocket, TURN calling — all verified
against `https://api.gagachat.app/api` over TLS.

## Firebase FCM (Step for /etc/gagachat/runtime.env)

`FIREBASE_SERVICE_ACCOUNT_JSON` must be a full service-account private key for
Firebase project **oumagachat** (project number 545448312835):

1. Firebase console → Project settings → Service accounts.
2. "Generate new private key" → download JSON.
3. Put the entire compact JSON on ONE line into
   `/etc/gagachat/runtime.env` as `FIREBASE_SERVICE_ACCOUNT_JSON=<json>`.
4. `firebase-push.js` validates `project_id` == `FIREBASE_PROJECT_ID`
   (`oumagachat`) and initializes `admin.credential.cert()`.

The Android app already has the correct `google-services.json` (package
`gagachat.app`, project oumagachat) wired for FCM only — no other Firebase
products are used by this codebase.
