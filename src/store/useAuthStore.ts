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

    const unsub = onAuthStateChange((user) => {
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
      if (profileUnsub) {
        profileUnsub();
        profileUnsub = null;
      }
      unsub();
    };
  },
}));
