import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createCallingServer, turnCredentials, validSignal } from './server.mjs';
test('TURN passwords expire and differ by user', () => {
  const a = turnCredentials('a', 'secret', 1000); assert.equal(a.username, '4600:a');
  assert.notEqual(a.credential, turnCredentials('b', 'secret', 1000).credential);
});
test('SDP signaling enforces caller/callee roles and message size', () => {
  assert.equal(validSignal({ type: 'offer', data: { type: 'offer', sdp: 'x' } }, false), false);
  assert.equal(validSignal({ type: 'answer', data: { type: 'answer', sdp: 'x' } }, true), false);
  assert.equal(validSignal({ type: 'offer', data: { type: 'offer', sdp: 'x'.repeat(70000) } }, true), false);
});
test('real local sockets exchange SDP and ICE and reject unauthorized access', async () => {
  const verify = async token => { if (!['caller', 'callee'].includes(token)) throw new Error('Forbidden'); return { userId: token, caller: token === 'caller' }; };
  const { server, wss } = createCallingServer({ origins: ['https://gagachat.app'], turnUrls: ['turn:localhost:3478'], turnSecret: 'test-secret' }, verify);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`; const sockets = [];
  const connect = async token => {
    const ws = new WebSocket(base.replace('http:', 'ws:') + '/signal'); sockets.push(ws); await once(ws, 'open');
    const ready = once(ws, 'message'); ws.send(JSON.stringify({ type: 'auth', token, callId: 'call-id' })); await ready; return ws;
  };
  try {
    assert.equal((await fetch(base + '/ice?call=call-id', { headers: { Authorization: 'Bearer outsider' } })).status, 403);
    const ice = await (await fetch(base + '/ice?call=call-id', { headers: { Authorization: 'Bearer caller' } })).json(); assert.ok(ice.iceServers[0].credential);
    const caller = await connect('caller'); const peerReady = once(caller, 'message'); const callee = await connect('callee'); await peerReady;
    await new Promise(r => setTimeout(r, 10));
    const offer = once(callee, 'message'); caller.send(JSON.stringify({ type: 'offer', data: { type: 'offer', sdp: 'offer' } }));
    assert.equal(JSON.parse((await offer)[0]).data.sdp, 'offer');
    const received = []; caller.on('message', raw => received.push(JSON.parse(raw)));
    callee.send(JSON.stringify({ type: 'answer', data: { type: 'answer', sdp: 'answer' } }));
    callee.send(JSON.stringify({ type: 'ice', data: { candidate: 'ice-1' } }));
    callee.send(JSON.stringify({ type: 'ice', data: { candidate: 'ice-2' } }));
    await new Promise(r => setTimeout(r, 30)); assert.deepEqual(received.map(m => m.type), ['answer', 'ice', 'ice']);
  } finally { sockets.forEach(ws => ws.terminate()); await new Promise(r => wss.close(r)); await new Promise(r => server.close(r)); }
});
