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
    throw new Error('[Supabase] Not configured. Validation should have failed at startup.');
  }
  if (!_client) {
    _client = createClient(supabaseUrl, supabaseAnonKey, {
      realtime: {
        params: { eventsPerSecond: 10 },
        timeout: 20000,
      },
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storageKey: 'gaga-auth-token',
        flowType: 'pkce',
      },
      global: {
        headers: { 'x-app-version': typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.0.0' },
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