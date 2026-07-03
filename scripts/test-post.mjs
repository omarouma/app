import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xqeriudcoozuvcmzniow.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZXJpdWRjb296dXZjbXpuaW93Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzNzk0NjgsImV4cCI6MjA5Nzk1NTQ2OH0.711eomd0Vyw1jBaZOOxvy753ZSUeLkcotKpq4AkpHBg';

async function testPost() {
  console.log('🧪 Testing post creation...\n');

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // First check if we have a user
  const { data: users } = await client.from('users').select('id, name').limit(1);
  if (!users || users.length === 0) {
    console.log('⚠️ No users found. Creating a test user...');
    const { data: newUser, error: userError } = await client.from('users').insert({
      name: 'Test User',
      bio: 'Test account',
    }).select('id').maybeSingle();
    
    if (userError) {
      console.log('❌ Failed to create user:', userError.message);
      return;
    }
    console.log('✅ Test user created:', newUser?.id);
  }

  const testUserId = users?.[0]?.id || 'test-user-123';
  console.log('Using user ID:', testUserId);

  // Try to create a post
  console.log('\n📝 Creating test post...');
  const testPost = {
    user_id: testUserId,
    content: 'Test post from the debug script! 🎉',
    created_at: new Date().toISOString(),
  };

  try {
    const { data: postResult, error: postError } = await client.from('posts').insert(testPost).select('*').maybeSingle();
    
    if (postError) {
      console.log('❌ FAILED TO CREATE POST:');
      console.log('   Message:', postError.message);
      console.log('   Code:', postError.code);
      console.log('   Details:', postError.details);
      console.log('   Hint:', postError.hint);
    } else {
      console.log('✅ POST CREATED SUCCESSFULLY!');
      console.log('   Post ID:', postResult?.id);
      console.log('   Content:', postResult?.content);
    }
  } catch (err) {
    console.log('❌ Exception:', err.message);
  }
}

testPost().catch(err => console.error('Fatal error:', err));
