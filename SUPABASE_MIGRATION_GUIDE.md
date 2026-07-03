# Supabase Backend Setup for GaGa Chat

This guide replaces Firebase with Supabase for full real-time global functionality.

## 1. Create Supabase Project (Free)

1. Go to https://supabase.com and sign up
2. Click **New Project**
3. Name: `gagachat`
4. Region: Choose closest to your users (e.g., `ap-southeast-1` for Asia, `us-east-1` for US)
5. Plan: **Free** (good for testing, upgrade to Pro ($25/mo) for production)
6. Wait for project to provision (2-3 minutes)

## 2. Get Your Project Credentials

In the Supabase dashboard, go to **Project Settings → API**:

```
Project URL: https://your-project-ref.supabase.co
Project API Keys:
  - anon/public: eyJ...  (this goes in your .env)
  - service_role: eyJ...  (NEVER put this in frontend - backend only)
```

## 3. Install Supabase Client

```bash
npm install @supabase/supabase-js
```

## 4. Update Environment Variables

Add to your `.env`:

```env
# ============================================
# Supabase Configuration (Replaces Firebase)
# ============================================
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
```

## 5. Database Schema Setup

Run this SQL in Supabase Dashboard → SQL Editor → New Query:

```sql
-- Enable Realtime for all tables
begin;
  -- Drop existing policies if re-running
  drop policy if exists "Users can read all users" on public.users;
  drop policy if exists "Users can insert own profile" on public.users;
  drop policy if exists "Users can update own profile" on public.users;
  drop policy if exists "Users can read chats" on public.chats;
  drop policy if exists "Users can create chats" on public.chats;
  drop policy if exists "Users can read messages" on public.messages;
  drop policy if exists "Users can create messages" on public.messages;
  drop policy if exists "Users can read friend requests" on public.friend_requests;
  drop policy if exists "Users can create friend requests" on public.friend_requests;
  drop policy if exists "Users can read call history" on public.call_history;
  drop policy if exists "Users can create call history" on public.call_history;
  drop policy if exists "Users can read posts" on public.posts;
  drop policy if exists "Users can create posts" on public.posts;
  drop policy if exists "Users can read wallets" on public.wallets;
  drop policy if exists "Users can create wallets" on public.wallets;
  drop policy if exists "Users can read notifications" on public.notifications;
  drop policy if exists "Users can create notifications" on public.notifications;
  drop policy if exists "Users can read presence" on public.presence;
  drop policy if exists "Users can upsert presence" on public.presence;
  drop policy if exists "Users can read typing" on public.typing;
  drop policy if exists "Users can upsert typing" on public.typing;
  
  -- Create tables
  create table if not exists public.users (
    id uuid references auth.users on delete cascade primary key,
    email text,
    name text,
    display_name text,
    avatar text,
    bio text,
    status_message text,
    phone text,
    location text,
    website text,
    is_verified boolean default false,
    is_admin boolean default false,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );

  create table if not exists public.chats (
    id uuid default gen_random_uuid() primary key,
    participants uuid[] not null,
    name text,
    avatar text,
    type text default 'direct', -- 'direct' or 'group'
    created_by uuid references public.users(id),
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );

  create table if not exists public.messages (
    id uuid default gen_random_uuid() primary key,
    chat_id uuid references public.chats(id) on delete cascade,
    sender_id uuid references public.users(id),
    content text not null,
    type text default 'text', -- 'text', 'image', 'video', 'voice', 'file', 'poll'
    media_url text,
    reply_to uuid references public.messages(id),
    read boolean default false,
    edited boolean default false,
    reactions jsonb default '{}',
    forwarded_from uuid,
    poll_data jsonb,
    transfer_data jsonb,
    created_at timestamptz default now()
  );

  create table if not exists public.friend_requests (
    id uuid default gen_random_uuid() primary key,
    from_user_id uuid references public.users(id),
    to_user_id uuid references public.users(id),
    status text default 'pending', -- 'pending', 'accepted', 'rejected', 'cancelled'
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    unique(from_user_id, to_user_id)
  );

  create table if not exists public.friendships (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.users(id),
    friend_id uuid references public.users(id),
    created_at timestamptz default now(),
    unique(user_id, friend_id)
  );

  create table if not exists public.posts (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.users(id),
    content text,
    media_urls text[],
    visibility text default 'public', -- 'public', 'friends', 'private'
    likes_count int default 0,
    comments_count int default 0,
    shares_count int default 0,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );

  create table if not exists public.stories (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.users(id),
    media_url text not null,
    type text default 'image', -- 'image' or 'video'
    views uuid[] default '{}',
    created_at timestamptz default now(),
    expires_at timestamptz default (now() + interval '24 hours')
  );

  create table if not exists public.reels (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.users(id),
    video_url text not null,
    thumbnail_url text,
    caption text,
    music text,
    likes_count int default 0,
    comments_count int default 0,
    shares_count int default 0,
    views_count int default 0,
    created_at timestamptz default now()
  );

  create table if not exists public.call_history (
    id uuid default gen_random_uuid() primary key,
    caller uuid references public.users(id),
    callee uuid references public.users(id),
    participant_ids uuid[] default '{}',
    type text default 'voice', -- 'voice' or 'video'
    status text default 'missed', -- 'missed', 'completed', 'rejected', 'cancelled'
    duration int default 0,
    created_at timestamptz default now()
  );

  create table if not exists public.wallets (
    id uuid references public.users(id) primary key,
    coins int default 0,
    staked_coins int default 0,
    staking_start_date timestamptz,
    daily_interest_rate float default 0.0005,
    total_earned float default 0,
    total_spent float default 0,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );

  create table if not exists public.transactions (
    id uuid default gen_random_uuid() primary key,
    from_user_id uuid references public.users(id),
    to_user_id uuid references public.users(id),
    amount int not null,
    type text default 'p2p', -- 'p2p', 'deposit', 'withdraw', 'stake', 'unstake', 'interest', 'reward'
    description text,
    status text default 'completed', -- 'pending', 'completed', 'failed'
    created_at timestamptz default now()
  );

  create table if not exists public.notifications (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.users(id),
    type text not null,
    title text,
    body text,
    data jsonb default '{}',
    read boolean default false,
    created_at timestamptz default now()
  );

  create table if not exists public.typing (
    id text primary key, -- format: "chatId_userId"
    chat_id uuid references public.chats(id),
    user_id uuid references public.users(id),
    is_typing boolean default true,
    updated_at timestamptz default now()
  );

  create table if not exists public.presence (
    user_id uuid references public.users(id) primary key,
    is_online boolean default true,
    last_seen timestamptz default now(),
    updated_at timestamptz default now()
  );

  create table if not exists public.groups (
    id uuid default gen_random_uuid() primary key,
    name text not null,
    description text,
    avatar text,
    creator_id uuid references public.users(id),
    members uuid[] default '{}',
    admins uuid[] default '{}',
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );

  create table if not exists public.bookmarks (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.users(id),
    post_id uuid references public.posts(id),
    created_at timestamptz default now(),
    unique(user_id, post_id)
  );

  create table if not exists public.hashtags (
    id text primary key,
    count int default 1,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );

  create table if not exists public.blocked_users (
    id uuid default gen_random_uuid() primary key,
    blocker_id uuid references public.users(id),
    blocked_id uuid references public.users(id),
    created_at timestamptz default now(),
    unique(blocker_id, blocked_id)
  );

  -- Row Level Security Policies
  alter table public.users enable row level security;
  alter table public.chats enable row level security;
  alter table public.messages enable row level security;
  alter table public.friend_requests enable row level security;
  alter table public.friendships enable row level security;
  alter table public.posts enable row level security;
  alter table public.stories enable row level security;
  alter table public.reels enable row level security;
  alter table public.call_history enable row level security;
  alter table public.wallets enable row level security;
  alter table public.transactions enable row level security;
  alter table public.notifications enable row level security;
  alter table public.typing enable row level security;
  alter table public.presence enable row level security;
  alter table public.groups enable row level security;
  alter table public.bookmarks enable row level security;
  alter table public.hashtags enable row level security;
  alter table public.blocked_users enable row level security;

  -- Users policies
  create policy "Users can read all users" on public.users for select using (true);
  create policy "Users can insert own profile" on public.users for insert with check (auth.uid() = id);
  create policy "Users can update own profile" on public.users for update using (auth.uid() = id);

  -- Chats policies
  create policy "Users can read chats" on public.chats for select using (auth.uid() = any(participants));
  create policy "Users can create chats" on public.chats for insert with check (auth.uid() = any(participants));
  create policy "Users can update chats" on public.chats for update using (auth.uid() = any(participants));

  -- Messages policies
  create policy "Users can read messages" on public.messages for select using (
    auth.uid() in (select unnest(participants) from public.chats where id = chat_id)
  );
  create policy "Users can create messages" on public.messages for insert with check (
    auth.uid() = sender_id and
    auth.uid() in (select unnest(participants) from public.chats where id = chat_id)
  );
  create policy "Users can update messages" on public.messages for update using (auth.uid() = sender_id);

  -- Friend requests policies
  create policy "Users can read friend requests" on public.friend_requests for select using (
    auth.uid() = from_user_id or auth.uid() = to_user_id
  );
  create policy "Users can create friend requests" on public.friend_requests for insert with check (
    auth.uid() = from_user_id
  );
  create policy "Users can update friend requests" on public.friend_requests for update using (
    auth.uid() = from_user_id or auth.uid() = to_user_id
  );
  create policy "Users can delete friend requests" on public.friend_requests for delete using (
    auth.uid() = from_user_id or auth.uid() = to_user_id
  );

  -- Friendships policies
  create policy "Users can read friendships" on public.friendships for select using (
    auth.uid() = user_id or auth.uid() = friend_id
  );
  create policy "Users can create friendships" on public.friendships for insert with check (
    auth.uid() = user_id or auth.uid() = friend_id
  );
  create policy "Users can delete friendships" on public.friendships for delete using (
    auth.uid() = user_id or auth.uid() = friend_id
  );

  -- Posts policies
  create policy "Users can read posts" on public.posts for select using (
    visibility = 'public' or 
    auth.uid() = user_id or
    (visibility = 'friends' and auth.uid() in (
      select friend_id from public.friendships where user_id = posts.user_id
    ))
  );
  create policy "Users can create posts" on public.posts for insert with check (auth.uid() = user_id);
  create policy "Users can update posts" on public.posts for update using (auth.uid() = user_id);
  create policy "Users can delete posts" on public.posts for delete using (auth.uid() = user_id);

  -- Stories policies
  create policy "Users can read stories" on public.stories for select using (
    auth.uid() = user_id or
    auth.uid() in (select friend_id from public.friendships where user_id = stories.user_id)
  );
  create policy "Users can create stories" on public.stories for insert with check (auth.uid() = user_id);
  create policy "Users can delete stories" on public.stories for delete using (auth.uid() = user_id);

  -- Reels policies
  create policy "Users can read reels" on public.reels for select using (true);
  create policy "Users can create reels" on public.reels for insert with check (auth.uid() = user_id);
  create policy "Users can update reels" on public.reels for update using (auth.uid() = user_id);
  create policy "Users can delete reels" on public.reels for delete using (auth.uid() = user_id);

  -- Call history policies
  create policy "Users can read call history" on public.call_history for select using (
    auth.uid() = caller or auth.uid() = callee or auth.uid() = any(participant_ids)
  );
  create policy "Users can create call history" on public.call_history for insert with check (
    auth.uid() = caller or auth.uid() = callee
  );
  create policy "Users can update call history" on public.call_history for update using (
    auth.uid() = caller or auth.uid() = callee
  );

  -- Wallets policies
  create policy "Users can read wallets" on public.wallets for select using (auth.uid() = id);
  create policy "Users can create wallets" on public.wallets for insert with check (auth.uid() = id);
  create policy "Users can update wallets" on public.wallets for update using (auth.uid() = id);

  -- Transactions policies
  create policy "Users can read transactions" on public.transactions for select using (
    auth.uid() = from_user_id or auth.uid() = to_user_id
  );
  create policy "Users can create transactions" on public.transactions for insert with check (
    auth.uid() = from_user_id
  );

  -- Notifications policies
  create policy "Users can read notifications" on public.notifications for select using (auth.uid() = user_id);
  create policy "Users can create notifications" on public.notifications for insert with check (auth.uid() = user_id);
  create policy "Users can update notifications" on public.notifications for update using (auth.uid() = user_id);
  create policy "Users can delete notifications" on public.notifications for delete using (auth.uid() = user_id);

  -- Typing policies
  create policy "Users can read typing" on public.typing for select using (true);
  create policy "Users can upsert typing" on public.typing for all using (true) with check (true);

  -- Presence policies
  create policy "Users can read presence" on public.presence for select using (true);
  create policy "Users can upsert presence" on public.presence for all using (true) with check (true);

  -- Groups policies
  create policy "Users can read groups" on public.groups for select using (auth.uid() = any(members));
  create policy "Users can create groups" on public.groups for insert with check (auth.uid() = creator_id);
  create policy "Users can update groups" on public.groups for update using (
    auth.uid() = creator_id or auth.uid() = any(admins)
  );
  create policy "Users can delete groups" on public.groups for delete using (auth.uid() = creator_id);

  -- Bookmarks policies
  create policy "Users can read bookmarks" on public.bookmarks for select using (auth.uid() = user_id);
  create policy "Users can create bookmarks" on public.bookmarks for insert with check (auth.uid() = user_id);
  create policy "Users can delete bookmarks" on public.bookmarks for delete using (auth.uid() = user_id);

  -- Hashtags policies
  create policy "Users can read hashtags" on public.hashtags for select using (true);
  create policy "Users can create hashtags" on public.hashtags for insert with check (true);
  create policy "Users can update hashtags" on public.hashtags for update using (true);

  -- Blocked users policies
  create policy "Users can read blocked" on public.blocked_users for select using (auth.uid() = blocker_id);
  create policy "Users can create blocked" on public.blocked_users for insert with check (auth.uid() = blocker_id);
  create policy "Users can delete blocked" on public.blocked_users for delete using (auth.uid() = blocker_id);

  -- Enable realtime for all tables
  alter publication supabase_realtime add table public.users;
  alter publication supabase_realtime add table public.chats;
  alter publication supabase_realtime add table public.messages;
  alter publication supabase_realtime add table public.friend_requests;
  alter publication supabase_realtime add table public.friendships;
  alter publication supabase_realtime add table public.posts;
  alter publication supabase_realtime add table public.stories;
  alter publication supabase_realtime add table public.reels;
  alter publication supabase_realtime add table public.call_history;
  alter publication supabase_realtime add table public.wallets;
  alter publication supabase_realtime add table public.transactions;
  alter publication supabase_realtime add table public.notifications;
  alter publication supabase_realtime add table public.typing;
  alter publication supabase_realtime add table public.presence;
  alter publication supabase_realtime add table public.groups;
  alter publication supabase_realtime add table public.bookmarks;
  alter publication supabase_realtime add table public.hashtags;
  alter publication supabase_realtime add table public.blocked_users;

  -- Create indexes for performance
  create index if not exists idx_messages_chat_id on public.messages(chat_id);
  create index if not exists idx_messages_sender_id on public.messages(sender_id);
  create index if not exists idx_messages_created_at on public.messages(created_at);
  create index if not exists idx_chats_participants on public.chats using gin(participants);
  create index if not exists idx_posts_user_id on public.posts(user_id);
  create index if not exists idx_posts_created_at on public.posts(created_at desc);
  create index if not exists idx_friend_requests_from on public.friend_requests(from_user_id);
  create index if not exists idx_friend_requests_to on public.friend_requests(to_user_id);
  create index if not exists idx_call_history_caller on public.call_history(caller);
  create index if not exists idx_call_history_callee on public.call_history(callee);
  create index if not exists idx_notifications_user_id on public.notifications(user_id);
  create index if not exists idx_typing_chat_id on public.typing(chat_id);
  create index if not exists idx_presence_online on public.presence(is_online);

commit;
```

