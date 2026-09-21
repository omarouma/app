import { create } from 'zustand';
import { isSupabaseConfigured, getSupabaseSafe } from '@/lib/supabase';
import { onAuthStateChange, subscribeToUserProfile } from '@/lib/supabaseAuth';
import type { User } from '@/types';

interface AuthStore {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  signOut: () => Promise<void>;
  init: () => (() => void) | void;
}

/**
 * Hard ceiling on how long the app may stay on the loading screen while the
 * auth session is being recovered.
 *
 * Supabase's `initialize()` awaits the storage adapter during session recovery.
 * If any link in that chain stalls (native bridge not ready, dropped plugin
 * call, unreachable network) the `INITIAL_SESSION` event never fires and the
 * UI would otherwise be stuck on "Loading..." forever. This timeout guarantees
 * the app always becomes interactive: the user is shown the signed-out UI and
 * can sign in again, and a late-arriving session still updates the store.
 */
const AUTH_INIT_TIMEOUT_MS = 6000;

const applyAuthUser = (user: User | null, setState: (state: Partial<{ user: User | null; loading: boolean }>) => void) => {
  setState({ user, loading: false });
};

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  loading: true,

  setUser: (user) => {
    applyAuthUser(user, set);
  },

  setLoading: (loading) => set({ loading }),

  signOut: async () => {
    try {
      const supabase = getSupabaseSafe();
      if (supabase) await supabase.auth.signOut().catch(() => { console.warn('[AuthStore] Supabase signOut failed'); });
    } catch {
      console.warn('[AuthStore] signOut failed');
    }
    set({ user: null, loading: false });
  },

  init: () => {
    if (!isSupabaseConfigured()) {
      applyAuthUser(null, set);
      set({ loading: false });
      return () => {};
    }

    // Tracks the currently active real-time profile subscription so it can be
    // torn down when the auth user changes or logs out.
    let profileUnsub: (() => void) | null = null;
    let settled = false;

    // SAFETY NET: never allow the app to hang on the loading screen. If the
    // auth listener has not reported a result within the budget, release the
    // UI (signed-out state). A later session event still updates the store.
    const safetyTimer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      console.warn('[AuthStore] auth init timed out — releasing UI');
      set({ loading: false });
    }, AUTH_INIT_TIMEOUT_MS);

    const unsub = onAuthStateChange((user) => {
      // First callback wins for the loading gate; subsequent callbacks (token
      // refresh, profile updates, sign-out) keep the store in sync.
      settled = true;
      window.clearTimeout(safetyTimer);

      // Always drop any previous real-time profile subscription before
      // (re)opening one for a (potentially) different user.
      if (profileUnsub) {
        profileUnsub();
        profileUnsub = null;
      }

      if (user?.id) {
        // Keep the global user object in sync live (name, avatar, premium,
        // status, privacy, etc.) across every tab via Supabase Realtime.
        profileUnsub = subscribeToUserProfile(user.id, (profileUser) => {
          if (profileUser) applyAuthUser(profileUser, set);
        });
      }

      applyAuthUser(user, set);
    });

    return () => {
      window.clearTimeout(safetyTimer);
      if (profileUnsub) {
        profileUnsub();
        profileUnsub = null;
      }
      unsub();
    };
  },
}));
