import { create } from 'zustand';
import { onFirebaseAuthStateChange } from '@/lib/firebaseAuth';
import { getLocalUser, setLocalUser } from '@/lib/localAuth';
import { isSupabaseConfigured, getSupabaseSafe } from '@/lib/supabase';
import type { User } from '@/types';

interface AuthStore {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  signOut: () => Promise<void>;
  init: () => (() => void) | void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  loading: true,

  setUser: (user) => {
    set({ user, loading: false });
    if (user) {
      setLocalUser(user);
      // Request notification permission after sign-in (debounced, not blocking)
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
        setTimeout(() => {
          Notification.requestPermission().catch(() => {});
        }, 3000);
      }
    }
  },

  setLoading: (loading) => set({ loading }),

  signOut: async () => {
    try {
      const supabase = getSupabaseSafe();
      if (supabase) await supabase.auth.signOut().catch((err) => { console.warn('[AuthStore] Supabase signOut failed', err); });
    } catch (err) {
      console.warn('[AuthStore] signOut failed', err);
    }
    try {
      const { firebaseSignOut } = await import('@/lib/firebaseAuth');
      await firebaseSignOut();
    } catch (err) {
      console.warn('[AuthStore] Firebase signOut failed', err);
    }
    setLocalUser(null);
    set({ user: null, loading: false });
  },

  init: () => {
    // ── Supabase path ──────────────────────────────────────────────────
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseSafe();
      if (supabase) {
        // Initial session check
        supabase.auth.getSession().then(async ({ data: { session } }) => {
          if (session?.user) {
            try {
              const { fetchUserProfile } = await import('@/lib/supabaseAuth');
              const user = await fetchUserProfile(session.user.id);
              if (user) { set({ user, loading: false }); setLocalUser(user); return; }
            } catch (err) {
              console.warn('[AuthStore] fetchUserProfile failed', err);
            }
          }
          set({ user: getLocalUser(), loading: false });
        }).catch((err) => {
          console.warn('[AuthStore] getSession failed', err);
          set({ user: getLocalUser(), loading: false });
        });

        // Real-time auth state changes
        const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
          if (session?.user) {
            try {
              const { fetchUserProfile } = await import('@/lib/supabaseAuth');
              const user = await fetchUserProfile(session.user.id);
              if (user) { set({ user, loading: false }); setLocalUser(user); }
            } catch { /* noop */ }
          } else {
            set({ user: getLocalUser(), loading: false });
          }
        });

        return () => data.subscription.unsubscribe();
      }
    }

    // ── Firebase path ──────────────────────────────────────────────────
    try {
      const unsubscribe = onFirebaseAuthStateChange((user) => {
        if (user) {
          set({ user, loading: false });
          setLocalUser(user);
          import('@/store/useSettingsStore').then(({ useUserSettings }) => {
            try { useUserSettings.getState().syncSettings(user.id); } catch { /* noop */ }
          }).catch(() => {});
        } else {
          set({ user: getLocalUser(), loading: false });
        }
      });
      return unsubscribe;
    } catch (err) {
      console.warn('[AuthStore] Firebase auth init failed', err);
      set({ user: getLocalUser(), loading: false });
      return () => {};
    }
  },
}));
