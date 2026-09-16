// GaGaChat API v3.9.0 — search, call history and message management.
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { DB, scryptHash, scryptVerify, newId, now } = require('./db');
const { MySqlDB } = require('./mysql-db');
const { sign, verify, issueRefreshToken, hashRefreshToken } = require('./jwt');
const { turnCreds } = require('./turn');
const { RedisBus } = require('./redis-bus');
const { OssStore } = require('./oss-store');
const { FirebasePush } = require('./firebase-push');
const { registration, duplicateAccount } = require('./auth-input');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const enabled = name => String(process.env[name] || '').toLowerCase() === 'true';
const SELF_REGISTRATION_ENABLED = enabled('ENABLE_SELF_REGISTRATION');
const DEMO_WALLET_ENABLED = !IS_PRODUCTION && enabled('ENABLE_DEMO_WALLET');
const LOCAL_UPLOADS_ENABLED = !IS_PRODUCTION && enabled('ENABLE_LOCAL_UPLOADS');
const WS_QUERY_TOKEN_ENABLED = !IS_PRODUCTION && enabled('ALLOW_WS_QUERY_TOKEN');
const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/+$/, '');
const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'gagachat.db');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const PUBLIC_BASE = (process.env.PUBLIC_BASE || '').replace(/\/+$/, '');
if (IS_PRODUCTION && !/^https:\/\//.test(PUBLIC_BASE)) throw new Error('PUBLIC_BASE must be an HTTPS URL in production');
const REDIS_URL = process.env.REDIS_URL || '';
if (IS_PRODUCTION && !REDIS_URL) throw new Error('REDIS_URL is required in production');
const redisBus = REDIS_URL ? new RedisBus(REDIS_URL) : null;
const OSS_CONFIGURED = ['OSS_REGION','OSS_BUCKET','OSS_ACCESS_KEY_ID','OSS_ACCESS_KEY_SECRET']
  .every(key => process.env[key] && !/^set-/i.test(process.env[key]));
if (IS_PRODUCTION && !OSS_CONFIGURED) throw new Error('OSS runtime credentials are required in production');
const ossStore = OSS_CONFIGURED ? new OssStore() : null;
const firebasePush = new FirebasePush(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '');
if (IS_PRODUCTION && !firebasePush.ready) throw new Error('Firebase FCM server credential is required in production');
const allowedMime = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'video/mp4',
  'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/webm', 'application/pdf'
]);

const app = express();
app.disable('x-powered-by');
const trustProxyHops = Number.parseInt(process.env.TRUST_PROXY_HOPS || '0', 10);
if (trustProxyHops > 0) app.set('trust proxy', trustProxyHops);

// Prefix normalization must run before route matching.
if (BASE_PATH) {
  app.use((req, _res, next) => {
    if (req.url === BASE_PATH || req.url.startsWith(`${BASE_PATH}/`)) {
      req.url = req.url.slice(BASE_PATH.length) || '/';
    }
    next();
  });
}

app.use((_req, res, next) => {
  res.set({
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Cross-Origin-Resource-Policy': 'same-site',
    'Referrer-Policy': 'no-referrer',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY'
  });
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));

let db = IS_PRODUCTION ? null : new DB(DB_PATH);
if (LOCAL_UPLOADS_ENABLED) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function send(res, status, body) {
  if (body && typeof body === 'object') res.status(status).json(body);
  else res.status(status).type('text/plain').send(body || '');
}

function fail(res, status, error) {
  send(res, status, { error });
}

const rateBuckets = new Map();
function rateLimit(namespace, max, windowMs, keyFn = req => req.ip) {
  return (req, res, next) => {
    const key = `${namespace}:${keyFn(req) || 'unknown'}`;
    const current = Date.now();
    let bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetAt <= current) bucket = { count: 0, resetAt: current + windowMs };
    bucket.count += 1;
    rateBuckets.set(key, bucket);
    res.set('RateLimit-Limit', String(max));
    res.set('RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    if (bucket.count > max) {
      res.set('Retry-After', String(Math.ceil((bucket.resetAt - current) / 1000)));
      return fail(res, 429, 'rate_limited');
    }
    next();
  };
}
const authRateLimit = rateLimit('auth-ip', 30, 10 * 60 * 1000);
const otpPhoneRateLimit = rateLimit('otp-phone', 5, 15 * 60 * 1000,
  req => String((req.body || {}).phone || '').trim());

async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const payload = verify(token);
  if (!payload) return fail(res, 401, token ? 'invalid_token' : 'missing_token');
  if (!await db.isSessionActive(payload.sid, payload.sub)) return fail(res, 401, 'session_revoked');
  req.userId = payload.sub;
  req.sessionId = payload.sid;
  await db.setLastSeen(req.userId);
  next();
}

function publicUser(user, includePhone = false) {
  const result = {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    avatar_url: user.avatar_url,
    bio: user.bio,
    verified: Boolean(user.verified)
  };
  if (includePhone) result.phone = user.phone;
  return result;
}