## 6. Create Supabase Client

Create `src/lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export function isSupabaseConfigured(): boolean {
  return !!supabaseUrl && !!supabaseKey;
}
```

## 7. Authentication Migration

Replace `src/lib/firebaseAuth.ts` with `src/lib/supabaseAuth.ts`:

```typescript
import { supabase } from './supabase';
import type { User } from '@/types';

export async function signInWithEmail(email: string, password: string): Promise<User | null> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user ? mapSupabaseUser(data.user) : null;
}

export async function signUpWithEmail(email: string, password: string, name: string): Promise<User | null> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } }
  });
  if (error) throw error;
  
  if (data.user) {
    // Create user profile in public.users table
    await supabase.from('users').insert({
      id: data.user.id,
      email,
      name,
      display_name: name,
    });
    return mapSupabaseUser(data.user);
  }
  return null;
}

export async function signInWithPhone(phone: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) throw error;
}

export async function verifyPhoneOtp(phone: string, token: string): Promise<User | null> {
  const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
  if (error) throw error;
  return data.user ? mapSupabaseUser(data.user) : null;
}

export async function signInWithOAuth(provider: 'google' | 'facebook' | 'apple'): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin }
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function onAuthStateChange(callback: (user: User | null) => void) {
  const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      const user = await fetchUserProfile(session.user.id);
      callback(user);
    } else {
      callback(null);
    }
  });
  return () => data.subscription.unsubscribe();
}

async function fetchUserProfile(userId: string): Promise<User | null> {
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (data) {
    return {
      id: data.id,
      email: data.email,
      name: data.name || data.display_name || 'User',
      displayName: data.display_name,
      avatar: data.avatar,
      bio: data.bio,
      statusMessage: data.status_message,
      phone: data.phone,
      location: data.location,
      website: data.website,
      isVerified: data.is_verified,
      isAdmin: data.is_admin,
      createdAt: data.created_at,
    } as User;
  }
  return null;
}

function mapSupabaseUser(su: any): User {
  return {
    id: su.id,
    email: su.email,
    name: su.user_metadata?.name || su.email?.split('@')[0] || 'User',
    displayName: su.user_metadata?.name,
    avatar: su.user_metadata?.avatar_url,
    createdAt: su.created_at,
  } as User;
}
```

