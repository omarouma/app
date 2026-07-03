// Auth router: uses Supabase when configured, falls back to Firebase Auth.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { isSupabaseConfigured } from './supabase';

// Save the original Firebase auth module
import * as firebaseAuthLegacy from './firebaseAuthLegacy';
import * as supabaseAuth from './supabaseAuth';

const useSupabase = isSupabaseConfigured();

export function onFirebaseAuthStateChange(callback: (user: any | null) => void) {
  return useSupabase
    ? supabaseAuth.onFirebaseAuthStateChange(callback)
    : firebaseAuthLegacy.onFirebaseAuthStateChange(callback);
}

export async function firebaseSignIn(email: string, password: string): Promise<{ success: boolean; error?: string; user?: any }> {
  return useSupabase
    ? supabaseAuth.firebaseSignIn(email, password)
    : firebaseAuthLegacy.firebaseSignIn(email, password);
}

export async function firebaseSignUp(email: string, password: string, name?: string): Promise<{ success: boolean; error?: string; user?: any }> {
  return useSupabase
    ? supabaseAuth.firebaseSignUp(email, password, name)
    : firebaseAuthLegacy.firebaseSignUp(email, password, name);
}

export async function firebaseSignOut() {
  return useSupabase
    ? supabaseAuth.firebaseSignOut()
    : firebaseAuthLegacy.firebaseSignOut();
}

export async function firebaseResetPassword(email: string): Promise<{ success: boolean; error?: string }> {
  return useSupabase
    ? supabaseAuth.firebaseResetPassword(email)
    : firebaseAuthLegacy.firebaseResetPassword(email);
}

export async function firebaseSendEmailVerification(): Promise<{ success: boolean; error?: string }> {
  return useSupabase
    ? supabaseAuth.firebaseSendEmailVerification()
    : firebaseAuthLegacy.firebaseSendEmailVerification();
}

export async function deleteFirebaseAccount() {
  return useSupabase
    ? supabaseAuth.deleteFirebaseAccount()
    : firebaseAuthLegacy.deleteFirebaseAccount();
}