async function issueSession(user, familyId = newId()) {
  const refresh = issueRefreshToken();
  const sessionId = newId();
  await db.createRefreshSession({
    id: sessionId,
    userId: user.id,
    familyId,
    tokenHash: refresh.hash,
    expiresAt: refresh.expiresAt
  });
  return {
    token: sign({ sub: user.id, sid: sessionId }),
    refresh_token: refresh.token,
    user: publicUser(user, true)
  };
}

// ---------------- AUTH ----------------

app.post('/auth/register', authRateLimit, async (req, res) => {
  if (!SELF_REGISTRATION_ENABLED) return fail(res, 503, 'registration_disabled');
  const input = registration(req.body || {});
  if (input.error) return fail(res, 400, input.error);
  const { phone, display_name, username:normalizedUsername, password } = input;
  if (await db.userByPhone(phone) || await db.userByUsername(normalizedUsername)) {
    return fail(res, 409, 'already_registered');
  }
  const id = newId();
  try { await db.insertUser({
    id,
    phone,
    username: normalizedUsername,
    display_name: String(display_name || normalizedUsername).slice(0, 64),
    password: scryptHash(password),
    avatar_url: null,
    bio: null,
    verified: 0
  }); } catch (error) {
    if (duplicateAccount(error)) return fail(res, 409, 'already_registered');
    throw error;
  }
  if (!IS_PRODUCTION) await db.walletCreate(id, 0);
  send(res, 201, await issueSession(await db.userById(id)));
});

app.post('/auth/login', authRateLimit, async (req, res) => {
  const phone = String((req.body || {}).phone || '').trim();
  const username = String((req.body || {}).username || '').trim().toLowerCase();
  const password = (req.body || {}).password;
  if (typeof password !== 'string' || password.length > 128) return fail(res, 401, 'bad_credentials');
  const user = phone ? await db.userByPhone(phone) : username ? await db.userByUsername(username) : null;
  if (!user || !scryptVerify(password, user.password)) {
    return fail(res, 401, 'bad_credentials');
  }
  send(res, 200, await issueSession(user));
});

// Fail closed until an SMS provider, hashed challenges, expiry, resend cooldown,
// attempt limits, and one-time consumption are connected.
app.post('/auth/otp/request', authRateLimit, otpPhoneRateLimit, (_req, res) =>
  fail(res, 503, 'otp_provider_not_configured'));
app.post('/auth/verify', authRateLimit, otpPhoneRateLimit, (_req, res) =>
  fail(res, 503, 'otp_provider_not_configured'));

app.post('/auth/refresh', rateLimit('refresh-ip', 120, 10 * 60 * 1000), async (req, res) => {
  const rawToken = String((req.body || {}).refresh_token || '');
  const oldSession = await db.refreshSessionByHash(hashRefreshToken(rawToken));
  if (!oldSession) return fail(res, 401, 'invalid_refresh');
  if (oldSession.revoked_at) {
    await db.revokeSessionFamily(oldSession.family_id);
    return fail(res, 401, 'refresh_reuse_detected');
  }
  if (oldSession.expires_at <= now()) {
    await db.revokeSessionFamily(oldSession.family_id);
    return fail(res, 401, 'invalid_refresh');
  }
  const user = await db.userById(oldSession.user_id);
  if (!user) return fail(res, 401, 'invalid_refresh');
  const refresh = issueRefreshToken();
  const replacementId = newId();
  const replacement = {
    id: replacementId,
    userId: user.id,
    familyId: oldSession.family_id,
    tokenHash: refresh.hash,
    expiresAt: refresh.expiresAt
  };
  if (!await db.rotateRefreshSession(oldSession.id, replacement)) {
    await db.revokeSessionFamily(oldSession.family_id);
    return fail(res, 401, 'refresh_reuse_detected');
  }
  send(res, 200, {
    token: sign({ sub: user.id, sid: replacementId }),
    refresh_token: refresh.token,
    user: publicUser(user, true)
  });
});

app.post('/auth/logout', auth, async (req, res) => {
  await db.revokeFamilyBySession(req.sessionId, req.userId);
  for (const ws of sockets.get(req.userId) || []) {
    if (ws.sessionId === req.sessionId) ws.close(4001, 'session_revoked');
  }
  send(res, 200, { ok: true });
});

// ---------------- PUSH DEVICES ----------------

app.post('/devices', auth, async (req, res) => {
  const platform = String((req.body || {}).platform || '').toLowerCase();
  const pushToken = String((req.body || {}).push_token || '').trim();
  const deviceName = String((req.body || {}).device_name || '').trim().slice(0, 120);
  if (platform !== 'android') return fail(res, 400, 'invalid_platform');
  if (pushToken.length < 20 || pushToken.length > 4096) return fail(res, 400, 'invalid_push_token');
  const device = await db.upsertDevice(req.userId, { platform, pushToken, deviceName });
  send(res, 200, { ok: true, device });
});

