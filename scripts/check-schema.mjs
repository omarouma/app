import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xqeriudcoozuvcmzniow.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZXJpdWRjb296dXZjbXpuaW93Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzNzk0NjgsImV4cCI6MjA5Nzk1NTQ2OH0.711eomd0Vyw1jBaZOOxvy753ZSUeLkcotKpq4AkpHBg';

async function checkSchema() {
  console.log('🔍 Checking database schema...\n');

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Try to get a post to see what columns exist
  try {
    console.log('📋 Checking posts table structure...');
    // First, just try to select * to see the columns
    const { data: testSelect, error: selectError } = await client.from('posts').select('*').limit(0);
    
    if (selectError) {
      console.log('❌ Error querying posts table:', selectError.message);
      // If we can't select, let's try inserting with minimal data
      console.log('\n⚠️ Trying with minimal data...');
      
      const minimalPost = {
        user_id: 'test-user-123',
        content: 'Test minimal post',
        created_at: new Date().toISOString(),
      };
      
      const { error: insertError } = await client.from('posts').insert(minimalPost);
      
      if (insertError) {
        console.log('❌ Minimal insert failed:', insertError.message);
      } else {
        console.log('✅ Minimal insert succeeded!');
        console.log('   Working columns: user_id, content, created_at');
      }
    } else {
      // If we can select, show the columns from the response structure
      console.log('✅ Can query posts table!');
    }
  } catch (err) {
    console.log('❌ Error:', err.message);
  }
}

checkSchema().catch(err => console.error('Fatal error:', err));
