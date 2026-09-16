# GaGa calling on Alibaba ECS — no ZEGO

This package implements one-to-one browser audio/video calling using native WebRTC, an authenticated Node WebSocket signaling gateway, and your own coturn relay. It does not use Alibaba's commercial RTC API or a paid calling SDK. ECS, public IP, bandwidth and operational costs still apply.

The web client uses `VITE_CALLING_API_URL=https://calls.gagachat.app`. Configure that origin and include it in the hosting CSP if using another domain.

## Current identity/data boundary

Authentication, call invitations and call history still use the app's existing Supabase backend. The Alibaba gateway verifies that session and call membership using the user's database permissions before issuing TURN credentials or relaying signaling. No service-role key is required. A complete Alibaba identity/data migration is separate work; do not remove Supabase until the app and gateway have the replacement API contracts.

## Install on the existing ECS instance

1. Use an Ubuntu/Debian ECS host with a public IPv4 address. Check existing instance CPU and available bandwidth before purchasing anything.
2. Install Node.js 22 or later, coturn and Caddy from their supported distributions.
3. Copy this directory into `/opt/gaga-calling`, create an unprivileged `gagacall` service user, and run `npm ci --omit=dev` in that directory.
4. Put real values from `.env.example` in `/etc/gaga-calling.env`. Generate a random server-only TURN shared secret, keep that file readable only by root/service users, and use the same secret in coturn's configuration. Never expose it through a VITE variable.
5. Create DNS A records for `calls.gagachat.app` and `turn.gagachat.app` pointing to the ECS public IP. Obtain a valid TLS certificate for the TURN hostname. The `turnserver.conf.example` needs real ECS private/public IPs and TLS certificate paths; install it as the host's coturn configuration after substituting the placeholders.
6. Install `Caddyfile` as part of your existing Caddy configuration without overwriting other sites. The gateway binds to localhost; Caddy terminates HTTPS/WSS and proxies to port 8080.
7. Install the supplied systemd service, then enable/start it. Adjust `/usr/bin/node` to the actual Node installation location when necessary. Configure coturn's service to start at boot and reload it after changing its configuration.
8. Open Alibaba security-group and host firewall ports: TCP 80/443 for HTTPS/certificate issuance; UDP and TCP 3478 for TURN; TCP 5349 for TURN over TLS; UDP 49160–49259 for relay allocations. Keep port 8080, databases and internal services private. The limited relay range limits simultaneous allocations; increase only after capacity review.
9. Run `npm test` in this directory, check `/healthz`, then rebuild the frontend with its real configuration and deploy to staging using the confirmed Firebase project. The source currently targets `oumagachat`.

## Required real-device checks

- A and B are on different mobile networks; both voice and video work.
- Force `iceTransportPolicy: 'relay'` in a temporary QA build and verify selected candidates are relay candidates; remove the forced policy after the test. A passing local signaling test does not prove TURN works.
- Denied microphone/camera permission leaves the invitation unaccepted.
- Hangup while acquiring media does not open a later peer connection and releases tracks.
- Incoming invitation, rejected/missed call and history work with the existing data permissions.
- Autoplay-blocked audio shows a user gesture to start sound.
- Temporarily interrupt signaling, restore it, and verify the same call recovers without a second microphone request.
- End the call during recovery and confirm no socket, media track or timer reopens.
- Keep a forced-relay call active beyond one hour and confirm authenticated credential renewal and ICE restart maintain media.
- Revoke membership/end the invitation and confirm subsequent signaling is rejected without endless retries.
- Test Bangladesh and China independently. Reachability is not guaranteed by hosting location.

## Scope and limits

This is a first one-to-one implementation, not a global production certification. Group calls require an SFU/media service and are explicitly unavailable. Live streams and voice rooms retain legacy peer code and need their own authenticated ICE/SFU migration. Existing chat/data/security fixes are retained.

The gateway is single-process and uses transient connection state. The client retries signaling up to four times with fresh session tokens, reuses existing media, and restarts ICE negotiation. Revoked access and replaced sessions stop recovery. It renews TURN configuration after 45 minutes, before the current one-hour credential lifetime, and rejoins signaling for an ICE restart. Actual recovery and long-duration relay behavior still need real-device validation. Quality badges use interval inbound packet loss, jitter and selected-candidate round-trip time; the thresholds are application heuristics, not a production quality guarantee. Geographically distributed routing, native Android background calling/push, comprehensive QoS dashboards, production load testing and monitoring remain follow-up work. Web browser background behavior is not a substitute for native Android integration.

Use a reverse-proxy/WAF request limit for `/ice` and connection limits for `/signal`; tune coturn quotas and monitor egress. The example coturn config denies private/metadata destinations; validate the config against the installed coturn version and your network topology before exposing the relay.

For budget, measure relayed minutes, average media bitrate and Alibaba egress price before projecting monthly cost. Direct peer-to-peer calls use little signaling bandwidth; relayed media can dominate the bill. Do not promise unlimited globally free calling.

References:
- https://webrtc.org/getting-started/turn-server
- https://www.alibabacloud.com/help/en/ecs/
- https://github.com/coturn/coturn/blob/master/examples/etc/turnserver.conf

WebRTC API references: [peer configuration and ICE restart](https://www.w3.org/TR/webrtc/) and [statistics fields](https://www.w3.org/TR/webrtc-stats/).
