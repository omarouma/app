// Minimal Firebase Auth adapter used by app stores/views.
// This repo's Firebase Auth integration isn't fully present in source, but the app expects these helpers.

import { getAuth, onAuthStateChanged, signOut, type User, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification } from 'firebase/auth';
import { initFirebase } from '@/lib/firebase';

export function onFirebaseAuthStateChange(callback: (user: User | null) => void) {
  initFirebase();
  const auth = getAuth();
  return onAuthStateChanged(auth, callback);
}

export async function firebaseSignIn(email: string, password: string): Promise<{ success: boolean; error?: string; user?: User }> {
  try {
    initFirebase();
    const auth = getAuth();
    const res = await signInWithEmailAndPassword(auth, email, password);
    return { success: true, user: res.user };
  } catch (e: unknown) {
    return { success: false, error: (e as Error)?.message || 'Login failed' };
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function firebaseSignUp(email: string, password: string, _name?: string): Promise<{ success: boolean; error?: string; user?: User }> {
  try {
    initFirebase();
    const auth = getAuth();
    const res = await createUserWithEmailAndPassword(auth, email, password);
    // best-effort: send email verification
    try { await sendEmailVerification(res.user); } catch { /* noop */ }
    // NOTE: name should be stored in Firestore user doc; left to app.
    return { success: true, user: res.user };
  } catch (e: unknown) {
    return { success: false, error: (e as Error)?.message || 'Signup failed' };
  }
}

export async function firebaseSignOut() {
  const auth = getAuth();
  await signOut(auth);
}

export async function firebaseResetPassword(email: string): Promise<{ success: boolean; error?: string }> {
  try {
    initFirebase();
    const auth = getAuth();
    await sendPasswordResetEmail(auth, email);
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: (e as Error)?.message || 'Reset failed' };
  }
}

export async function firebaseSendEmailVerification(): Promise<{ success: boolean; error?: string }> {
  try {
    initFirebase();
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return { success: false, error: 'Not signed in' };
    await sendEmailVerification(user);
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: (e as Error)?.message || 'Failed to send verification' };
  }
}

export async function deleteFirebaseAccount() {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) throw new Error('No authenticated user');
  await user.delete();
}