app.delete('/devices', auth, async (req, res) => {
  const pushToken = String((req.body || {}).push_token || '').trim();
  if (!pushToken) return fail(res, 400, 'invalid_push_token');
  send(res, 200, { ok: true, removed: await db.removeDevice(req.userId, pushToken) });
});

// ---------------- USERS ----------------

app.get('/users/me', auth, async (req, res) => {
  const user = await db.userById(req.userId);
  if (!user) return fail(res, 404, 'no_user');
  send(res, 200, publicUser(user, true));
});

app.put('/users/me', auth, async (req, res) => {
  const user = await db.userById(req.userId);
  if (!user) return fail(res, 404, 'no_user');
  const { display_name, bio, avatar_url } = req.body || {};
  if (avatar_url) {
    const id = mediaIdFromUrl(avatar_url);
    const media = id ? await db.mediaById(id) : null;
    if (!media || media.owner_id !== req.userId || media.status !== 'ready' || !media.mime.startsWith('image/')) {
      return fail(res, 400, 'invalid_avatar');
    }
  }
  await db.updateUser(req.userId, {
    display_name: display_name != null ? String(display_name).slice(0, 64) : user.display_name,
    bio: bio != null ? String(bio).slice(0, 280) : user.bio,
    avatar_url: avatar_url != null ? String(avatar_url).slice(0, 512) : user.avatar_url
  });
  send(res, 200, publicUser(await db.userById(req.userId), true));
});

app.get('/users/me/export', auth, async (req, res) => {
  send(res, 200, await db.exportUserData(req.userId));
});

app.post('/users/me/delete', auth, rateLimit('account-delete', 5, 60 * 60 * 1000), async (req, res) => {
  const user = await db.userById(req.userId);
  const password = String((req.body || {}).password || '');
  if (!user || !password || !scryptVerify(password, user.password)) return fail(res, 403, 'invalid_password');
  await db.deleteUserAccount(req.userId);
  const active = sockets.get(req.userId);
  if (active) for (const ws of active) try { ws.close(4001, 'account_deleted'); } catch (_) {}
  sockets.delete(req.userId);
  send(res, 200, { ok:true, deleted:true });
});

app.get('/users/:username', auth, async (req, res) => {
  const user = await db.userByUsername(String(req.params.username || '').toLowerCase());
  if (!user) return fail(res, 404, 'no_such_user');
  send(res, 200, publicUser(user));
});

app.get('/search', auth, rateLimit('search', 120, 60 * 1000, req=>req.userId), async (req, res) => {
  const query=String(req.query.q||'').trim().slice(0,64);
  if(query.length<2) return fail(res,400,'search_too_short');
  const [users,messages]=await Promise.all([db.searchUsers(req.userId,query),db.searchMessages(req.userId,query)]);
  send(res,200,{users,messages});
});

// ---------------- CONTACTS ----------------

app.get('/contacts', auth, async (req, res) => send(res, 200, { data: await db.contactsFor(req.userId) }));

app.post('/contacts', auth, async (req, res) => {
  const username = String((req.body || {}).username || '').toLowerCase().replace('@', '').trim();
  const peer = await db.userByUsername(username);
  if (!peer) return fail(res, 404, 'no_such_user');
  if (peer.id === req.userId) return fail(res, 400, 'self_contact');
  if (await db.isBlockedEither(req.userId, peer.id)) return fail(res, 403, 'interaction_blocked');
  const result = await db.createFriendRequest(req.userId, peer.id);
  if (result.state === 'already_contact') return fail(res, 409, 'already_contact');
  if (result.state === 'created') {
    emitToUser(peer.id, { type:'friend_request', data:{ request_id:result.request.id, from:req.userId } });
  }
  send(res, result.state === 'created' ? 201 : 200, {
    ok:true, state:result.state, request_id:result.request.id
  });
});

app.get('/friend-requests', auth, async (req, res) =>
  send(res, 200, { data:await db.friendRequestsFor(req.userId) }));

app.post('/friend-requests/:id/accept', auth, async (req, res) => {
  const request = await db.acceptFriendRequest(req.params.id, req.userId);
  if (!request) return fail(res, 404, 'no_pending_request');
  emitToUser(request.from_id, { type:'friend_request', data:{ request_id:request.id, action:'accepted', by:req.userId } });
  send(res, 200, { ok:true });
});

app.post('/friend-requests/:id/reject', auth, async (req, res) => {
  if (!await db.rejectFriendRequest(req.params.id, req.userId)) return fail(res, 404, 'no_pending_request');
  send(res, 200, { ok:true });
});

app.delete('/contacts/:id', auth, async (req, res) => {
  await db.removeContact(req.userId, req.params.id);
  send(res, 200, { ok: true });
});

// ---------------- TRUST & SAFETY ----------------

app.get('/blocks', auth, async (req, res) => send(res, 200, { data:await db.blockedUsersFor(req.userId) }));

