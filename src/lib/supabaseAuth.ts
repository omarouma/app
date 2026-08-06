import { getSupabaseSafe } from './supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { User } from '@/types';

export async function getCurrentUser(): Promise<User | null> {
  const supabase = getSupabaseSafe();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  if (data.user) return fetchUserProfile(data.user.id);
  return null;
}

export async function fetchUserProfile(userId: string): Promise<User | null> {
  const supabase = getSupabaseSafe();
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
    usdBalance: data.usd_balance || data.bdt_balance || 0,
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
  const supabase = getSupabaseSafe();
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

export function onAuthStateChange(callback: (user: User | null) => void) {
  const supabase = getSupabaseSafe();
  if (!supabase) {
    callback(null);
    return () => {};
  }

  let initialHandled = false;

  const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
    // On INITIAL_SESSION the listener fires with the current session,
    // so we don't need a separate getSession() call.
    if (!initialHandled) initialHandled = true;
    if (session?.user) {
      const user = await fetchUserProfile(session.user.id);
      callback(user);
    } else {
      callback(null);
    }
  });

  return () => data.subscription.unsubscribe();
}

/**
 * Real-time subscription to a user's profile row.
 *
 * Keeps the global auth/user state in sync whenever the `users` row changes
 * (name, avatar, status, premium, coins, privacy settings, etc.) — not just on
 * login/logout. Works across tabs because it uses Supabase Realtime.
 *
 * @returns an unsubscribe function.
 */
export function subscribeToUserProfile(
  userId: string,
  onUser: (user: User | null) => void,
): () => void {
  const supabase = getSupabaseSafe();
  if (!supabase || !userId) return () => {};

  let channel: ReturnType<SupabaseClient['channel']> | null = null;
  let disposed = false;

  const emit = async () => {
    const user = await fetchUserProfile(userId);
    if (!disposed) onUser(user);
  };

  // Initial fetch so we have a value immediately even before realtime connects.
  void emit();

  channel = supabase
    .channel(`users:profile:${userId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${userId}` },
      () => {
        void emit();
      },
    )
    .subscribe();

  return () => {
    disposed = true;
    if (channel) {
      try { supabase.removeChannel(channel); } catch { /* ignore */ }
      channel = null;
    }
  };
}

export async function signIn(
  email: string,
  password: string,
): Promise<{ success: boolean; error?: string; user?: User }> {
  const supabase = getSupabaseSafe();
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { success: false, error: error.message };
  if (data.user) {
    let user = await fetchUserProfile(data.user.id);
    if (!user) {
      const displayName = data.user.user_metadata?.name || email.split('@')[0];
      try {
        await supabase.from('users').upsert({
          id: data.user.id, email, name: displayName, display_name: displayName,
          created_at: new Date().toISOString(),
        }, { onConflict: 'id' });
      } catch { /* ignore */ }
      user = await fetchUserProfile(data.user.id);
    }
    if (user) return { success: true, user };
    return { success: true, user: { id: data.user.id, email, name: email.split('@')[0] } as User };
  }
  return { success: false, error: 'Login failed' };
}

export async function signInWithPhone(
  phone: string,
  password: string,
): Promise<{ success: boolean; error?: string; user?: User }> {
  const supabase = getSupabaseSafe();
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  // Phone users sign in via email derived from phone stored in their profile
  const { data: rows } = await supabase
    .from('users')
    .select('email')
    .eq('phone', phone)
    .single();

  if (!rows?.email) return { success: false, error: 'No account found with this phone number' };
  return signIn(rows.email, password);
}

