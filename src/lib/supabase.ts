import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let _client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return !!supabaseUrl && !!supabaseAnonKey;
}

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    // Return a no-op client so callers don't crash — all operations will fail gracefully
    throw new Error('[Supabase] Not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env');
  }
  if (!_client) {
    _client = createClient(supabaseUrl, supabaseAnonKey, {
      realtime: { params: { eventsPerSecond: 10 } },
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  }
  return _client;
}

/** Safe getter — returns null instead of throwing when unconfigured */
export function getSupabaseSafe(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  return getSupabase();
}

export { getSupabaseSafe as supabase };