app.post('/blocks', auth, async (req, res) => {
  const username=String((req.body||{}).username||'').toLowerCase().replace('@','').trim();
  const peer=await db.userByUsername(username);
  if(!peer) return fail(res,404,'no_such_user');
  if(peer.id===req.userId) return fail(res,400,'self_block');
  await db.blockUser(req.userId,peer.id);
  send(res,201,{ok:true,user:publicUser(peer)});
});

app.delete('/blocks/:id', auth, async (req, res) => {
  send(res,200,{ok:true,removed:await db.unblockUser(req.userId,req.params.id)});
});

app.post('/reports', auth, rateLimit('reports', 10, 60 * 60 * 1000, req=>req.userId), async (req, res) => {
  const username=String((req.body||{}).username||'').toLowerCase().replace('@','').trim();
  const category=String((req.body||{}).category||'other').toLowerCase();
  const allowed=new Set(['spam','harassment','impersonation','sexual_content','violence','other']);
  const peer=await db.userByUsername(username);
  if(!peer) return fail(res,404,'no_such_user');
  if(peer.id===req.userId) return fail(res,400,'self_report');
  if(!allowed.has(category)) return fail(res,400,'invalid_report_category');
  const report=await db.createReport(req.userId,peer.id,category,String((req.body||{}).details||'').slice(0,1000));
  send(res,201,{ok:true,report_id:report.id});
});

// ---------------- CHATS & MESSAGES ----------------

app.get('/chats', auth, async (req, res) => send(res, 200, { data: await db.chatsFor(req.userId) }));

app.post('/chats/dm', auth, async (req, res) => {
  const peer = await db.userById((req.body || {}).user_id);
  if (!peer) return fail(res, 404, 'no_such_user');
  if (peer.id === req.userId) return fail(res, 400, 'self_dm');
  if (await db.isBlockedEither(req.userId, peer.id)) return fail(res, 403, 'interaction_blocked');
  send(res, 201, await db.findOrCreateDm(req.userId, peer.id));
});

app.post('/chats/group', auth, async (req, res) => {
  const title=String((req.body||{}).title||'').trim().slice(0,128);
  const usernames=Array.isArray((req.body||{}).usernames)?req.body.usernames:[];
  if(title.length<2) return fail(res,400,'invalid_group_title');
  if(usernames.length<1||usernames.length>99) return fail(res,400,'invalid_group_members');
  const contacts=new Map((await db.contactsFor(req.userId)).map(x=>[x.username,x.id]));
  const members=[];
  for(const raw of usernames) { const id=contacts.get(String(raw).toLowerCase().replace('@','').trim());
    if(!id) return fail(res,403,'group_members_must_be_contacts');
    if(await db.isBlockedEither(req.userId,id)) return fail(res,403,'interaction_blocked');
    if(!members.includes(id)) members.push(id);
  }
  send(res,201,await db.createGroup(req.userId,title,members));
});

app.get('/chats/:id/group', auth, async (req, res) => {
  const group=await db.groupDetails(req.params.id,req.userId);
  if(!group) return fail(res,404,'no_group'); send(res,200,group);
});

app.put('/chats/:id/group', auth, async (req, res) => {
  if(!await db.isGroupOwner(req.params.id,req.userId)) return fail(res,403,'owner_required');
  const title=String((req.body||{}).title||'').trim().slice(0,128);
  if(title.length<2) return fail(res,400,'invalid_group_title');
  await db.updateGroupTitle(req.params.id,title); send(res,200,{ok:true});
});

app.post('/chats/:id/members', auth, async (req, res) => {
  if(!await db.isGroupOwner(req.params.id,req.userId)) return fail(res,403,'owner_required');
  const peer=await db.userByUsername(String((req.body||{}).username||'').toLowerCase().replace('@','').trim());
  if(!peer) return fail(res,404,'no_such_user');
  const contacts=await db.contactsFor(req.userId);
  if(!contacts.some(x=>x.id===peer.id)) return fail(res,403,'group_members_must_be_contacts');
  if(await db.isBlockedEither(req.userId,peer.id)) return fail(res,403,'interaction_blocked');
  await db.addGroupMember(req.params.id,peer.id); send(res,201,{ok:true});
});

app.delete('/chats/:id/members/:userId', auth, async (req, res) => {
  if(req.params.userId!==req.userId && !await db.isGroupOwner(req.params.id,req.userId)) return fail(res,403,'owner_required');
  if(await db.isGroupOwner(req.params.id,req.params.userId)) return fail(res,409,'owner_cannot_leave');
  await db.removeGroupMember(req.params.id,req.params.userId); send(res,200,{ok:true});
});

app.get('/chats/:id/messages', auth, async (req, res) => {
  const chat = await db.chatById(req.params.id);
  if (!chat) return fail(res, 404, 'no_chat');
  if (!await db.isMember(chat.id, req.userId)) return fail(res, 403, 'not_member');
  const before = Number(req.query.before || 0) || now();
  const beforeId = req.query.before_id;
  if (beforeId !== undefined && (typeof beforeId !== 'string' || !beforeId.length || beforeId.length > 128))
    return send(res, 400, { error: 'Invalid message cursor' });
  send(res, 200, { data: await db.messages(chat.id, before, 50, beforeId || null) });
});