export async function signUp(
  email: string,
  password: string,
  name?: string,
): Promise<{ success: boolean; error?: string; user?: User; needsEmailVerification?: boolean }> {
  const supabase = getSupabaseSafe();
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  const displayName = name || email.split('@')[0];
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name: displayName } },
  });

  if (error) return { success: false, error: error.message };

  if (data.user) {
    try {
      await supabase.from('users').upsert({
        id: data.user.id, email, name: displayName, display_name: displayName,
        created_at: new Date().toISOString(),
      }, { onConflict: 'id' });
    } catch { /* trigger handles it */ }

    if (!data.session) {
      return { success: true, needsEmailVerification: true, user: { id: data.user.id, email, name: displayName } as User };
    }

    const user = await fetchUserProfile(data.user.id);
    if (user) return { success: true, user };
    return { success: true, needsEmailVerification: true, user: { id: data.user.id, email, name: displayName } as User };
  }

  return { success: false, error: 'Signup failed' };
}

export async function signUpWithPhone(
  phone: string,
  password: string,
  name?: string,
): Promise<{ success: boolean; error?: string; user?: User; needsEmailVerification?: boolean }> {
  const supabase = getSupabaseSafe();
  if (!supabase) return { success: false, error: 'Supabase not configured' };

// Use phone as email prefix so Supabase auth (email-based) still works
  const syntheticEmail = `${phone.replace(/\D/g, '')}@phone.gagachat.app`;
  const displayName = name || `User${phone.slice(-4)}`;

  const result = await signUp(syntheticEmail, password, displayName);
  if (!result.success) return result;

  // Store real phone number on the user row
  if (result.user?.id) {
    try {
      await supabase.from('users').update({ phone }).eq('id', result.user.id);
    } catch { /* ignore */ }
  }

  return {
    ...result,
    // Phone accounts are immediately usable regardless of email verification
    // on the synthetic email, so we don't force a verification step.
    needsEmailVerification: false,
  };
}

export async function sendMagicLink(
  email: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseSafe();
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function signOut() {
  const supabase = getSupabaseSafe();
  if (supabase) await supabase.auth.signOut();
}

export async function resetPassword(
  email: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseSafe();
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth`,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function sendEmailVerification(): Promise<{
  success: boolean;
  error?: string;
}> {
  const supabase = getSupabaseSafe();
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

export async function deleteAccount() {
  const supabase = getSupabaseSafe();
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.rpc('delete_user');
  if (error) throw error;
}

export async function searchUsers(query: string, currentUserId: string): Promise<User[]> {
  const supabase = getSupabaseSafe();
  if (!supabase) return [];

  // Strip characters that have no place in a name/username search
  const safeQuery = query.trim().replace(/[%_\\]/g, '').slice(0, 50);
  if (!safeQuery) return [];

  const SAFE_COLS = 'id,name,display_name,username,avatar,bio,is_verified,status,status_message';
  const results: User[] = [];
  const existingIds = new Set<string>();

  const mapRow = (u: Record<string, unknown>): User => ({
    id: u.id as string,
    name: (u.name as string) || (u.display_name as string) || 'User',
    displayName: (u.display_name as string) || (u.name as string) || 'User',
    username: (u.username as string) || '',
    avatar: (u.avatar as string) || '',
    bio: (u.bio as string) || '',
    verified: (u.is_verified as boolean) || false,
    status: (u.status as string) || 'offline',
    statusMessage: (u.status_message as string) || '',
  } as User);

  const [usernameResult, nameResult] = await Promise.all([
    Promise.resolve(
      supabase.from('users').select(SAFE_COLS).ilike('username', `%${safeQuery}%`).neq('id', currentUserId).limit(20)
    ).then(({ data }) => (data ?? []) as Record<string, unknown>[]).catch((): Record<string, unknown>[] => []),
    Promise.resolve(
      supabase.from('users').select(SAFE_COLS).ilike('name', `%${safeQuery}%`).neq('id', currentUserId).limit(20)
    ).then(({ data }) => (data ?? []) as Record<string, unknown>[]).catch((): Record<string, unknown>[] => []),
  ]);

  usernameResult.forEach((u) => {
    existingIds.add(u.id as string);
    results.push(mapRow(u));
  });
  nameResult
    .filter((u) => !existingIds.has(u.id as string))
    .forEach((u) => results.push(mapRow(u)));

  return results;
}
