// Verify public URL: HTTP health + WebSocket upgrade through the proxy
const http = require('http');
const https = require('https');
const { WebSocket } = require('ws');

const BASE = process.argv[2] || 'https://01xrr.app.super.myninja.ai';
const LIB = BASE.startsWith('https') ? https : http;

function get(p) {
  return new Promise((resolve, reject) => {
    LIB.get(BASE + p, { headers: { 'Accept': 'application/json' } }, (res) => {
      let b = '';
      res.on('data', (c) => b += c);
      res.on('end', () => resolve({ code: res.statusCode, body: b.slice(0, 200) }));
    }).on('error', reject);
  });
}

(async () => {
  try {
    const h = await get('/api/health');
    console.log('HTTP /api/health →', h.code, h.body);
  } catch (e) { console.log('HTTP FAIL:', e.message); }

  // register a user, then open a WS with the returned token
  try {
    const reg = await new Promise((resolve, reject) => {
      const data = JSON.stringify({ phone: '+8801700000022', name: 'WS Tester', username: 'wstester22' });
      const req = LIB.request(BASE + '/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
      }, (res) => { let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ code: res.statusCode, body: b })); });
      req.on('error', reject); req.write(data); req.end();
    });
    console.log('register →', reg.code, reg.body.slice(0, 120));
    const token = JSON.parse(reg.body).access_token || JSON.parse(reg.body).token;
    if (!token) { console.log('NO TOKEN — abort WS test'); return; }

    const ws = new WebSocket(BASE.replace('http://', 'ws://').replace('https://', 'wss://') + '/api/ws',
      { headers: { Authorization: 'Bearer ' + token } });
    const t = setTimeout(() => { console.log('WS TIMEOUT (proxy may not forward upgrades)'); process.exit(0); }, 8000);
    ws.on('open', () => {
      console.log('WS OPEN through public URL ✓');
      ws.send(JSON.stringify({ type: 'ping', data: { t: Date.now() } }));
    });
    ws.on('message', (m) => {
      console.log('WS MSG:', m.toString().slice(0, 100));
      clearTimeout(t);
      ws.close(); process.exit(0);
    });
    ws.on('error', (e) => { console.log('WS ERROR:', e.message); clearTimeout(t); process.exit(0); });
    ws.on('close', (c, r) => { console.log('WS CLOSE:', c, r.toString()); });
  } catch (e) { console.log('WS TEST FAIL:', e.message); }
})();