app.post('/chats/:id/messages', auth, async (req, res) => {
  const chat = await db.chatById(req.params.id);
  if (!chat) return fail(res, 404, 'no_chat');
  if (!await db.isMember(chat.id, req.userId)) return fail(res, 403, 'not_member');
  for (const member of await db.members(chat.id)) {
    if (member !== req.userId && await db.isBlockedEither(req.userId, member)) return fail(res, 403, 'interaction_blocked');
  }
  const { text, attachment_url, attachment_type, client_message_id } = req.body || {};
  if (!text && !attachment_url) return fail(res, 400, 'empty_message');
  if (attachment_url) {
    const id = mediaIdFromUrl(attachment_url);
    const localTestUpload = LOCAL_UPLOADS_ENABLED && typeof attachment_url === 'string' &&
      attachment_url.startsWith(`${PUBLIC_BASE}${BASE_PATH}/uploads/`);
    if (!localTestUpload && (!id || !await db.canReadMedia(id, req.userId, mediaUrl(id)))) {
      return fail(res, 403, 'attachment_forbidden');
    }
  }
  if (client_message_id && !/^[A-Za-z0-9._:-]{8,100}$/.test(String(client_message_id))) {
    return fail(res, 400, 'invalid_client_message_id');
  }
  const result = await db.insertMessage(
    chat.id,
    req.userId,
    text != null ? String(text).slice(0, 4096) : null,
    attachment_url != null ? String(attachment_url).slice(0, 512) : null,
    attachment_type != null ? String(attachment_type).slice(0, 16) : null,
    client_message_id
  );
  const message = result.message;
  if (result.inserted) {
    const me = await db.userById(req.userId);
    for (const member of await db.members(chat.id)) {
      emitToUser(member, {
        type: 'message',
        data: { ...message, sender_name: me ? me.display_name : '' }
      });
    }
  }
  send(res, result.inserted ? 201 : 200, { message, idempotent: !result.inserted });
});

app.post('/chats/:id/read', auth, async (req, res) => {
  const chat = await db.chatById(req.params.id);
  if (!chat) return fail(res, 404, 'no_chat');
  if (!await db.isMember(chat.id, req.userId)) return fail(res, 403, 'not_member');
  await db.markRead(chat.id, req.userId);
  for (const member of await db.members(chat.id)) {
    if (member !== req.userId) {
      emitToUser(member, { type: 'receipt', data: { chat_id: chat.id, status: 'read' } });
    }
  }
  send(res, 200, { ok: true });
});

app.delete('/chats/:id/messages/:messageId', auth, async (req, res) => {
  if(!await db.isMember(req.params.id,req.userId)) return fail(res,403,'not_member');
  if(!await db.deleteOwnMessage(req.params.id,req.params.messageId,req.userId)) return fail(res,404,'message_not_found');
  for(const member of await db.members(req.params.id)) emitToUser(member,{type:'message_deleted',data:{chat_id:req.params.id,message_id:req.params.messageId}});
  send(res,200,{ok:true});
});

app.delete('/chats/:id', auth, async (req, res) => {
  if (!await db.isMember(req.params.id, req.userId)) return fail(res, 403, 'not_member');
  await db.deleteChat(req.params.id, req.userId);
  send(res, 200, { ok: true });
});

// ---------------- DEMO WALLET (never available in production) ----------------

function demoWallet(req, res, next) {
  if (!DEMO_WALLET_ENABLED) return fail(res, 503, 'wallet_not_available');
  next();
}

app.get('/wallet', auth, demoWallet, async (req, res) =>
  send(res, 200, { ...await db.walletInfo(req.userId), history: await db.walletHistory(req.userId) }));

app.post('/wallet/topup', auth, demoWallet, async (req, res) => {
  const amount = Number((req.body || {}).amount);
  if (!Number.isFinite(amount) || amount <= 0) return fail(res, 400, 'bad_amount');
  const tx = await db.walletTx(req.userId, 'topup', amount);
  send(res, 200, { ok: true, balance: tx.balance, tx: tx.row });
});

app.post('/wallet/send', auth, demoWallet, async (req, res) => {
  const amount = Number((req.body || {}).amount);
  const to = String((req.body || {}).to || '').toLowerCase().replace('@', '');
  if (!Number.isFinite(amount) || amount <= 0) return fail(res, 400, 'bad_amount');
  const peer = await db.userByUsername(to) || await db.userById(to);
  if (!peer) return fail(res, 404, 'no_such_user');
  if (peer.id === req.userId) return fail(res, 400, 'self_send');
  if ((await db.walletInfo(req.userId)).balance < amount) return fail(res, 400, 'insufficient_funds');
  const tx = await db.walletTransfer(req.userId, peer.id, amount);
  emitToUser(peer.id, { type: 'wallet', data: { balance: tx.to_balance, delta: amount } });
  send(res, 200, { ok: true, balance: tx.from_balance, tx: tx.row });
});

