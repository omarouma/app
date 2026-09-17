#!/usr/bin/env node
/**
 * Local smoke test for the GaGa calling gateway.
 *
 * Boots the *real* `createCallingServer` from server.mjs on an ephemeral port
 * with a stubbed access verifier, then exercises every public surface:
 *
 *   1. GET /healthz            -> 200 "ok"          (used by verifyCallingAvailability)
 *   2. GET /ice                -> 200 { iceServers } (used by AlibabaCall.fetchIce)
 *   3. GET /ice  (no token)    -> 401
 *   4. GET /ice  (bad origin)  -> 403
 *   5. WS  /signal (no auth)   -> closed 1008
 *   6. WS  /signal (bad token) -> closed 1008
 *   7. WS  /signal (caller+callee) -> ready, peer-ready, offer/answer/ice relay
 *
 * Run:  node scripts/local-smoke.mjs
 * Exit: 0 on success, 1 on any failure.
 */
import { createCallingServer } from '../server.mjs';
import { WebSocket } from 'ws';

const TURN_SECRET = 'local-smoke-secret-that-is-at-least-32-chars-long';
const ORIGIN = 'https://gagachat.app';
const CALL_ID = '11111111-2222-3333-4444-555555555555';
const CALLER = { userId: 'user-caller', caller: true };
const CALLEE = { userId: 'user-callee', caller: false };

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} - ${name}${detail ? ` (${detail})` : ''}`);
}

const config = {
  origins: [ORIGIN],
  turnUrls: ['turn:turn.gagachat.app:3478?transport=udp', 'turns:turn.gagachat.app:5349?transport=tcp'],
  turnSecret: TURN_SECRET,
  supabaseUrl: 'https://example.supabase.co',
  anonKey: 'anon',
};

// Stub verifier: token 'caller-token' / 'callee-token' are valid, anything else 403s.
const verifyAccess = async (token) => {
  if (token === 'caller-token') return CALLER;
  if (token === 'callee-token') return CALLEE;
  throw new Error('Forbidden');
};

const { server, wss } = createCallingServer(config, verifyAccess);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;
console.log(`gateway listening on ${base}\n`);

/**
 * Opens a socket and returns a small buffered reader. Messages are queued as
 * soon as they arrive, so a `next()` call never misses a message that landed
 * between two awaits (the gateway can emit `ready` and `peer-ready` back to
 * back, which a naive `once('message')` reader would drop).
 */
const openSocket = (token) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/signal`, { headers: { Origin: ORIGIN } });
    const queue = [];
    const waiters = [];
    const closed = [];
    const closeWaiters = [];
    let closeCode = null;

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      const waiter = waiters.shift();
      if (waiter) waiter.resolve(msg);
      else queue.push(msg);
    });
    ws.on('close', (code) => {
      closeCode = code;
      const waiter = closeWaiters.shift();
      if (waiter) waiter.resolve(code);
      else closed.push(code);
    });

    const timer = setTimeout(() => reject(new Error('socket timeout')), 5000);
    ws.on('open', () => {
      clearTimeout(timer);
      if (token) ws.send(JSON.stringify({ type: 'auth', token, callId: CALL_ID }));
      resolve({
        ws,
        next: (timeoutMs = 5000) => {
          if (queue.length) return Promise.resolve(queue.shift());
          return new Promise((res, rej) => {
            const t = setTimeout(() => rej(new Error('message timeout')), timeoutMs);
            waiters.push({ resolve: (m) => { clearTimeout(t); res(m); } });
          });
        },
        closed: (timeoutMs = 5000) => {
          if (closeCode !== null) return Promise.resolve(closeCode);
          return new Promise((res, rej) => {
            const t = setTimeout(() => rej(new Error('close timeout')), timeoutMs);
            closeWaiters.push({ resolve: (c) => { clearTimeout(t); res(c); } });
          });
        },
        send: (obj) => ws.send(JSON.stringify(obj)),
        close: () => ws.close(),
      });
    });
    ws.on('error', (err) => { clearTimeout(timer); reject(err); });
  });

