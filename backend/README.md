# GaGaChat backend v3.9.0 Alibaba production runtime

Production APIs include consent-based contacts, block/report enforcement, account JSON export,
password-confirmed account deletion, idempotent messaging, moderated group membership, WebSocket
realtime delivery, global people/message search, call history, sender-controlled message deletion,
TURN credentials, private OSS media, Firebase push, RDS MySQL and Redis.

Production mode uses Alibaba RDS MySQL for durable data, Tair/Redis for
multi-instance realtime fan-out and presence, and private OSS for media. Local
development retains SQLite and in-process WebSockets for reproducible tests.

Security changes include short-lived access JWTs, opaque refresh-token rotation,
reuse detection, server-side revocation, API rate limiting, membership checks,
multi-device WebSocket sessions, call-participant authorization, and idempotent
message creation via `client_message_id`.

Contacts are consent-based: adding a username creates a pending friend request;
only the recipient can accept or reject it. Accepted requests create the
bidirectional contact relationship transactionally in SQLite or RDS.

OTP, wallet money operations, and local-disk uploads fail closed in production.
Rate-limited username/password self-registration can be controlled with
`ENABLE_SELF_REGISTRATION`; newly created users remain unverified until a real
OTP provider is connected. Connect Alibaba SMS, a regulated double-entry wallet,
verified payment webhooks, and the necessary compliance controls before
enabling equivalent production features.

Alibaba RDS schema, a transactional SQLite-to-RDS migration command, and live
RDS/Redis/OSS readiness probes are under `cloud/`. See
`DEPLOY-ALIBABA-CLOUD.md`. Production startup connects to RDS, applies the
idempotent schema, and refuses to listen if RDS, Redis or OSS configuration is
missing or unreachable.

When `REDIS_URL` is present, realtime events are published across API instances
through Alibaba Tair/Redis and presence receives a renewable 75-second TTL.
Production startup now refuses to run without Redis; local development keeps
the single-process fallback.

Production media uses five-minute OSS PUT tickets and private signed downloads;
OSS credentials remain server-side. Firebase Admin sends background message and
call notifications using runtime service-account JSON. No Firebase Cloud
Functions or Blaze-only workflow is used.

`mysql-db.js` implements the production RDS repository contract with TLS,
connection pooling, transactional DM/session/contact operations, idempotent
messages, devices, private media and calls. Every API and WebSocket database
operation awaits the repository, while SQLite remains available for local tests.

## Test

Use Node.js 20:

```bash
npm ci
npm test
```

## Run locally

Copy `.env.example` to a private environment configuration and set real random
secrets outside source control. For local smoke testing only, the prototype
adapters may be enabled when `NODE_ENV` is not `production`.
