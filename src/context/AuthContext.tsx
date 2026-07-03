import { createContext, useContext, useEffect, useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useTrackPresence } from '@/hooks/usePresence';
import {
  localSignUp,
  localLogin,
  localLogout,
  localResetPassword,
  sendPhoneOtp as localSendPhoneOtp,
  verifyPhoneOtp as localVerifyPhoneOtp,
  localPhoneSignUp,
} from '@/lib/localAuth';
import {
  firebaseSignUp,
  firebaseSignIn,
  firebaseSignOut,
  firebaseResetPassword,
  firebaseSendEmailVerification,
} from '@/lib/firebaseAuth';
import {
  firebaseSignIn as supabaseSignIn,
  firebaseSignUp as supabaseSignUp,
  signInWithPhone as supabaseSignInPhone,
  verifyPhoneOtp as supabaseVerifyPhoneOtp,
  signInWithOAuth as supabaseSignInOAuth,
  signInWithEmailOtp as supabaseSignInEmailOtp,
  verifyEmailOtp as supabaseVerifyEmailOtp,
  firebaseResetPassword as supabaseResetPassword,
  firebaseSendEmailVerification as supabaseSendEmailVerification,
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
  resendVerificationEmail: (email: string) => Promise<{ success: boolean; error?: string }>;
  // Phone auth
  sendPhoneOtp: (phone: string) => Promise<{ success: boolean; error?: string }>;
  verifyPhoneOtp: (phone: string, token: string, name?: string) => Promise<{ success: boolean; error?: string }>;
  // Email OTP
  sendEmailOtp: (email: string) => Promise<{ success: boolean; error?: string }>;
  verifyEmailOtp: (email: string, token: string) => Promise<{ success: boolean; error?: string }>;
  // OAuth
  signInWithGoogle: () => Promise<void>;
  signInWithFacebook: () => Promise<void>;
  signInWithApple: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut, setUser } = useAuthStore();
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  const useSupabase = isSupabaseConfigured();

  // Bootstrap auth listeners once — single source of truth
  useEffect(() => {
    const unsub = useAuthStore.getState().init();
    return () => { if (typeof unsub === 'function') unsub(); };
  }, []);

  // Track this user as online via Firebase/Firestore
  useTrackPresence(user?.id);

  const login = async (email: string, password: string) => {
    // Try Supabase Auth first (if configured)
    if (useSupabase) {
      try {
        const result = await supabaseSignIn(email, password);
        if (result.success && result.user) {
          setUser(result.user);
          setNeedsEmailVerification(false);
          return { success: true };
        }
        if (result.error) return { success: false, error: result.error };
      } catch (e: unknown) {
        console.warn('[Auth] Supabase login failed, trying Firebase:', (e as Error).message);
      }
    }

    // Try Firebase Auth
    const fbResult = await firebaseSignIn(email, password);
    if (fbResult.success) {
      if (fbResult.user) setUser(fbResult.user);
      setNeedsEmailVerification(false);
      return { success: true };
    }

    // Fall back to local auth (for demo mode without Firebase)
    const localResult = await localLogin(email, password);
    if (localResult.success) {
      setUser(localResult.user!);
      setNeedsEmailVerification(false);
      return { success: true };
    }

    return { success: false, error: fbResult.error || localResult.error || 'Authentication unavailable.' };
  };

  const signup = async (name: string, email: string, password: string) => {
    // Try Supabase Auth first (if configured)
    if (useSupabase) {
      try {
        const result = await supabaseSignUp(email, password, name);
        if (result.needsEmailVerification) {
          setNeedsEmailVerification(true);
          return { success: true, needsEmailVerification: true };
        }
        if (result.success && result.user) {
          setUser(result.user);
          setNeedsEmailVerification(false);
          return { success: true };
        }
        if (result.error) return { success: false, error: result.error };
      } catch (e: unknown) {
        console.warn('[Auth] Supabase signup failed, trying Firebase:', (e as Error).message);
      }
    }

    // Try Firebase Auth
    const fbResult = await firebaseSignUp(email, password, name);
    if (fbResult.success) {
      if (fbResult.user) setUser(fbResult.user);
      setNeedsEmailVerification(false);
      return { success: true };
    }

    // Fall back to local auth
    const localResult = await localSignUp(name, email, password);
    if (localResult.success) {
      setUser(localResult.user!);
      return { success: true };
    }

    return { success: false, error: fbResult.error || localResult.error || 'Account creation unavailable.' };
  };

  const resetPasswordFn = async (email: string) => {
    // Try Supabase first
    if (useSupabase) {
      const result = await supabaseResetPassword(email);
      if (result.success) return { success: true };
    }

    const fbResult = await firebaseResetPassword(email);
    if (fbResult.success) return { success: true };
    
    // Local mode fallback
    const localResult = await localResetPassword(email);
    return localResult.success ? { success: true } : { success: false, error: fbResult.error || localResult.error };
  };

