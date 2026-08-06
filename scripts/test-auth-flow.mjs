/**
 * Deep-dive the signup 500 to determine if it's the profile trigger
 * or an auth-provider config issue.
 * Run: node scripts/test-auth-flow.mjs
 */
import { createClient, AuthRetryableFetchError } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://alzwgikndwbecuqmlrca.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFsendnaWtuZHdiZWN1cW1scmNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3Nzc0OTcsImV4cCI6MjEwMTM1MzQ5N30.4QI10WfQYvenslEFNTon3HbRbP1dZVDqas9zSz-zB7w';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function rawSignup(email, password) {
  // Direct fetch to see the raw response body from the Auth API
  const url = `${SUPABASE_URL}/auth/v1/signup`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ email, password, data: { name: 'Test User' } }),
    });
    const text = await res.text();
    console.log(`  HTTP ${res.status}`);
    console.log(`  Body: ${text}`);
  } catch (e) {
    console.log('  FETCH ERROR:', e.message);
  }
}

async function main() {
  const email = 'diag-' + Date.now() + '@gagachat.app';
  const password = 'TestPass123!';
  console.log('=== Signup 500 Diagnosis ===');
  console.log('Email:', email);

  console.log('\n[1] Raw signup request (client JS sdk style):');
  await rawSignup(email, password);

  console.log('\n[2] SDK signup (captures error surface):');
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    console.log('  name:', error.name);
    console.log('  status:', error.status);
    console.log('  message:', JSON.stringify(error.message));
    console.log('  code:', error.code);
    if (error instanceof AuthRetryableFetchError) {
      console.log('  -> Retryable fetch error (server returned 5xx)');
    }
  } else {
    console.log('  OK:', data.user?.id, 'session:', !!data.session);
  }

  console.log('\n[3] Health/admin check — is signup provider even enabled?');
  // Try passwordless/magic-link to see if auth is generally functional
  const { error: otpError } = await supabase.auth.signInWithOtp({ email });
  console.log('  OTP error:', otpError ? JSON.stringify(otpError) : 'none (magic link sent)');
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
