# Alibaba production gate

The Android app calls `https://api.gagachat.app/api`. Do not route that domain to this service until every check below passes.

## Malaysia VPC inventory checked September 2026

The supplied `ap-southeast-3` VPC export lists `gagachat-vpc` with private
IPv4 CIDR `172.31.0.0/16`, allocated IPv6 CIDR `240b:400e:84:b00::/56`,
two vSwitches, and **zero cloud instances**. Console screenshots show an IPv6
gateway but do not identify a public application server or ALB. These VPC
addresses are network allocations, not an API destination; do not put the
private CIDR, VPC ID, IPv6 CIDR, or RAM login domain into Android or public DNS.

First inspect ECS > Instances and ALB/SLB in the intended Alibaba region. If
there is no running API workload, provision and deploy it in that VPC, attach
a public HTTPS ingress, and obtain its actual public IP or load-balancer DNS
name. Only then set the `api.gagachat.app` DNS record, confirm a valid TLS
certificate, and run the public endpoint checks below. A DNS record alone
cannot make an empty VPC serve the API. Keep RDS, Redis, and OSS private.

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
