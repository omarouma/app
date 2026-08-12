// Adds Agora env vars to .env and .env.example (idempotent).
// SECURITY: No credentials are hardcoded here. Pass them via CLI args
// or manually edit the .env file afterward. Never commit real secrets.
//
// Usage:
//   node scripts/update-env-agora.cjs <APP_ID> <APP_CERTIFICATE>
//
// The App Certificate is NEVER exposed to the client (no VITE_ prefix).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const [, , APP_ID, CERT] = process.argv;

if (!APP_ID || !CERT) {
  console.error('Usage: node scripts/update-env-agora.cjs <AGORA_APP_ID> <AGORA_APP_CERTIFICATE>');
  console.error('Both arguments are required. Get them from https://console.agora.io/');
  process.exit(1);
}

const lines = [
  '',
  '# ─── Agora RTC (Audio/Video Calling) ───',
  `VITE_AGORA_APP_ID="${APP_ID}"`,
  `AGORA_APP_CERTIFICATE="${CERT}"`,
  '# VITE_AGORA_TOKEN_SERVER_URL=https://your-token-endpoint.example.com/token',
];

function addTo(file) {
  const p = path.join(root, file);
  let content = '';
  if (fs.existsSync(p)) content = fs.readFileSync(p, 'utf8');
  let changed = false;
  for (const l of lines) {
    const keyMatch = l.match(/^([A-Z_]+)=/);
    if (keyMatch) {
      const key = keyMatch[1];
      if (content.includes(key + '=')) continue;
    }
    if (l.trim() === '') continue;
    content += (content.length === 0 || content.endsWith('\n') ? '' : '\n') + l + '\n';
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(p, content, 'utf8');
  }
  return changed;
}

console.log('.env changed:', addTo('.env'));
console.log('.env.example changed:', addTo('.env.example'));
console.log('Done.');
console.log('');
console.log('Note: AGORA_APP_CERTIFICATE stays SERVER-ONLY.');
console.log('Set VITE_AGORA_TOKEN_SERVER_URL to your Firebase Function endpoint:');
console.log('  VITE_AGORA_TOKEN_SERVER_URL=https://oumagachat.web.app/api/agora-token');