try {
  // 1. healthz
  const health = await fetch(`${base}/healthz`, { headers: { Origin: ORIGIN } });
  check('GET /healthz returns 200 "ok"', health.status === 200 && (await health.text()).trim() === 'ok', `status=${health.status}`);

  // 2. /ice with a valid token
  const ice = await fetch(`${base}/ice?call=${CALL_ID}`, { headers: { Origin: ORIGIN, Authorization: 'Bearer caller-token' } });
  const iceBody = ice.ok ? await ice.json() : null;
  const servers = iceBody?.iceServers ?? [];
  const hasTurn = servers.some((s) => String(s.urls).includes('turn:'));
  const hasTurns = servers.some((s) => String(s.urls).includes('turns:'));
  const hasCreds = servers.every((s) => typeof s.username === 'string' && typeof s.credential === 'string' && s.username.includes(':'));
  check('GET /ice returns TURN + TURNS with time-limited credentials', ice.status === 200 && hasTurn && hasTurns && hasCreds, `status=${ice.status} servers=${servers.length}`);

  // 3. /ice without a token. The gateway deliberately returns 403 (not 401) for
  //    every access failure so it never leaks whether a token was present.
  const noAuth = await fetch(`${base}/ice?call=${CALL_ID}`, { headers: { Origin: ORIGIN } });
  check('GET /ice without a token is rejected', noAuth.status === 403, `status=${noAuth.status}`);

  // 4. /ice from a disallowed origin
  const badOrigin = await fetch(`${base}/ice?call=${CALL_ID}`, { headers: { Origin: 'https://evil.example', Authorization: 'Bearer caller-token' } });
  check('GET /ice from a disallowed origin is rejected', badOrigin.status === 403, `status=${badOrigin.status}`);

  // 5. WS without auth -> closed 1008 once the 12s auth timer fires.
  const anon = await openSocket(null);
  check('WS /signal without auth is closed 1008', (await anon.closed(15000)) === 1008);

  // 6. WS with a bad token -> closed 1008 immediately (authorize throws).
  const bad = await openSocket('nope');
  check('WS /signal with an invalid token is closed 1008', (await bad.closed()) === 1008);

  // 7. Full caller + callee handshake and relay
  const caller = await openSocket('caller-token');
  const callerReady = await caller.next();
  check('caller receives ready(caller=true)', callerReady.type === 'ready' && callerReady.caller === true, JSON.stringify(callerReady));

  const callee = await openSocket('callee-token');
  const calleeReady = await callee.next();
  check('callee receives ready(caller=false)', calleeReady.type === 'ready' && calleeReady.caller === false, JSON.stringify(calleeReady));

  // Both sides should learn the peer is present.
  const callerPeer = await caller.next();
  const calleePeer = await callee.next();
  check('both peers receive peer-ready', callerPeer.type === 'peer-ready' && calleePeer.type === 'peer-ready');

  // Caller sends an offer; callee must receive it verbatim.
  const offer = { type: 'offer', sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n' };
  caller.send({ type: 'offer', data: offer });
  const relayedOffer = await callee.next();
  check('offer is relayed caller -> callee', relayedOffer.type === 'offer' && relayedOffer.data?.sdp === offer.sdp);

  // Callee answers; caller must receive it.
  const answer = { type: 'answer', sdp: 'v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\n' };
  callee.send({ type: 'answer', data: answer });
  const relayedAnswer = await caller.next();
  check('answer is relayed callee -> caller', relayedAnswer.type === 'answer' && relayedAnswer.data?.sdp === answer.sdp);

  // ICE candidate relay.
  const candidate = { candidate: 'candidate:1 1 udp 1 127.0.0.1 5000 typ host', sdpMid: '0', sdpMLineIndex: 0 };
  caller.send({ type: 'ice', data: candidate });
  const relayedIce = await callee.next();
  check('ICE candidate is relayed caller -> callee', relayedIce.type === 'ice' && relayedIce.data?.candidate === candidate.candidate);

  // Role enforcement: the callee must not be able to send an offer.
  callee.send({ type: 'offer', data: offer });
  check('callee sending an offer is rejected (role enforcement)', (await callee.closed()) === 1008);

  caller.close();
} catch (error) {
  check('smoke run completed without throwing', false, error instanceof Error ? error.message : String(error));
} finally {
  for (const client of wss.clients) client.terminate();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