// eslint-disable-next-line @typescript-eslint/no-unused-vars
  const resendVerificationEmail = async (_email: string) => {
    // Try Supabase first
    if (useSupabase) {
      const result = await supabaseSendEmailVerification();
      if (result.success) return { success: true };
    }

    const fbResult = await firebaseSendEmailVerification();
    if (fbResult.success) return { success: true };
    return { success: false, error: fbResult.error };
  };

  const logout = async () => {
    if (!useSupabase) await firebaseSignOut();
    await localLogout();
    await signOut();
  };

  const sendPhoneOtp = async (phone: string) => {
    // Try Supabase phone OTP first
    if (useSupabase) {
      try {
        await supabaseSignInPhone(phone);
        return { success: true };
      } catch (e: unknown) {
        console.warn('[Auth] Supabase phone OTP failed, falling back to local:', (e as Error).message);
      }
    }
    return localSendPhoneOtp(phone);
  };

  const verifyPhoneOtp = async (phone: string, token: string, name?: string) => {
    // Try Supabase phone verification first
    if (useSupabase) {
      try {
        const user = await supabaseVerifyPhoneOtp(phone, token);
        if (user) {
          setUser(user);
          return { success: true };
        }
      } catch (e: unknown) {
        console.warn('[Auth] Supabase phone verify failed, falling back to local:', (e as Error).message);
      }
    }

    const verifyResult = await localVerifyPhoneOtp(phone, token);
    if (!verifyResult.success) return verifyResult;
    const nameForPhone = name || `User_${phone.slice(-4)}`;
    return localPhoneSignUp(nameForPhone, phone);
  };

  const sendEmailOtp = async (email: string) => {
    if (useSupabase) {
      try {
        await supabaseSignInEmailOtp(email);
        return { success: true };
      } catch (e: unknown) {
        return { success: false, error: (e as Error).message || 'Failed to send email OTP' };
      }
    }
    return { success: false, error: 'Email OTP requires Supabase' };
  };

  const verifyEmailOtp = async (email: string, token: string) => {
    if (useSupabase) {
      try {
        const user = await supabaseVerifyEmailOtp(email, token);
        if (user) {
          setUser(user);
          return { success: true };
        }
        return { success: false, error: 'Invalid or expired OTP' };
      } catch (e: unknown) {
        return { success: false, error: (e as Error).message || 'OTP verification failed' };
      }
    }
    return { success: false, error: 'Email OTP requires Supabase' };
  };

  const signInWithGoogle = async () => {
    if (useSupabase) {
      await supabaseSignInOAuth('google');
    } else {
      throw new Error('OAuth requires Supabase to be configured');
    }
  };

  const signInWithFacebook = async () => {
    if (useSupabase) {
      await supabaseSignInOAuth('facebook');
    } else {
      throw new Error('OAuth requires Supabase to be configured');
    }
  };

  const signInWithApple = async () => {
    if (useSupabase) {
      await supabaseSignInOAuth('apple');
    } else {
      throw new Error('OAuth requires Supabase to be configured');
    }
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
      resendVerificationEmail,
      sendPhoneOtp,
      verifyPhoneOtp,
      sendEmailOtp,
      verifyEmailOtp,
      signInWithGoogle,
      signInWithFacebook,
      signInWithApple,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
