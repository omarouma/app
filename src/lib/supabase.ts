import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import env from '@/config/env';

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;

let _client: SupabaseClient | null = null;

/**
 * Checks if Supabase is configured.
 * With the new env validation, this will always be true if the app starts.
 * It's kept for parts of the app that might run before full initialization or in different contexts.
 */
export function isSupabaseConfigured(): boolean {
  return !!(supabaseUrl && supabaseAnonKey);
}

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    // This error should now theoretically never be reached if the app starts,
    // as env.ts would have already thrown an error.
    throw new Error('[Supabase] Not configured. Validation should have failed at startup.');
  }
  if (!_client) {
    _client = createClient(supabaseUrl, supabaseAnonKey, {
      realtime: { params: { eventsPerSecond: 10 } },
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storageKey: 'gaga-auth-token',
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