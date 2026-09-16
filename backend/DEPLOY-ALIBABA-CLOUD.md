# Alibaba production gate

The Android app calls `https://api.gagachat.app/api`. Do not route that domain to this service until every check below passes.

## Singapore VPC inventory checked September 2026

The supplied `ap-southeast-1` export identifies the intended production
network as `gagachat-vpc` (`192.168.0.0/16`) with one vSwitch
(`192.168.0.0/24`, Singapore zone A) and **zero cloud instances**. The default
Singapore VPC (`172.16.0.0/12`) also has zero instances. Console screenshots
show security groups and monitoring workspaces, but no ECS, RDS, Redis, EIP,
ALB or SLB serving the application. These private CIDRs and resource IDs are
not API destinations and must not be placed in Android or public DNS.

First inspect ECS > Instances and ALB/SLB in the intended Alibaba region. If
there is no running API workload, provision and deploy it in that VPC, attach
a public HTTPS ingress, and obtain its actual public IP or load-balancer DNS
name. Only then set the `api.gagachat.app` DNS record, confirm a valid TLS
certificate, and run the public endpoint checks below. A DNS record alone
cannot make an empty VPC serve the API. Keep RDS, Redis, and OSS private.

The supplied security-group screenshot shows multiple inbound rules sourced
from `0.0.0.0/0`. Before attaching an instance, restrict TCP 22 to a known
administrator IP (or use Alibaba Cloud Workbench), keep the container/API port
8080 private behind the proxy/load balancer, and expose only required public
web/TURN ports. Never expose RDS 3306 or Redis 6379 to the Internet.

1. Create private-network RDS MySQL 8, Tair/Redis with TLS, and a private OSS bucket in the same region as ECS/ACK.
2. Apply `cloud/rds-schema.sql`; allow inbound database/cache traffic only from the application security group.
3. Put `.env.example` values in Alibaba Cloud Secrets Manager or encrypted ACK secrets. Never store secrets in this repository or the APK.
4. Run `npm ci`, then `npm run cloud:check`. Deployment must stop unless RDS, Redis and OSS all return ready.
5. For existing staging data, snapshot both databases and run `npm run cloud:migrate` once with `SQLITE_SOURCE_PATH` set.
6. Deploy behind an Alibaba SLB/ALB with TLS, map `/api` and `/api/ws`, and preserve WebSocket upgrade headers.
7. Require `/api/ready` to return HTTP 200 with RDS, Redis and OSS production
   readiness, then run two-user messaging/calling,
   background FCM, OSS upload and TURN tests before changing public DNS.
8. After DNS/TLS cutover, run `npm run deploy:verify`. It must confirm RDS,
   Redis, OSS and anonymous WebSocket rejection over HTTPS/WSS.

For an ECS deployment, copy `deploy/` to `/opt/gagachat/deploy`, store a
root-readable `0600` environment file at `/etc/gagachat/runtime.env`, and set
`GAGA_API_IMAGE` to an immutable Alibaba Container Registry image digest before
running the production Compose file. Bind the local proxy only behind the
Alibaba ALB/SLB; terminate the public TLS certificate there.

`/api/health` must report `realtime: redis` and `database: rds-mysql`. Local
values are acceptable only for development and must never pass the production
release gate.

## Private media and push

- Android requests `POST /api/media/upload-ticket`, uploads directly to the
  five-minute signed OSS URL, then calls `/api/media/{id}/complete`.
- The API returns its own stable media URL; each download is redirected to a
  short-lived private OSS signature. OSS keys never enter the APK.
- Firebase Admin credentials are runtime-only. The API uses FCM for message and
  incoming-call delivery and does not use Firebase Cloud Functions.

Production runtime queries use the MySQL repository. SQLite is restricted to
local development and one-time migration input; live RDS, Redis and OSS probes
plus end-to-end device tests remain mandatory before public DNS cutover.
