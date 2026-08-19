const fs = require('fs');

const envPath = '.env';
const content = fs.readFileSync(envPath, 'utf8');

// SECURITY: Never hardcode the ZEGO server secret. Use a placeholder.
const ZEGO_APP_ID = process.env.VITE_ZEGO_APP_ID || 'YOUR_ZEGO_APP_ID';
// The server secret is intentionally not committed. Set it in the Supabase
// Edge Function secrets instead (supabase functions secrets set ZEGO_SERVER_SECRET).
const ZEGO_SERVER_SECRET = process.env.ZEGO_SERVER_SECRET || '';

const idx = content.indexOf('Agora RTC');
if (idx >= 0) {
    // Find the start of the Agora section (previous newline)
    const sectionStart = content.lastIndexOf('\n', idx - 1);
    const before = content.substring(0, sectionStart);

    const zeSection = [
        '',
        '# --- ZEGO Cloud (Audio/Video Calling) ---',
        '# App ID -- public, safe for the client (VITE_ prefixed).',
        `VITE_ZEGO_APP_ID=${ZEGO_APP_ID}`,
        '',
        '# Server Secret is intentionally not stored in .env.',
        '# Set ZEGO_SERVER_SECRET in Supabase Secret Manager for the',
        '# zego-token Edge Function (server-side token generation).',
        '# VITE_ZEGO_SERVER_SECRET=    -- DO NOT commit a server secret',
        '',
        '# Optional: serverless endpoint for ZEGO tokens (for future production hardening).',
        '# VITE_ZEGO_TOKEN_SERVER_URL=https://your-project-ref.supabase.co/functions/v1/zego-token',
        '',
    ].join('\n');

    fs.writeFileSync(envPath, before + zeSection);
    console.log('.env updated: ZEGO Cloud config replaced the Agora section');
} else {
    // No Agora section found - check if ZEGO config already exists
    if (content.includes('VITE_ZEGO_APP_ID')) {
        console.log('.env already has ZEGO config; no changes needed');
    } else {
        console.log('.env has neither Agora nor ZEGO config; appending ZEGO section');
        const zeSection = [
            '# --- ZEGO Cloud (Audio/Video Calling) ---',
            '# App ID -- public, safe for the client (VITE_ prefixed).',
            `VITE_ZEGO_APP_ID=${ZEGO_APP_ID}`,
            '# Server Secret is intentionally not stored in .env.',
            '# Set ZEGO_SERVER_SECRET in Supabase Secret Manager.',
            '',
        ].join('\n');
        fs.writeFileSync(envPath, content.trimEnd() + '\n\n' + zeSection + '\n');
        console.log('.env appended: ZEGO Cloud config added');
    }
}