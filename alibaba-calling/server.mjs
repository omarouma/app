import http from 'node:http';
import { createHmac } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { pathToFileURL } from 'node:url';

export function turnCredentials(userId, secret, now = Math.floor(Date.now() / 1000)) {
  const username = `${now + 3600}:${userId}`;
  return { username, credential: createHmac('sha1', secret).update(username).digest('base64') };
}
export function validSignal(message, caller) {
  if (!message || !['offer', 'answer', 'ice'].includes(message.type)) return false;
  if (message.type === 'offer' && !caller || message.type === 'answer' && caller) return false;
  if (message.type === 'ice') return message.data && typeof message.data.candidate === 'string' && message.data.candidate.length <= 4096;
  return message.data?.type === message.type && typeof message.data.sdp === 'string' && message.data.sdp.length < 65536;
}
export function createCallingServer(config, verifyAccess) {
  const origins = new Set(config.origins);
  const peers = new Map();
  const authorize = async (token, callId) => {
    if (!token || typeof token !== 'string' || token.length > 8192 || !/^[a-zA-Z0-9_-]{1,128}$/.test(callId || '')) throw new Error('Unauthorized');
    return verifyAccess(token, callId);
  };
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && !origins.has(origin)) { res.writeHead(403); res.end(); return; }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin'); res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/healthz') { res.end('ok'); return; }
    if (req.method !== 'GET' || url.pathname !== '/ice') { res.writeHead(404); res.end(); return; }
    try {
      const access = await authorize(req.headers.authorization?.replace(/^Bearer /, ''), url.searchParams.get('call'));
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ iceServers: [{ urls: config.turnUrls, ...turnCredentials(access.userId, config.turnSecret) }] }));
    } catch { res.writeHead(403); res.end(JSON.stringify({ error: 'CALL_ACCESS_DENIED' })); }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 70000, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url, 'http://localhost').pathname !== '/signal' || req.headers.origin && !origins.has(req.headers.origin) || wss.clients.size >= 1000) {
      socket.destroy(); return;
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  });
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.alive === false) { ws.terminate(); continue; }
      ws.alive = false; ws.ping();
    }
  }, 30000);
  heartbeat.unref();
  wss.on('close', () => clearInterval(heartbeat));
  wss.on('connection', ws => {
    ws.alive = true; ws.on('pong', () => { ws.alive = true; });
    let session, key, pending = 0, chain = Promise.resolve(), count = 0, windowAt = Date.now();
    const authTimer = setTimeout(() => ws.close(1008, 'Authentication required'), 12000);
    ws.on('message', raw => {
      if (Date.now() - windowAt > 1000) { count = 0; windowAt = Date.now(); }
      if (++count > 40 || pending >= 64) { ws.close(1008, 'Rate limit'); return; }
      pending++;
      chain = chain.then(async () => {
      try {
        if (ws.readyState !== 1) return;
        const message = JSON.parse(raw.toString());
        if (!session) {
          if (message.type !== 'auth') throw new Error('Authentication required');
          const access = await authorize(message.token, message.callId);
          if (ws.readyState !== 1) return;
          session = { ...access, token: message.token, callId: message.callId };
          key = `${session.callId}:${session.userId}`;
          peers.get(key)?.close(1000, 'Replaced by another connection'); peers.set(key, ws);
          clearTimeout(authTimer);
          ws.send(JSON.stringify({ type: 'ready', caller: session.caller }));
          for (const [peerKey, peer] of peers) if (peerKey.startsWith(`${session.callId}:`) && peer !== ws) {
            peer.send(JSON.stringify({ type: 'peer-ready' })); ws.send(JSON.stringify({ type: 'peer-ready' }));
          }
          return;
        }
        if (!validSignal(message, session.caller)) throw new Error('Invalid signaling message');
        // Recheck membership and call state before relaying, using the user's RLS context.
        const access = await authorize(session.token, session.callId);
        if (access.userId !== session.userId || ws.readyState !== 1) throw new Error('Access revoked');
        for (const [peerKey, peer] of peers) if (peerKey.startsWith(`${session.callId}:`) && peer !== ws && peer.readyState === 1) {
          peer.send(JSON.stringify({ type: message.type, data: message.data }));
        }
      } catch { ws.close(1008, 'Call access or signaling rejected'); }
      finally { pending--; }
      });
    });
    ws.on('error', () => {});
    ws.on('close', () => {
      clearTimeout(authTimer);
      if (key && peers.get(key) === ws) {
        peers.delete(key);
        for (const [peerKey, peer] of peers) if (peerKey.startsWith(`${session.callId}:`) && peer.readyState === 1) peer.send(JSON.stringify({ type: 'peer-left' }));
      }
    });
  });
  return { server, wss };
}
export async function verifySupabaseAccess(config, token, callId) {
  const headers = { Authorization: `Bearer ${token}`, apikey: config.anonKey };
  const userResponse = await fetch(`${config.supabaseUrl}/auth/v1/user`, { headers, signal: AbortSignal.timeout(5000) });
  if (!userResponse.ok) throw new Error('Unauthorized');
  const user = await userResponse.json();
  const query = new URL(`${config.supabaseUrl}/rest/v1/call_history`);
  query.searchParams.set('id', `eq.${callId}`); query.searchParams.set('select', 'caller_id,callee_id,status,type');
  const callResponse = await fetch(query, { headers, signal: AbortSignal.timeout(5000) });
  const call = callResponse.ok ? (await callResponse.json())[0] : null;
  if (!call || !['calling', 'connected'].includes(call.status) || !['voice', 'video'].includes(call.type) || ![call.caller_id, call.callee_id].includes(user.id)) throw new Error('Forbidden');
  return { userId: user.id, caller: call.caller_id === user.id };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = { origins: (process.env.ALLOWED_ORIGINS || 'https://gagachat.app').split(','), turnUrls: (process.env.TURN_URLS || '').split(',').filter(Boolean), turnSecret: process.env.TURN_SHARED_SECRET, supabaseUrl: process.env.SUPABASE_URL, anonKey: process.env.SUPABASE_ANON_KEY };
  if (!config.turnSecret || config.turnSecret.length < 32 || !config.turnUrls.length || !config.supabaseUrl || !config.anonKey) throw new Error('Configure TURN and current authentication backend before starting.');
  const { server } = createCallingServer(config, (token, call) => verifySupabaseAccess(config, token, call));
  server.listen(Number(process.env.PORT || 8080), '127.0.0.1');
}
