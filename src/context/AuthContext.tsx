/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { resetPresenceState } from '@/hooks/usePresence';
import {
  signIn,
  signUp,
  resetPassword,
  signOut,
} from '@/lib/supabaseAuth';
import { isSupabaseConfigured } from '@/lib/supabase';

interface AuthContextType {
  isAuthenticated: boolean;
  loading: boolean;
  needsEmailVerification: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; needsEmailVerification?: boolean; error?: string }>;
  signup: (name: string, email: string, password: string) => Promise<{ success: boolean; needsEmailVerification?: boolean; error?: string }>;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { user, loading, setUser } = useAuthStore();
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);

  // Bootstrap auth listeners
  useEffect(() => {
    const unsub = useAuthStore.getState().init();
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  const login = async (email: string, password: string) => {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Authentication not configured (Supabase is missing).' };
    }

    const result = await signIn(email, password);
    if (result.success && result.user) {
      setUser(result.user);
      setNeedsEmailVerification(false);
      return { success: true };
    }

    return { success: false, error: result.error || 'Login failed.' };
  };

  const signup = async (name: string, email: string, password: string) => {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Authentication not configured (Supabase is missing).' };
    }

    const result = await signUp(email, password, name);

    if (result.needsEmailVerification) {
      setNeedsEmailVerification(true);
      return { success: true, needsEmailVerification: true };
    }

    if (result.success && result.user) {
      setUser(result.user);
      setNeedsEmailVerification(false);
      return { success: true };
    }

    return { success: false, error: result.error || 'Signup failed.' };
  };

  const resetPasswordFn = async (email: string) => {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Authentication not configured (Supabase is missing).' };
    }

    const result = await resetPassword(email);
    return result.success ? { success: true } : { success: false, error: result.error };
  };

  const logout = async () => {
    resetPresenceState();
    if (isSupabaseConfigured()) {
      try { await signOut(); } catch { /* ignore */ }
    }
    useAuthStore.getState().setUser(null);
  };

  return (
    <AuthContext.Provider value={{
      isAuthenticated: !!user,
      loading,
      needsEmailVerification,
      login,
      signup,
      resetPassword: resetPasswordFn,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
