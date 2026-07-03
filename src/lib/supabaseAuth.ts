import { getSupabaseSafe } from './supabase';
import type { User } from '@/types';

function getDb() {
  return getSupabaseSafe();
}

export function onFirebaseAuthStateChange(callback: (user: User | null) => void) {
  const supabase = getDb();
  if (!supabase) {
    import('./localAuth').then(({ getLocalUser }) => {
      callback(getLocalUser());
    }).catch(() => {
      callback(null);
    });
    return () => {};
  }

  // Immediate session check
  supabase.auth.getSession().then(async ({ data: { session } }) => {
    if (session?.user) {
      const user = await fetchUserProfile(session.user.id);
      callback(user);
    } else {
      callback(null);
    }
  }).catch(() => callback(null));

  const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) {
      const user = await fetchUserProfile(session.user.id);
      callback(user);
    } else {
      callback(null);
    }
  });

  return () => data.subscription.unsubscribe();
}

export async function firebaseSignIn(
  email: string,
  password: string,
): Promise<{ success: boolean; error?: string; user?: User }> {
  const supabase = getDb();
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { success: false, error: error.message };
  if (data.user) {
    const user = await fetchUserProfile(data.user.id);
    if (user) return { success: true, user };
  }
  return { success: false, error: 'Login failed' };
}

export async function firebaseSignUp(
  email: string,
  password: string,
  name?: string,
): Promise<{ success: boolean; error?: string; user?: User; needsEmailVerification?: boolean }> {
  const supabase = getDb();
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  const displayName = name || email.split('@')[0];
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name: displayName } },
  });

  if (error) return { success: false, error: error.message };

  if (data.user) {
    // Try manual insert as fallback in case DB trigger doesn't fire yet
    try {
      await supabase.from('users').upsert({
        id: data.user.id,
        email,
        name: displayName,
        display_name: displayName,
        created_at: new Date().toISOString(),
      }, { onConflict: 'id' });
    } catch { /* trigger handles it */ }

    if (!data.session) {
      return {
        success: true,
        needsEmailVerification: true,
        user: { id: data.user.id, email, name: displayName } as User,
      };
    }

    const user = await fetchUserProfile(data.user.id);
    if (user) return { success: true, user };
    return {
      success: true,
      needsEmailVerification: true,
      user: { id: data.user.id, email, name: displayName } as User,
    };
  }

  return { success: false, error: 'Signup failed' };
}

export async function firebaseSignOut() {
  const supabase = getDb();
  if (supabase) await supabase.auth.signOut();
}

export async function firebaseResetPassword(
  email: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = getDb();
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth`,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function firebaseSendEmailVerification(): Promise<{
  success: boolean;
  error?: string;
}> {
  const supabase = getDb();
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user?.email) return { success: false, error: 'Not signed in' };

  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: userData.user.email,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function deleteFirebaseAccount() {
  const supabase = getDb();
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.rpc('delete_user');
  if (error) throw error;
}

export async function signInWithEmailOtp(email: string): Promise<void> {
  const supabase = getDb();
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

export async function verifyEmailOtp(email: string, token: string): Promise<User | null> {
  const supabase = getDb();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error || !data.user) return null;
  return fetchUserProfile(data.user.id);
}

export async function signInWithPhone(phone: string): Promise<void> {
  const supabase = getDb();
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) throw error;
}

export async function verifyPhoneOtp(phone: string, token: string): Promise<User | null> {
  const supabase = getDb();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
  if (error || !data.user) return null;
  return fetchUserProfile(data.user.id);
}

export async function signInWithOAuth(
  provider: 'google' | 'facebook' | 'apple',
): Promise<void> {
  const supabase = getDb();
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function getCurrentUser(): Promise<User | null> {
  const supabase = getDb();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  if (data.user) return fetchUserProfile(data.user.id);
  return null;
}

export async function fetchUserProfile(userId: string): Promise<User | null> {
  const supabase = getDb();
  if (!supabase || !userId) return null;

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    email: data.email,
    name: data.name || data.display_name || 'User',
    displayName: data.display_name || data.name,
    username: data.username,
    avatar: data.avatar,
    coverImage: data.cover_image,
    bio: data.bio,
    status: data.status,
    statusMessage: data.status_message,
    phone: data.phone,
    location: data.location,
    website: data.website,
    verified: data.is_verified,
    isAdmin: data.is_admin,
    isPremium: data.is_premium,
    coins: data.coins || 0,
    bdtBalance: data.bdt_balance || 0,
    friends: data.friends || [],
    followers: data.followers || [],
    following: data.following || [],
    closeFriends: data.close_friends || [],
    blockedUsers: data.blocked_users || [],
    favorites: data.favorites || [],
    lastSeen: data.last_seen ? new Date(data.last_seen) : null,
    createdAt: data.created_at ? new Date(data.created_at) : undefined,
    hideOnlineStatus: data.hide_online_status,
    hideFriendList: data.hide_friend_list,
    friendRequestPrivacy: data.friend_request_privacy || 'everyone',
    groupAddPrivacy: data.group_add_privacy || 'everyone',
    referralCode: data.referral_code,
    referralCount: data.referral_count || 0,
    streakDays: data.streak_days || 0,
    achievements: data.achievements || [],
    disappearingMessagesDefault: data.disappearing_messages_default || 0,
    chatLocks: data.chat_locks || {},
    broadcastLists: data.broadcast_lists || [],
  } as User;
}

export async function updateUserProfile(userId: string, updates: Partial<User>): Promise<boolean> {
  const supabase = getDb();
  if (!supabase || !userId) return false;

  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.displayName !== undefined) payload.display_name = updates.displayName;
  if (updates.bio !== undefined) payload.bio = updates.bio;
  if (updates.avatar !== undefined) payload.avatar = updates.avatar;
  if (updates.coverImage !== undefined) payload.cover_image = updates.coverImage;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.statusMessage !== undefined) payload.status_message = updates.statusMessage;
  if (updates.phone !== undefined) payload.phone = updates.phone;
  if (updates.location !== undefined) payload.location = updates.location;
  if (updates.website !== undefined) payload.website = updates.website;
  if (updates.hideOnlineStatus !== undefined) payload.hide_online_status = updates.hideOnlineStatus;
  if (updates.hideFriendList !== undefined) payload.hide_friend_list = updates.hideFriendList;
  if (updates.friendRequestPrivacy !== undefined) payload.friend_request_privacy = updates.friendRequestPrivacy;
  if (updates.groupAddPrivacy !== undefined) payload.group_add_privacy = updates.groupAddPrivacy;

  payload.updated_at = new Date().toISOString();

  const { error } = await supabase.from('users').update(payload).eq('id', userId);
  return !error;
}
