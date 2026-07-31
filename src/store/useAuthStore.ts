import { create } from 'zustand';
import { isSupabaseConfigured, getSupabaseSafe } from '@/lib/supabase';
import { onAuthStateChange } from '@/lib/supabaseAuth';
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

    const unsub = onAuthStateChange((user) => {
      applyAuthUser(user, set);
    });

    return unsub;
  },
}));
