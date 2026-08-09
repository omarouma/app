// Adds Agora env vars to .env and .env.example (idempotent).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const APP_ID = '81a49c91e2474c22b3652f8189489d06';
const CERT = '85f5c9cfe7fd4016bbac3ec8cd4bc773';

const lines = [
  '',
  '# ─── Agora RTC (Audio/Video Calling) ───',
  `AGORA_APP_ID="${APP_ID}"`,
  `AGORA_APP_CERTIFICATE="${CERT}"`,
  `VITE_AGORA_APP_ID="${APP_ID}"`,
  `VITE_AGORA_APP_CERTIFICATE="${CERT}"`,
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
