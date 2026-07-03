// Supabase Data Manager Script
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envPath = path.join(__dirname, '.env');
let envVars = {};
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      envVars[key.trim()] = value.trim();
    }
  });
}

// Get Supabase credentials (from .env.example if .env doesn't exist)
const supabaseUrl = envVars.VITE_SUPABASE_URL || 'https://xqeriudcoozuvcmzniow.supabase.co';
const supabaseAnonKey = envVars.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZXJpdWRjb296dXZjbXpuaW93Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzNzk0NjgsImV4cCI6MjA5Nzk1NTQ2OH0.711eomd0Vyw1jBaZOOxvy753ZSUeLkcotKpq4AkpHBg';

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Collections from your app
const COLLECTIONS = {
  CHATS: 'chats',
  MESSAGES: 'messages',
  USERS: 'users',
  POSTS: 'posts',
  STORIES: 'stories',
  REELS: 'reels',
  LIVE_STREAMS: 'live_streams',
  FRIENDSHIPS: 'friendships',
  FRIEND_REQUESTS: 'friend_requests',
  BLOCKED_USERS: 'blocked_users',
  NOTIFICATIONS: 'notifications',
  ANALYTICS: 'analytics',
  SUBSCRIPTIONS: 'subscriptions',
  REFERRALS: 'referrals',
  TIPS: 'tips',
  CREATOR_SUBSCRIPTIONS: 'creator_subscriptions',
  ADS: 'ads',
  ACHIEVEMENTS: 'achievements',
  STREAKS: 'streaks',
  POST_VIEWS: 'post_views',
  STORY_HIGHLIGHTS: 'story_highlights',
  BOOKMARKS: 'bookmarks',
  BOOKMARK_COLLECTIONS: 'bookmark_collections',
  CALL_HISTORY: 'call_history',
  HASHTAGS: 'hashtags',
  POLLS: 'polls',
  WALLETS: 'wallets',
  PRESENCE: 'presence',
  TYPING: 'typing',
  REPORTS: 'reports',
  GROUPS: 'groups',
};

console.log('🚀 GaGa Chat Supabase Data Manager');
console.log('================================');
console.log('Connected to:', supabaseUrl);
console.log('');

// Helper functions
async function getAll(table) {
  console.log(`📊 Fetching all from "${table}"...`);
  const { data, error } = await supabase.from(table).select('*');
  if (error) {
    console.error('❌ Error:', error);
    return [];
  }
  console.log(`✅ Found ${data.length} records`);
  return data;
}

async function getById(table, id) {
  console.log(`🔍 Fetching ${table} with id="${id}"...`);
  const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
  if (error) {
    console.error('❌ Error:', error);
    return null;
  }
  return data;
}

async function create(table, data) {
  console.log(`✨ Creating new record in "${table}"...`);
  const { data: result, error } = await supabase.from(table).insert(data).select('*').maybeSingle();
  if (error) {
    console.error('❌ Error:', error);
    return null;
  }
  console.log('✅ Created successfully!');
  return result;
}

async function update(table, id, data) {
  console.log(`✏️ Updating ${table} id="${id}"...`);
  const { data: result, error } = await supabase.from(table).update(data).eq('id', id).select('*').maybeSingle();
  if (error) {
    console.error('❌ Error:', error);
    return null;
  }
  console.log('✅ Updated successfully!');
  return result;
}

async function remove(table, id) {
  console.log(`🗑️ Deleting ${table} id="${id}"...`);
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) {
    console.error('❌ Error:', error);
    return false;
  }
  console.log('✅ Deleted successfully!');
  return true;
}

async function query(table, constraints = []) {
  console.log(`🔍 Querying "${table}"...`);
  let q = supabase.from(table).select('*');
  for (const c of constraints) {
    if (c.field && c.op && c.value !== undefined) {
      switch (c.op) {
        case '==': q = q.eq(c.field, c.value); break;
        case '!=': q = q.neq(c.field, c.value); break;
        case '>': q = q.gt(c.field, c.value); break;
        case '>=': q = q.gte(c.field, c.value); break;
        case '<': q = q.lt(c.field, c.value); break;
        case '<=': q = q.lte(c.field, c.value); break;
        case 'in': q = q.in(c.field, c.value); break;
        case 'contains': q = q.contains(c.field, c.value); break;
      }
    } else if (c.field && c.direction) {
      q = q.order(c.field, { ascending: c.direction === 'asc' });
    } else if (c.count) {
      q = q.limit(c.count);
    }
  }
  const { data, error } = await q;
  if (error) {
    console.error('❌ Error:', error);
    return [];
  }
  console.log(`✅ Found ${data.length} records`);
  return data;
}

function printHelp() {
  console.log('📖 Available Commands:');
  console.log('');
  console.log('  list-tables                - List all available tables');
  console.log('  get <table>                - Get all records from table');
  console.log('  get <table> <id>           - Get single record by ID');
  console.log('  create <table> <json>      - Create new record');
  console.log('  update <table> <id> <json> - Update record');
  console.log('  delete <table> <id>        - Delete record');
  console.log('  help                       - Show this help');
  console.log('');
  console.log('📝 Example usage:');
  console.log('  node supabase-manager.js list-tables');
  console.log('  node supabase-manager.js get users');
  console.log('  node supabase-manager.js get users some-user-id');
  console.log('  node supabase-manager.js create users \'{"name":"Test User"}\'');
  console.log('');
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === 'help') {
    printHelp();
    return;
  }

  const command = args[0];
  
  switch (command) {
    case 'list-tables':
      console.log('📋 Available tables:');
      Object.entries(COLLECTIONS).forEach(([key, value]) => {
        console.log(`  - ${value}`);
      });
      break;
      
    case 'get':
      if (args.length === 2) {
        const data = await getAll(args[1]);
        console.log(JSON.stringify(data, null, 2));
      } else if (args.length === 3) {
        const data = await getById(args[1], args[2]);
        if (data) console.log(JSON.stringify(data, null, 2));
      } else {
        console.log('❌ Usage: get <table> [id]');
      }
      break;
      
    case 'create':
      if (args.length === 3) {
        try {
          const data = JSON.parse(args[2]);
          const result = await create(args[1], data);
          if (result) console.log(JSON.stringify(result, null, 2));
        } catch (e) {
          console.error('❌ Invalid JSON:', e.message);
        }
      } else {
        console.log('❌ Usage: create <table> <json>');
      }
      break;
      
    case 'update':
      if (args.length === 4) {
        try {
          const data = JSON.parse(args[3]);
          const result = await update(args[1], args[2], data);
          if (result) console.log(JSON.stringify(result, null, 2));
        } catch (e) {
          console.error('❌ Invalid JSON:', e.message);
        }
      } else {
        console.log('❌ Usage: update <table> <id> <json>');
      }
      break;
      
    case 'delete':
      if (args.length === 3) {
        await remove(args[1], args[2]);
      } else {
        console.log('❌ Usage: delete <table> <id>');
      }
      break;
      
    default:
      console.log('❌ Unknown command:', command);
      printHelp();
  }
}

main().catch(console.error);
