import { createClient } from '@supabase/supabase-js';

// Use the same credentials as our app
const SUPABASE_URL = 'https://xqeriudcoozuvcmzniow.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZXJpdWRjb296dXZjbXpuaW93Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzNzk0NjgsImV4cCI6MjA5Nzk1NTQ2OH0.711eomd0Vyw1jBaZOOxvy753ZSUeLkcotKpq4AkpHBg';

async function testSupabase() {
  console.log('🧪 Testing Supabase connection...\n');
  console.log('URL:', SUPABASE_URL);
  console.log('Key length:', SUPABASE_ANON_KEY.length);
  console.log('Key format:', SUPABASE_ANON_KEY.split('.').length === 3 ? 'Valid JWT' : 'Invalid');
  console.log('Project ref:', SUPABASE_URL.match(/https:\/\/([^.]+)/)?.[1]);
  console.log('');

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Test 1: Check connection (lightweight head request)
  try {
    console.log('📡 Testing connection...');
    const { error: healthError } = await client.from('users').select('id', { count: 'exact', head: true });
    if (healthError) {
      console.log('❌ CONNECTION TEST FAILED:', healthError.message);
      console.log('   Code:', healthError.code);
      console.log('   Details:', healthError.details);
    } else {
      console.log('✅ CONNECTION TEST PASSED - users table accessible');
    }
  } catch (err) {
    console.log('❌ CONNECTION ERROR:', err.message);
  }

  // Test 2: Check posts table
  try {
    console.log('\n📝 Testing posts table...');
    const { data: posts, error: postsError } = await client.from('posts').select('*').limit(3);
    if (postsError) {
      console.log('❌ POSTS TABLE FAILED:', postsError.message);
      console.log('   Code:', postsError.code);
    } else {
      console.log('✅ POSTS TABLE OK - Found', posts?.length || 0, 'posts');
    }
  } catch (err) {
    console.log('❌ POSTS ERROR:', err.message);
  }

  // Test 3: Check storage buckets
  try {
    console.log('\n💾 Testing storage...');
    const { data: buckets, error: bucketError } = await client.storage.listBuckets();
    if (bucketError) {
      console.log('❌ BUCKET LIST FAILED:', bucketError.message);
    } else if (!buckets || buckets.length === 0) {
      console.log('⚠️  NO BUCKETS FOUND - You need to create: avatars, posts, media, voice');
    } else {
      console.log('✅ BUCKETS FOUND:', buckets.map(b => b.name).join(', '));
    }
  } catch (err) {
    console.log('❌ BUCKET ERROR:', err.message);
  }

  // Test 4: Check auth configuration
  try {
    console.log('\n🔐 Testing auth...');
    const { data: { session }, error: authError } = await client.auth.getSession();
    if (authError) {
      console.log('❌ AUTH ERROR:', authError.message);
    } else {
      console.log('✅ AUTH CONFIG OK - Session check passed');
    }
  } catch (err) {
    console.log('❌ AUTH CONNECTION ERROR:', err.message);
  }

  console.log('\n--- Test Complete ---');
}

testSupabase().catch(err => console.error('Fatal error:', err));
