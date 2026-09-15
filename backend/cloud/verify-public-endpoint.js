'use strict';
const assert = require('assert');
const WebSocket = require('ws');

const base = String(process.env.GAGA_PUBLIC_API || 'https://api.gagachat.app/api').replace(/\/+$/, '');
if (!base.startsWith('https://')) throw new Error('GAGA_PUBLIC_API must use HTTPS');

async function json(path) {
  const response = await fetch(`${base}${path}`, {
    signal: AbortSignal.timeout(10000),
    headers: { accept: 'application/json' }
  });
  const body = await response.json();
  return { response, body };
}

async function verifyWebSocketRejectsAnonymous() {
  const url = base.replace(/^https:/, 'wss:') + '/ws';
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { handshakeTimeout: 10000 });
    const timer = setTimeout(() => reject(new Error('WebSocket authorization timeout')), 15000);
    ws.once('close', code => {
      clearTimeout(timer);
      try { assert.equal(code, 4001); resolve(); } catch (error) { reject(error); }
    });
    ws.once('error', error => { clearTimeout(timer); reject(error); });
  });
}

(async () => {
  const health = await json('/health');
  assert.equal(health.response.status, 200);
  assert.equal(health.body.ok, true);
  assert.equal(health.body.database, 'rds-mysql');
  assert.equal(health.body.realtime, 'redis');

  const ready = await json('/ready');
  assert.equal(ready.response.status, 200);
  assert.equal(ready.body.ready, true);
  assert.equal(ready.body.media, 'oss');
  await verifyWebSocketRejectsAnonymous();
  console.log(JSON.stringify({ verified:true, endpoint:base, health:health.body, ready:ready.body }));
})().catch(error => {
  console.error(JSON.stringify({ verified:false, endpoint:base, error:error.message }));
  process.exit(1);
});

