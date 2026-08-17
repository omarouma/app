const fs = require('fs');

const envPath = '.env';
const content = fs.readFileSync(envPath, 'utf8');

const idx = content.indexOf('Agora RTC');
if (idx >= 0) {
    // Find the start of the Agora section (previous newline)
    const sectionStart = content.lastIndexOf('\n', idx - 1);
    const before = content.substring(0, sectionStart);

    const zeSection = [
        '',
        '# --- ZEGO Cloud (Audio/Video Calling) ---',
        '# App ID -- public, safe for the client (VITE_ prefixed).',
        'VITE_ZEGO_APP_ID=1895317974',
        '',
        '# Server Secret -- used ONLY for test/demo token generation.',
        '# For production, generate tokens server-side instead.',
        'VITE_ZEGO_SERVER_SECRET=82ce0ff8718e321aaa004817b35e2770',
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
            'VITE_ZEGO_APP_ID=1895317974',
            '# Server Secret --- used ONLY for test/demo token generation.',
            '# For production, generate tokens server-side instead.',
            'VITE_ZEGO_SERVER_SECRET=82ce0ff8718e321aaa004817b35e2770',
            '',
        ].join('\n');
        fs.writeFileSync(envPath, content.trimEnd() + '\n\n' + zeSection + '\n');
        console.log('.env appended: ZEGO Cloud config added');
    }
}