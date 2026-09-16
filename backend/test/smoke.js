// End-to-end staging smoke test. Boots an isolated server on localhost.
process.env.NODE_ENV = 'test';
process.env.DB_PATH = '/tmp/gagachat-v301-smoke.db';
process.env.UPLOAD_DIR = '/tmp/gagachat-v301-smoke-uploads';
process.env.PORT = '4545';
process.env.BASE_PATH = '/api';
process.env.PUBLIC_BASE = 'http://127.0.0.1:4545';
process.env.JWT_SECRET = 'smoke-only-jwt-secret-0123456789abcdef';
process.env.TURN_HOST = 'turn.test.invalid';
process.env.TURN_SECRET = 'smoke-only-turn-secret-0123456789abcdef';
process.env.ENABLE_SELF_REGISTRATION = 'true';
process.env.ENABLE_DEMO_WALLET = 'true';
process.env.ENABLE_LOCAL_UPLOADS = 'true';
process.env.ALLOW_WS_QUERY_TOKEN = 'false';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocket } = require('ws');

for (const file of [process.env.DB_PATH, `${process.env.DB_PATH}-shm`, `${process.env.DB_PATH}-wal`]) {
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function request(method, urlPath, body, token, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const encoded = body == null ? null : Buffer.from(JSON.stringify(body));
    const req = http.request({
      hostname: '127.0.0.1',
      port: 4545,
      path: urlPath,
      method,
      headers: {
        ...(encoded ? { 'Content-Type': 'application/json', 'Content-Length': encoded.length } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extraHeaders
      }
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (encoded) req.write(encoded);
    req.end();
  });
}

function multipartUpload(urlPath, token, filename, mime, bytes) {
  const boundary = `gaga-${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="kind"\r\n\r\nimage\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port: 4545, path: urlPath, method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      }
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        resolve({ status: res.statusCode, text, json });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function openWs(token, query = false) {
  const suffix = query ? `?token=${encodeURIComponent(token)}` : '';
  return new WebSocket(`ws://127.0.0.1:4545/api/ws${suffix}`,
    query ? {} : { headers: { Authorization: `Bearer ${token}` } });
}

function waitForOpen(ws) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('ws_open_timeout')), 3000);
    ws.once('open', () => { clearTimeout(timer); resolve(); });
    ws.once('error', error => { clearTimeout(timer); reject(error); });
  });
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const { spawn } = require('child_process');
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let serverLog = '';
  child.stdout.on('data', chunk => { serverLog += chunk; });
  child.stderr.on('data', chunk => { serverLog += chunk; });
  process.on('exit', () => { try { child.kill('SIGKILL'); } catch (_) {} });

  let ready = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await request('GET', '/api/health');
      if (response.status === 200) { ready = true; break; }
    } catch (_) {}
    await sleep(200);
  }
  check('server boots and /api prefix works', ready, serverLog.slice(0, 300));

  let response = await request('GET', '/api/health');
  check('health reports current backend version', response.json && response.json.version === require('../package.json').version, response.text);
  check('security headers present', response.headers['x-content-type-options'] === 'nosniff');

  response = await request('POST', '/api/auth/register', {
    phone: '+8801700001001', username: 'omar', display_name: 'Omar', password: 'Passw0rd!123'
  });
  check('register first test user', response.status === 201 && response.json.token, response.text);
  let omarToken = response.json.token;
  let omarRefresh = response.json.refresh_token;
  const omarId = response.json.user.id;

  response = await request('POST', '/api/auth/register', {
    phone: '+8801700001002', username: 'lina', display_name: 'Lina', password: 'Passw0rd!123'
  });
  check('register second test user', response.status === 201 && response.json.token, response.text);
  const linaToken = response.json.token;
  const linaId = response.json.user.id;

  response = await request('POST', '/api/auth/register', {
    phone: '+8801700001003', username: 'outsider', display_name: 'Outsider', password: 'Passw0rd!123'
  });
  check('register authorization test user', response.status === 201 && response.json.token, response.text);
  const outsiderToken = response.json.token;

  response = await request('POST', '/api/auth/register', {
    phone: '+8801700001004', username: 'weakpass', display_name: 'Weak', password: '1234567'
  });
  check('password shorter than 8 rejected', response.status === 400 && response.json.error === 'weak_password');

  response = await request('POST', '/api/auth/login', {
    phone: '+8801700001001', password: 'wrong-password'
  });
  check('bad credentials do not reveal account', response.status === 401 && response.json.error === 'bad_credentials');

  response = await request('POST', '/api/auth/otp/request', { phone: '+8801700001001' });
  check('OTP request fails closed', response.status === 503 && response.json.error === 'otp_provider_not_configured');
  response = await request('POST', '/api/auth/verify', { phone: '+8801700001001', code: '123456' });
  check('arbitrary numeric OTP rejected', response.status === 503 && response.json.error === 'otp_provider_not_configured');

  const originalAccess = omarToken;
  const originalRefresh = omarRefresh;
  response = await request('POST', '/api/auth/refresh', { refresh_token: originalRefresh });
  check('refresh rotates credentials', response.status === 200 && response.json.refresh_token !== originalRefresh, response.text);
  omarToken = response.json.token;
  omarRefresh = response.json.refresh_token;
  response = await request('GET', '/api/users/me', null, originalAccess);
  check('access token from rotated session revoked', response.status === 401 && response.json.error === 'session_revoked');
  response = await request('POST', '/api/auth/refresh', { refresh_token: originalRefresh });
  check('refresh reuse detected', response.status === 401 && response.json.error === 'refresh_reuse_detected');
  response = await request('GET', '/api/users/me', null, omarToken);
  check('reuse revokes replacement family', response.status === 401 && response.json.error === 'session_revoked');

  response = await request('POST', '/api/auth/login', {
    phone: '+8801700001001', password: 'Passw0rd!123'
  });
  check('new login creates independent session', response.status === 200 && response.json.token);
  omarToken = response.json.token;
  omarRefresh = response.json.refresh_token;

  response = await request('GET', '/api/users/lina', null, omarToken);
  check('public user excludes phone', response.status === 200 && !Object.hasOwn(response.json, 'phone'));

  response = await request('PUT', '/api/users/me', { bio: 'Security test' }, omarToken);
  check('PUT profile update works', response.status === 200 && response.json.bio === 'Security test', response.text);

  response = await request('POST', '/api/contacts', { username: 'lina' }, omarToken);
  check('contact request created', response.status === 201 && !!response.json.request_id, response.text);
  const friendRequestId = response.json.request_id;
  response = await request('GET', '/api/contacts', null, omarToken);
  check('contact requires recipient acceptance', response.json.data.length === 0);
  response = await request('POST', `/api/friend-requests/${friendRequestId}/accept`, null, outsiderToken);
  check('outsider cannot accept friend request', response.status === 404);
  response = await request('POST', `/api/friend-requests/${friendRequestId}/accept`, null, linaToken);
  check('recipient accepts friend request', response.status === 200);
  response = await request('GET', '/api/contacts', null, omarToken);
  check('accepted contact visible', response.json.data.some(x=>x.id === linaId));
  response = await request('POST', '/api/chats/dm', { user_id: linaId }, omarToken);
  check('DM creation works', response.status === 201 && response.json.id, response.text);
  const chatId = response.json.id;

  const register = body => request('POST', '/api/auth/register', body);
  response = await register({phone:['+8801700001999'],username:'bad_array',password:'Password123!'});
  check('array phone rejected', response.status === 400 && response.json.error === 'invalid_phone');
  response = await register({phone:'+8801700001999',username:'bad!name',password:'Password123!'});
  check('invalid username is rejected instead of silently altered', response.status === 400 && response.json.error === 'invalid_username');
  response = await register({phone:'+8801700001999',username:'validname',password:{password:'Password123!'}});
  check('object password rejected', response.status === 400 && response.json.error === 'weak_password');
  const repeated = {phone:'+8801700001999',username:'duplicate_test',password:'Password123!'};
  const duplicates = await Promise.all([register(repeated),register(repeated)]);
  check('concurrent registration returns one account and one conflict', duplicates.map(x=>x.status).sort().join(',') === '201,409');
  response = await request('POST', '/api/auth/login', {username:'LINA', password:'Passw0rd!123'});
  check('username login supported with same credentials', response.status === 200 && response.json.user.id === linaId);

  // Seed private media metadata only in this isolated SQLite test database.
  const {DB} = require('../db');
  const mediaDb = new DB(process.env.DB_PATH);
  const mediaId = 'aabbccddeeff001122334455';
  const mediaUrl = `${process.env.PUBLIC_BASE}/api/media/${mediaId}`;
  mediaDb.insertMedia({id:mediaId,ownerId:linaId,objectKey:'test/private.png',mime:'image/png',size:8});
  check('pending upload cannot be read by owner', !mediaDb.canReadMedia(mediaId,linaId,mediaUrl));
  mediaDb.markMediaReady(mediaId,linaId);
  response = await request('POST', `/api/chats/${chatId}/messages`, {attachment_url:mediaUrl,attachment_type:'image'}, omarToken);
  check('forged reference cannot grant access to private media', response.status === 403 && response.json.error === 'attachment_forbidden');
  response = await request('POST', `/api/chats/${chatId}/messages`, {attachment_url:mediaUrl+'?forged=1',attachment_type:'image'}, linaToken);
  check('media URLs must match canonical ID exactly', response.status === 403);
  response = await request('PUT', '/api/users/me', {avatar_url:mediaUrl}, omarToken);
  check('cannot publish another user private media as avatar', response.status === 400);
  response = await request('POST', `/api/chats/${chatId}/messages`, {attachment_url:mediaUrl,attachment_type:'image'}, linaToken);
  check('owner can share private media with chat', response.status === 201);
  check('recipient gains access only through authorized message', mediaDb.canReadMedia(mediaId,omarId,mediaUrl));
  const outsiderId = require('../jwt').verify(outsiderToken).sub;
  check('outsider cannot read shared media', !mediaDb.canReadMedia(mediaId,outsiderId,mediaUrl));
  const {MySqlDB} = require('../mysql-db');
  const sqlContract = new MySqlDB({async execute(sql,args){return [mediaDb.db.prepare(sql).all(...args),[]];}});
  check('MySQL media predicate grants chat member', await sqlContract.canReadMedia(mediaId,omarId,mediaUrl));
  check('MySQL media predicate rejects outsider', !await sqlContract.canReadMedia(mediaId,outsiderId,mediaUrl));
  // Keep existing one-message idempotency assertions independent of media setup.
  await request('DELETE', `/api/chats/${chatId}/messages/${response.json.message.id}`, null, linaToken);
  mediaDb.db.close();

  const clientMessageId = 'mobile-message-00000001';
  response = await request('POST', `/api/chats/${chatId}/messages`, {
    text: 'Idempotent hello', client_message_id: clientMessageId
  }, omarToken);
  check('message created with client id', response.status === 201 && response.json.message.id, response.text);
  const firstMessageId = response.json.message.id;
  response = await request('POST', `/api/chats/${chatId}/messages`, {
    text: 'Idempotent hello', client_message_id: clientMessageId
  }, omarToken);
  check('duplicate message request is idempotent', response.status === 200 && response.json.idempotent && response.json.message.id === firstMessageId, response.text);
  response = await request('GET', `/api/chats/${chatId}/messages`, null, omarToken);
  check('idempotent retry stored once', response.status === 200 && response.json.data.length === 1);
  response = await request('POST', `/api/chats/${chatId}/read`, null, outsiderToken);
  check('non-member cannot mark chat read', response.status === 403 && response.json.error === 'not_member');

  const events = [];
  const linaWs = openWs(linaToken);
  const omarWs = openWs(omarToken);
  await Promise.all([waitForOpen(linaWs), waitForOpen(omarWs)]);
  linaWs.on('message', data => events.push(JSON.parse(data.toString())));
  omarWs.on('message', data => events.push(JSON.parse(data.toString())));
  response = await request('POST', `/api/chats/${chatId}/messages`, {
    text: 'WebSocket hello', client_message_id: 'mobile-message-00000002'
  }, omarToken);
  await sleep(250);
  check('message relayed by WebSocket', response.status === 201 && events.some(event => event.type === 'message' && event.data.text === 'WebSocket hello'));
  omarWs.send(JSON.stringify({ type: 'typing', data: { chat_id: chatId, to: linaId } }));
  await sleep(200);
  check('authorized typing relayed', events.some(event => event.type === 'typing' && event.data.chat_id === chatId));

  response = await request('POST', '/api/calls', { callee_id: linaId, video: true }, omarToken);
  check('call creation authorized', response.status === 201 && response.json.call_id, response.text);
  const callId = response.json.call_id;
  await sleep(200);
  check('callee receives ring event', events.some(event => event.type === 'call' && event.data.call_id === callId));
  omarWs.send(JSON.stringify({
    type: 'call_signal', data: { call_id: callId, kind: 'offer', to: linaId, sdp: 'v=0 test' }
  }));
  await sleep(200);
  check('participant call signal relayed', events.some(event => event.type === 'call_signal' && event.data.sdp === 'v=0 test'));
  response = await request('POST', `/api/calls/${callId}/end`, null, outsiderToken);
  check('non-participant cannot end call', response.status === 403 && response.json.error === 'not_participant');
  response = await request('POST', `/api/calls/${callId}/end`, null, omarToken);
  check('participant can end call', response.status === 200 && response.json.ok);

  response = await request('GET', '/api/calls/turn', null, omarToken);
  check('ephemeral TURN credentials returned', response.status === 200 && response.json.servers.length === 3 && response.json.servers[0].credential);

  response = await request('GET', '/api/wallet', null, omarToken);
  check('no welcome money is minted', response.status === 200 && response.json.balance === 0, response.text);
  response = await request('POST', '/api/wallet/topup', { amount: 25 }, omarToken);
  check('explicit non-production demo top-up works', response.status === 200 && response.json.balance === 25);
  response = await request('POST', '/api/wallet/send', { to: 'lina', amount: 10 }, omarToken);
  check('atomic demo transfer works', response.status === 200 && response.json.balance === 15);
  response = await request('GET', '/api/wallet', null, linaToken);
  check('receiver demo balance updated', response.status === 200 && response.json.balance === 10);

  response = await multipartUpload('/api/upload', omarToken, 'test.png', 'image/png',
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  check('allowed staging upload accepted', response.status === 200 && response.json.url, response.text);
  if (response.json && response.json.url) {
    const downloadPath = new URL(response.json.url).pathname;
    const download = await request('GET', downloadPath);
    check('staging upload served through /api prefix', download.status === 200);
  }
  response = await multipartUpload('/api/upload', omarToken, 'payload.exe', 'application/x-msdownload', Buffer.from('MZ'));
  check('unsafe upload type rejected', response.status === 400 && response.json.error === 'unsupported_file_type', response.text);

  let querySocketClosed = false;
  const querySocket = openWs(omarToken, true);
  await new Promise(resolve => {
    querySocket.on('close', () => { querySocketClosed = true; resolve(); });
    querySocket.on('error', () => {});
    setTimeout(resolve, 2500);
  });
  check('WebSocket URL token fallback disabled', querySocketClosed);

  let logoutCloseCode = null;
  omarWs.once('close', code => { logoutCloseCode = code; });
  response = await request('POST', '/api/auth/logout', { refresh_token: omarRefresh }, omarToken);
  check('logout succeeds', response.status === 200 && response.json.ok);
  response = await request('GET', '/api/users/me', null, omarToken);
  check('logout revokes server-side session', response.status === 401 && response.json.error === 'session_revoked');
  await sleep(50);
  check('logout closes the active socket with auth-expired code', logoutCloseCode === 4001);

  linaWs.close();
  omarWs.close();
  child.kill();
  await sleep(150);
  console.log(`\n===== SMOKE RESULT: ${passed} passed, ${failed} failed =====`);
  if (failed && serverLog) console.log(serverLog.slice(0, 1200));
  process.exit(failed ? 1 : 0);
})().catch(error => {
  console.error('SMOKE CRASH:', error);
  process.exit(1);
});