app.post('/wallet/withdraw', auth, demoWallet, async (req, res) => {
  const amount = Number((req.body || {}).amount);
  if (!Number.isFinite(amount) || amount <= 0) return fail(res, 400, 'bad_amount');
  if ((await db.walletInfo(req.userId)).balance < amount) return fail(res, 400, 'insufficient_funds');
  const tx = await db.walletTx(req.userId, 'withdraw', -amount);
  send(res, 200, { ok: true, balance: tx.balance, tx: tx.row });
});

// ---------------- CALLS ----------------

app.get('/calls/history', auth, async (req, res) => send(res,200,{data:await db.callsFor(req.userId)}));

app.post('/calls', auth, async (req, res) => {
  const callee = await db.userById((req.body || {}).callee_id);
  if (!callee) return fail(res, 404, 'no_such_user');
  if (callee.id === req.userId) return fail(res, 400, 'self_call');
  if (await db.isBlockedEither(req.userId, callee.id)) return fail(res, 403, 'interaction_blocked');
  const me = await db.userById(req.userId);
  const call = await db.insertCall(req.userId, callee.id, Boolean((req.body || {}).video));
  emitToUser(callee.id, {
    type: 'call',
    data: {
      call_id: call.id,
      expires_at: call.created_at + 45000,
      peer_id: me.id,
      peer_name: me.display_name,
      peer_avatar: me.avatar_url || null,
      video: Boolean((req.body || {}).video),
      action: 'ring'
    }
  });
  send(res, 201, { call_id: call.id, id: call.id, status: 'ringing' });
});

app.get('/calls/turn', auth, (req, res) => {
  const servers = turnCreds(req.userId);
  if (!servers) return fail(res, 503, 'turn_not_configured');
  send(res, 200, { servers });
});

app.post('/calls/:id/end', auth, async (req, res) => {
  const call = await db.callById(req.params.id);
  if (!call) return fail(res, 404, 'no_call');
  if (call.caller_id !== req.userId && call.callee_id !== req.userId) {
    return fail(res, 403, 'not_participant');
  }
  const other = call.caller_id === req.userId ? call.callee_id : call.caller_id;
  emitToUser(other, { type: 'call', data: { call_id: call.id, action: 'cancel' } });
  await db.endCall(call.id);
  send(res, 200, { ok: true });
});

// ---------------- PRIVATE OSS MEDIA ----------------

function mediaUrl(id) { return `${PUBLIC_BASE}${BASE_PATH}/media/${id}`; }
function mediaIdFromUrl(value) {
  if (typeof value !== 'string') return null;
  const prefix = mediaUrl('');
  if (!value.startsWith(prefix)) return null;
  const id = value.slice(prefix.length);
  return /^[a-f0-9]{24}$/.test(id) ? id : null;
}

app.post('/media/upload-ticket', auth, async (req, res) => {
  if (!ossStore) return fail(res, 503, 'object_storage_not_configured');
  const mime = String((req.body || {}).mime || '').toLowerCase();
  const size = Number((req.body || {}).size);
  if (!allowedMime.has(mime)) return fail(res, 400, 'unsupported_file_type');
  if (!Number.isSafeInteger(size) || size < 1 || size > 25 * 1024 * 1024) return fail(res, 400, 'file_too_large');
  const id = newId();
  const ticket = ossStore.uploadTicket(req.userId, mime);
  await db.insertMedia({ id, ownerId:req.userId, objectKey:ticket.objectKey, mime, size });
  send(res, 201, {
    id, upload_url:ticket.uploadUrl, method:'PUT', expires_in:300,
    media_url:`${PUBLIC_BASE}${BASE_PATH}/media/${id}`
  });
});

app.post('/media/:id/complete', auth, async (req, res) => {
  if (!ossStore) return fail(res, 503, 'object_storage_not_configured');
  const media = await db.mediaById(req.params.id);
  if (!media) return fail(res, 404, 'no_media');
  if (media.owner_id !== req.userId) return fail(res, 403, 'not_owner');
  try {
    await ossStore.verifyUpload(media.object_key, media.size, media.mime);
    await db.markMediaReady(media.id, req.userId);
    send(res, 200, { ok:true, url:`${PUBLIC_BASE}${BASE_PATH}/media/${media.id}`,
      size:media.size, mime:media.mime });
  } catch (error) { fail(res, 409, error.code === 'UPLOAD_MISMATCH' ? 'upload_metadata_mismatch' : 'upload_not_found'); }
});