## 8. Real-time Chat Example

```typescript
// Subscribe to messages in a chat
const channel = supabase
  .channel('chat-room-' + chatId)
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
    (payload) => {
      const newMessage = payload.new;
      // Add to your React state
      addMessage(newMessage);
    }
  )
  .subscribe();

// Send a message
await supabase.from('messages').insert({
  chat_id: chatId,
  sender_id: userId,
  content: 'Hello!',
  type: 'text',
});
```

## 9. Cost Estimation

| Users | Monthly Cost | Plan |
|-------|-------------|------|
| 0-100 | **$0** | Free Tier |
| 100-1,000 | **$0** | Free Tier (within limits) |
| 1,000-10,000 | **$25** | Pro Plan |
| 10,000-100,000 | **$25-100** | Pro + usage |
| 100,000+ | **Custom** | Enterprise |

## 10. Next Steps

1. Create Supabase project at https://supabase.com
2. Run the SQL schema above
3. Copy your `URL` and `anon key` to `.env`
4. Install: `npm install @supabase/supabase-js`
5. Create `src/lib/supabase.ts`
6. Replace Firebase auth/store calls with Supabase equivalents
7. Build and deploy

---

**Note:** I can create the full migration code for all stores (useChatStore, useFriendStore, useCallStore, etc.) if you want me to proceed with the Supabase integration. This will make your app fully functional globally.
