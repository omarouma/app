/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { resetPresenceState } from '@/hooks/usePresence';
import {
  signIn, signInWithPhone,
  signUp, signUpWithPhone,
  sendMagicLink,
  resetPassword, signOut,
} from '@/lib/supabaseAuth';
import { isSupabaseConfigured } from '@/lib/supabase';

interface AuthContextType {
  isAuthenticated: boolean;
  loading: boolean;
  needsEmailVerification: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; needsEmailVerification?: boolean; error?: string }>;
  loginWithPhone: (phone: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (name: string, email: string, password: string) => Promise<{ success: boolean; needsEmailVerification?: boolean; error?: string }>;
  signupWithPhone: (name: string, phone: string, password: string) => Promise<{ success: boolean; needsEmailVerification?: boolean; error?: string }>;
  sendMagicLink: (email: string) => Promise<{ success: boolean; error?: string }>;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { user, loading, setUser } = useAuthStore();
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);

  useEffect(() => {
    const result = useAuthStore.getState().init();
    const unsub = typeof result === 'function' ? result : null;
    return () => { unsub?.(); };
  }, []);

  const notConfigured = { success: false, error: 'Authentication not configured.' };

  const login = async (email: string, password: string) => {
    if (!isSupabaseConfigured()) return notConfigured;
    const result = await signIn(email, password);
    if (result.success && result.user) { setUser(result.user); setNeedsEmailVerification(false); return { success: true }; }
    return { success: false, error: result.error || 'Login failed.' };
  };

  const loginWithPhone = async (phone: string, password: string) => {
    if (!isSupabaseConfigured()) return notConfigured;
    const result = await signInWithPhone(phone, password);
    if (result.success && result.user) { setUser(result.user); return { success: true }; }
    return { success: false, error: result.error || 'Login failed.' };
  };

  const signup = async (name: string, email: string, password: string) => {
    if (!isSupabaseConfigured()) return notConfigured;
    const result = await signUp(email, password, name);
    if (result.needsEmailVerification) { setNeedsEmailVerification(true); return { success: true, needsEmailVerification: true }; }
    if (result.success && result.user) { setUser(result.user); return { success: true }; }
    return { success: false, error: result.error || 'Signup failed.' };
  };

  const signupWithPhoneFn = async (name: string, phone: string, password: string) => {
    if (!isSupabaseConfigured()) return notConfigured;
    const result = await signUpWithPhone(phone, password, name);
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

  const sendMagicLinkFn = async (email: string) => {
    if (!isSupabaseConfigured()) return notConfigured;
    return sendMagicLink(email);
  };

  const resetPasswordFn = async (email: string) => {
    if (!isSupabaseConfigured()) return notConfigured;
    const result = await resetPassword(email);
    return result.success ? { success: true } : { success: false, error: result.error };
  };

  const logout = async () => {
    resetPresenceState();
    if (isSupabaseConfigured()) { try { await signOut(); } catch { /* ignore */ } }
    // `signOut()` above triggers `onAuthStateChange` (SIGNED_OUT) in the store's
    // `init()`, which tears down the real-time profile subscription and clears
    // the user. The explicit `setUser(null)` below is a safety net for cases
    // where the auth listener doesn't fire (e.g. offline / unconfigured).
    useAuthStore.getState().setUser(null);
  };

  return (
    <AuthContext.Provider value={{
      isAuthenticated: !!user, loading, needsEmailVerification,
      login, loginWithPhone, signup, signupWithPhone: signupWithPhoneFn,
      sendMagicLink: sendMagicLinkFn, resetPassword: resetPasswordFn, logout,
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