app.get('/media/:id', auth, rateLimit('media', 240, 60 * 1000), async (req, res) => {
  if (!ossStore) return fail(res, 503, 'object_storage_not_configured');
  const media = await db.mediaById(req.params.id);
  if (!media || media.status !== 'ready') return fail(res, 404, 'no_media');
  if (!await db.canReadMedia(req.params.id, req.userId, mediaUrl(req.params.id))) return fail(res, 403, 'media_forbidden');
  res.set('Cache-Control', 'private, no-store');
  res.redirect(302, ossStore.downloadUrl(media.object_key));
});

// ---------------- LOCAL UPLOAD ADAPTER (staging only) ----------------

if (LOCAL_UPLOADS_ENABLED) {
  const storage = multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, UPLOAD_DIR),
    filename: (_req, file, callback) => {
      const extensionByMime = {
        'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
        'video/mp4': '.mp4', 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a',
        'audio/ogg': '.ogg', 'audio/webm': '.webm', 'application/pdf': '.pdf'
      };
      callback(null, `${crypto.randomUUID()}${extensionByMime[file.mimetype] || ''}`);
    }
  });
  const upload = multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, callback) => callback(
      allowedMime.has(file.mimetype) ? null : new Error('bad_type'),
      allowedMime.has(file.mimetype)
    )
  });
  app.post('/upload', auth, upload.single('file'), (req, res) => {
    if (!req.file) return fail(res, 400, 'no_file');
    const prefix = BASE_PATH || '';
    const url = `${PUBLIC_BASE}${prefix}/files/${req.file.filename}`;
    send(res, 200, {
      url,
      kind: String(req.query.kind || req.body.kind || 'file').slice(0, 20),
      size: req.file.size,
      mime: req.file.mimetype
    });
  });
  app.use('/files', express.static(UPLOAD_DIR, {
    maxAge: '30d',
    immutable: true,
    dotfiles: 'deny',
    fallthrough: false
  }));
} else {
  app.post('/upload', auth, (_req, res) => fail(res, 503, 'object_storage_not_configured'));
}

// ---------------- HEALTH ----------------

app.get('/health', (_req, res) => send(res, 200, {
  ok: true,
  name: 'GaGaChat API',
  version: '3.9.0',
  time: now(),
  online: [...sockets.values()].reduce((total, set) => total + set.size, 0),
  realtime: redisBus ? (redisBus.ready ? 'redis' : 'starting') : 'local',
  database: IS_PRODUCTION ? 'rds-mysql' : 'sqlite'
}));

app.get('/ready', async (_req, res) => {
  let ready = Boolean(db);
  if (IS_PRODUCTION) {
    try {
      ready = !!(redisBus && redisBus.ready && ossStore && firebasePush.ready);
      if (ready) {
        const checks = await Promise.all([db.pool.query('SELECT 1'), redisBus.publisher.ping()]);
        ready = checks[1] === 'PONG';
      }
    } catch (_) { ready = false; }
  }
  send(res, ready ? 200 : 503, {
    ready,
    database: db ? (IS_PRODUCTION ? 'rds-mysql' : 'sqlite') : 'starting',
    realtime: redisBus && redisBus.ready ? 'redis' : (IS_PRODUCTION ? 'starting' : 'local'),
    media: ossStore ? 'oss-configured' : (IS_PRODUCTION ? 'starting' : 'local-disabled'),
    push: firebasePush.ready ? 'fcm-configured' : 'unconfigured'
  });
});

// ---------------- WEBSOCKET RELAY ----------------

const server = http.createServer(app);
const WS_PATHS = new Set(['/ws', BASE_PATH ? `${BASE_PATH}/ws` : ''].filter(Boolean));
const wss = new WebSocket.Server({ noServer: true, maxPayload: 64 * 1024 });
const sockets = new Map(); // userId -> Set<WebSocket>, one per active device

server.on('upgrade', async (req, socket, head) => {
  socket.on('error', () => {});
  const timeout = setTimeout(() => socket.destroy(), 5000);
  try {
    const url = new URL(req.url, 'http://localhost');
    if (!WS_PATHS.has(url.pathname)) return socket.destroy();
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) :
      (WS_QUERY_TOKEN_ENABLED ? url.searchParams.get('token') || '' : '');
    const payload = verify(token);
    if (!payload || !await db.isSessionActive(payload.sid, payload.sub)) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    if (socket.destroyed) return;
    req.wsAuth = {token,payload};
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  } catch (_) {
    socket.destroy();
  } finally { clearTimeout(timeout); }
});

async function validSocketSession(ws) {
  const payload = verify(ws.authToken || '');
  if (!payload || !await db.isSessionActive(payload.sid, payload.sub)) {
    ws.close(4001, 'session_expired');
    return false;
  }
  return true;
}

function deliverLocal(userId, event) {
  const userSockets = sockets.get(userId);
  if (!userSockets) return;
  const encoded = JSON.stringify(event);
  for (const ws of userSockets) {
    // Validate on each outgoing delivery too: logout on another ECS instance
    // must revoke access without waiting for this socket to send anything.
    ws.deliveries = (ws.deliveries || Promise.resolve()).then(async () => {
      if (ws.readyState === WebSocket.OPEN && await validSocketSession(ws)) ws.send(encoded);
    }).catch(() => ws.close(1011, 'server_error'));
  }
}

function emitToUser(userId, event) {
  deliverLocal(userId, event);
  if (redisBus) redisBus.publish(userId, event).catch(() => {});
  Promise.resolve(db.deviceTokensFor(userId))
    .then(tokens => firebasePush.notify(tokens, {...event, data:{...event.data, recipient_id:userId}}))
    .catch(() => {});
}

wss.on('connection', (ws, req) => {
  handleWsConnection(ws, req).catch(() => {
    try { ws.close(1011, 'server_error'); } catch (_) {}
  });
});

async function handleWsConnection(ws, req) {
  const {token,payload} = req.wsAuth;
  ws.authToken = token;
  ws.sessionId = payload.sid;
  const expires = setTimeout(() => ws.close(4001, 'token_expired'), Math.max(1, payload.exp * 1000 - Date.now()));
  expires.unref();
  const userId = payload.sub;
  const userSockets = sockets.get(userId) || new Set();
  userSockets.add(ws);
  sockets.set(userId, userSockets);
  const incoming = {chain:Promise.resolve()};
  if (redisBus) redisBus.setPresence(userId).catch(() => {});
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', raw => {
    incoming.chain = incoming.chain.then(async () => {
      if (await validSocketSession(ws)) await handleWsMessage(ws, userId, raw);
    }).catch(() => {
      try { ws.close(1011, 'server_error'); } catch (_) {}
    });
  });

  ws.on('close', () => {
    clearTimeout(expires);
    handleWsClose(ws, userId).catch(() => {});
  });
  await db.setLastSeen(userId);
}

async function handleWsMessage(ws, userId, raw) {
    let message;
    try { message = JSON.parse(raw.toString()); } catch (_) { return; }
    if (!message || typeof message !== 'object') return;
    const data = message.data || {};
    if (message.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', data: { t: data.t || now() } }));
      return;
    }
    if (message.type === 'typing') {
      if (!data.chat_id || !data.to) return;
      if (!await db.isMember(data.chat_id, userId) || !await db.isMember(data.chat_id, data.to)) return;
      if (await db.isBlockedEither(userId, data.to)) return;
      emitToUser(data.to, {
        type: 'typing',
        data: { chat_id: data.chat_id, from: userId }
      });
      return;
    }
    if (message.type === 'call_signal') {
      const call = data.call_id ? await db.callById(data.call_id) : null;
      if (!call || (call.caller_id !== userId && call.callee_id !== userId)) return;
      const other = call.caller_id === userId ? call.callee_id : call.caller_id;
      if (await db.isBlockedEither(userId, other)) return;
      if (data.to && data.to !== other) return;
      emitToUser(other, {
        type: 'call_signal',
        data: { ...data, to: other, from: userId }
      });
      return;
    }
    if (message.type === 'presence') {
      await db.setLastSeen(userId);
      if (redisBus) redisBus.setPresence(userId).catch(() => {});
      for (const contact of await db.contactsFor(userId)) {
        emitToUser(contact.id, {
          type: 'presence',
          data: { user_id: userId, online: true }
        });
      }
    }
}

async function handleWsClose(ws, userId) {
  const active = sockets.get(userId);
  if (!active) return;
  active.delete(ws);
  if (active.size === 0) {
    sockets.delete(userId);
    await db.setLastSeen(userId);
  }
}

const heartbeat = setInterval(() => {
  for (const [userId, userSockets] of sockets) {
    for (const ws of userSockets) {
      if (ws.isAlive === false) {
        try { ws.terminate(); } catch (_) {}
        userSockets.delete(ws);
        continue;
      }
      ws.isAlive = false;
      try { ws.ping(); } catch (_) {}
    }
    if (userSockets.size === 0) sockets.delete(userId);
    else if (redisBus) redisBus.setPresence(userId).catch(() => {});
  }
}, 30000);
heartbeat.unref();

app.use((error, _req, res, _next) => {
  if (error && (error.message === 'bad_type' || error.code === 'LIMIT_FILE_SIZE')) {
    return fail(res, 400, error.message === 'bad_type' ? 'unsupported_file_type' : 'file_too_large');
  }
  console.error('[GaGaChat] request failed');
  fail(res, 500, 'internal_error');
});

async function startServer() {
  if (IS_PRODUCTION) {
    db = await MySqlDB.connect(process.env);
    await db.migrate();
  }
  if (redisBus) await redisBus.start(deliverLocal);
  server.listen(PORT, () => {
    console.log(`[GaGaChat] API+WS v3.9.0 listening on :${PORT}`);
  });
}

startServer().catch(error => {
  console.error(`[GaGaChat] startup failed: ${error.code || error.message}`);
  process.exitCode = 1;
});

async function shutdown() {
  server.close();
  if (redisBus) await redisBus.close();
  if (db && typeof db.close === 'function') await db.close();
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);

module.exports = { app, server, getDb: () => db };
