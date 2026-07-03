-- ============================================
-- GaGa Chat: Complete One-Click Supabase Setup
-- 100% Idempotent — safe to run multiple times
-- Run in: https://app.supabase.com/project/xqeriudcoozuvcmzniow
-- Paste → Click "Run" → Done
-- ============================================

-- ============================================
-- STEP 1: CREATE ALL TABLES (if not exist)
-- ============================================

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
  type text default 'direct',
  created_by uuid references public.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.messages (
  id uuid default gen_random_uuid() primary key,
  chat_id uuid references public.chats(id) on delete cascade,
  sender_id uuid references public.users(id),
  content text not null,
  type text default 'text',
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
  status text default 'pending',
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
  visibility text default 'public',
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
  type text default 'image',
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
  type text default 'voice',
  status text default 'missed',
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
  type text default 'p2p',
  description text,
  status text default 'completed',
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
  id text primary key,
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

create table if not exists public.call_signaling (
  call_id text primary key,
  offer jsonb,
  answer jsonb,
  caller_ice jsonb default '[]',
  callee_ice jsonb default '[]',
  updated_at timestamptz default now()
);

create table if not exists public.qr_sessions (
  id uuid default gen_random_uuid() primary key,
  session_id text unique not null,
  user_id uuid references public.users(id),
  status text default 'waiting',
  created_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '5 minutes')
);

-- ============================================
-- STEP 2: ADD MISSING COLUMNS (100% idempotent)
-- ============================================

-- USERS
alter table public.users add column if not exists username text;
alter table public.users add column if not exists status text default 'offline';
alter table public.users add column if not exists latitude numeric;
alter table public.users add column if not exists longitude numeric;
alter table public.users add column if not exists coins int default 0;
alter table public.users add column if not exists bdt_balance numeric default 0;
alter table public.users add column if not exists friends text[] default '{}';
alter table public.users add column if not exists followers text[] default '{}';
alter table public.users add column if not exists following text[] default '{}';
alter table public.users add column if not exists blocked_users text[] default '{}';
alter table public.users add column if not exists favorites text[] default '{}';
alter table public.users add column if not exists hide_online_status boolean default false;
alter table public.users add column if not exists hide_friend_list boolean default false;
alter table public.users add column if not exists friend_request_privacy text default 'everyone';
alter table public.users add column if not exists group_add_privacy text default 'everyone';
alter table public.users add column if not exists close_friends text[] default '{}';
alter table public.users add column if not exists disappearing_messages_default int default 0;
alter table public.users add column if not exists chat_locks jsonb default '{}';
alter table public.users add column if not exists broadcast_lists text[] default '{}';
alter table public.users add column if not exists achievements text[] default '{}';
alter table public.users add column if not exists streak_days int default 0;
alter table public.users add column if not exists referral_code text;
alter table public.users add column if not exists referral_count int default 0;
alter table public.users add column if not exists is_premium boolean default false;
alter table public.users add column if not exists premium_expires_at timestamptz;
alter table public.users add column if not exists cover_image text;

-- CHATS
alter table public.chats add column if not exists last_message text;
alter table public.chats add column if not exists unread_count int default 0;
alter table public.chats add column if not exists is_muted boolean default false;
alter table public.chats add column if not exists admins uuid[] default '{}';
alter table public.chats add column if not exists disappearing_messages int default 0;
alter table public.chats add column if not exists chat_locked boolean default false;
alter table public.chats add column if not exists lock_type text;
alter table public.chats add column if not exists lock_value text;
alter table public.chats add column if not exists archived boolean default false;
alter table public.chats add column if not exists pinned_messages jsonb default '[]';
alter table public.chats add column if not exists description text;

-- MESSAGES
alter table public.messages add column if not exists contact_card jsonb;
alter table public.messages add column if not exists disappearing_timer int default 0;
alter table public.messages add column if not exists disappearing_initiated_at timestamptz;
alter table public.messages add column if not exists destroyed boolean default false;

-- POSTS (add camelCase aliases the app expects)
alter table public.posts add column if not exists images text[] default '{}';
alter table public.posts add column if not exists likes text[] default '{}';
alter table public.posts add column if not exists comments jsonb default '[]';
alter table public.posts add column if not exists shares text[] default '{}';
alter table public.posts add column if not exists user_name text;
alter table public.posts add column if not exists user_avatar text;
alter table public.posts add column if not exists poll_data jsonb;

-- STORIES
alter table public.stories add column if not exists viewed_by text[] default '{}';
alter table public.stories add column if not exists user_name text;
alter table public.stories add column if not exists user_avatar text;

-- REELS
alter table public.reels add column if not exists music_title text;
alter table public.reels add column if not exists music_url text;
alter table public.reels add column if not exists filters text[] default '{}';
alter table public.reels add column if not exists effects text[] default '{}';
alter table public.reels add column if not exists speed numeric;
alter table public.reels add column if not exists voiceover text;
alter table public.reels add column if not exists captions text;
alter table public.reels add column if not exists duration int default 0;
alter table public.reels add column if not exists likes text[] default '{}';
alter table public.reels add column if not exists comments jsonb default '[]';
alter table public.reels add column if not exists shares text[] default '{}';
alter table public.reels add column if not exists saved_by text[] default '{}';
alter table public.reels add column if not exists viewed_by text[] default '{}';
alter table public.reels add column if not exists user_name text;
alter table public.reels add column if not exists user_avatar text;
alter table public.reels add column if not exists tags text[] default '{}';
alter table public.reels add column if not exists mentions text[] default '{}';
alter table public.reels add column if not exists remix_of text;
alter table public.reels add column if not exists duet_with text;
alter table public.reels add column if not exists template text;
alter table public.reels add column if not exists view_count int default 0;
alter table public.reels add column if not exists reactions jsonb;

-- BLOCKED_USERS
alter table public.blocked_users add column if not exists reason text;

-- CALL_HISTORY
alter table public.call_history add column if not exists ended_at timestamptz;

-- ============================================
-- STEP 3: ENABLE ROW LEVEL SECURITY
-- ============================================

alter table if exists public.users enable row level security;
alter table if exists public.chats enable row level security;
alter table if exists public.messages enable row level security;
alter table if exists public.friend_requests enable row level security;
alter table if exists public.friendships enable row level security;
alter table if exists public.posts enable row level security;
alter table if exists public.stories enable row level security;
alter table if exists public.reels enable row level security;
alter table if exists public.call_history enable row level security;
alter table if exists public.wallets enable row level security;
alter table if exists public.transactions enable row level security;
alter table if exists public.notifications enable row level security;
alter table if exists public.typing enable row level security;
alter table if exists public.presence enable row level security;
alter table if exists public.groups enable row level security;
alter table if exists public.bookmarks enable row level security;
alter table if exists public.hashtags enable row level security;
alter table if exists public.blocked_users enable row level security;
alter table if exists public.call_signaling enable row level security;
alter table if exists public.qr_sessions enable row level security;

-- ============================================
-- STEP 4: DROP OLD POLICIES (for clean reruns)
-- ============================================

drop policy if exists "Users can read all users" on public.users;
drop policy if exists "Users can insert own profile" on public.users;
drop policy if exists "Users can update own profile" on public.users;
drop policy if exists "Users can read chats" on public.chats;
drop policy if exists "Users can create chats" on public.chats;
drop policy if exists "Users can update chats" on public.chats;
drop policy if exists "Users can read messages" on public.messages;
drop policy if exists "Users can create messages" on public.messages;
drop policy if exists "Users can update messages" on public.messages;
drop policy if exists "Users can read friend requests" on public.friend_requests;
drop policy if exists "Users can create friend requests" on public.friend_requests;
drop policy if exists "Users can update friend requests" on public.friend_requests;
drop policy if exists "Users can delete friend requests" on public.friend_requests;
drop policy if exists "Users can read friendships" on public.friendships;
drop policy if exists "Users can create friendships" on public.friendships;
drop policy if exists "Users can delete friendships" on public.friendships;
drop policy if exists "Users can read posts" on public.posts;
drop policy if exists "Users can create posts" on public.posts;
drop policy if exists "Users can update posts" on public.posts;
drop policy if exists "Users can delete posts" on public.posts;
drop policy if exists "Users can read stories" on public.stories;
drop policy if exists "Users can create stories" on public.stories;
drop policy if exists "Users can delete stories" on public.stories;
drop policy if exists "Users can read reels" on public.reels;
drop policy if exists "Users can create reels" on public.reels;
drop policy if exists "Users can update reels" on public.reels;
drop policy if exists "Users can delete reels" on public.reels;
drop policy if exists "Users can read call history" on public.call_history;
drop policy if exists "Users can create call history" on public.call_history;
drop policy if exists "Users can update call history" on public.call_history;
drop policy if exists "Users can read wallets" on public.wallets;
drop policy if exists "Users can create wallets" on public.wallets;
drop policy if exists "Users can update wallets" on public.wallets;
drop policy if exists "Users can read transactions" on public.transactions;
drop policy if exists "Users can create transactions" on public.transactions;
drop policy if exists "Users can read notifications" on public.notifications;
drop policy if exists "Users can create notifications" on public.notifications;
drop policy if exists "Users can update notifications" on public.notifications;
drop policy if exists "Users can delete notifications" on public.notifications;
drop policy if exists "Users can read typing" on public.typing;
drop policy if exists "Users can upsert typing" on public.typing;
drop policy if exists "Users can read presence" on public.presence;
drop policy if exists "Users can upsert presence" on public.presence;
drop policy if exists "Users can read groups" on public.groups;
drop policy if exists "Users can create groups" on public.groups;
drop policy if exists "Users can update groups" on public.groups;
drop policy if exists "Users can delete groups" on public.groups;
drop policy if exists "Users can read bookmarks" on public.bookmarks;
drop policy if exists "Users can create bookmarks" on public.bookmarks;
drop policy if exists "Users can delete bookmarks" on public.bookmarks;
drop policy if exists "Users can read hashtags" on public.hashtags;
drop policy if exists "Users can create hashtags" on public.hashtags;
drop policy if exists "Users can update hashtags" on public.hashtags;
drop policy if exists "Users can read blocked" on public.blocked_users;
drop policy if exists "Users can create blocked" on public.blocked_users;
drop policy if exists "Users can delete blocked" on public.blocked_users;

-- Call signaling
drop policy if exists "Anyone can read call_signaling" on public.call_signaling;
drop policy if exists "Anyone can create call_signaling" on public.call_signaling;
drop policy if exists "Anyone can update call_signaling" on public.call_signaling;

-- QR sessions
drop policy if exists "Anyone can read QR sessions" on public.qr_sessions;
drop policy if exists "Anyone can create QR sessions" on public.qr_sessions;
drop policy if exists "Anyone can update QR sessions" on public.qr_sessions;

-- ============================================
-- STEP 5: CREATE SECURITY POLICIES
-- ============================================

-- Users
create policy "Users can read all users" on public.users for select using (true);
create policy "Users can insert own profile" on public.users for insert with check (auth.uid() = id);
create policy "Users can update own profile" on public.users for update using (auth.uid() = id);

-- Chats
create policy "Users can read chats" on public.chats for select using (auth.uid() = any(participants));
create policy "Users can create chats" on public.chats for insert with check (auth.uid() = any(participants));
create policy "Users can update chats" on public.chats for update using (auth.uid() = any(participants));

-- Messages
create policy "Users can read messages" on public.messages for select using (
  auth.uid() in (select unnest(participants) from public.chats where id = chat_id)
);
create policy "Users can create messages" on public.messages for insert with check (
  auth.uid() = sender_id and
  auth.uid() in (select unnest(participants) from public.chats where id = chat_id)
);
create policy "Users can update messages" on public.messages for update using (auth.uid() = sender_id);

-- Friend requests
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

-- Friendships
create policy "Users can read friendships" on public.friendships for select using (
  auth.uid() = user_id or auth.uid() = friend_id
);
create policy "Users can create friendships" on public.friendships for insert with check (
  auth.uid() = user_id or auth.uid() = friend_id
);
create policy "Users can delete friendships" on public.friendships for delete using (
  auth.uid() = user_id or auth.uid() = friend_id
);

-- Posts
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

-- Stories
create policy "Users can read stories" on public.stories for select using (
  auth.uid() = user_id or
  auth.uid() in (select friend_id from public.friendships where user_id = stories.user_id)
);
create policy "Users can create stories" on public.stories for insert with check (auth.uid() = user_id);
create policy "Users can delete stories" on public.stories for delete using (auth.uid() = user_id);

-- Reels
create policy "Users can read reels" on public.reels for select using (true);
create policy "Users can create reels" on public.reels for insert with check (auth.uid() = user_id);
create policy "Users can update reels" on public.reels for update using (auth.uid() = user_id);
create policy "Users can delete reels" on public.reels for delete using (auth.uid() = user_id);

-- Call history
create policy "Users can read call history" on public.call_history for select using (
  auth.uid() = caller or auth.uid() = callee or auth.uid() = any(participant_ids)
);
create policy "Users can create call history" on public.call_history for insert with check (
  auth.uid() = caller or auth.uid() = callee
);
create policy "Users can update call history" on public.call_history for update using (
  auth.uid() = caller or auth.uid() = callee
);

-- Wallets
create policy "Users can read wallets" on public.wallets for select using (auth.uid() = id);
create policy "Users can create wallets" on public.wallets for insert with check (auth.uid() = id);
create policy "Users can update wallets" on public.wallets for update using (auth.uid() = id);

-- Transactions
create policy "Users can read transactions" on public.transactions for select using (
  auth.uid() = from_user_id or auth.uid() = to_user_id
);
create policy "Users can create transactions" on public.transactions for insert with check (
  auth.uid() = from_user_id
);

-- Notifications
create policy "Users can read notifications" on public.notifications for select using (auth.uid() = user_id);
create policy "Users can create notifications" on public.notifications for insert with check (auth.uid() = user_id);
create policy "Users can update notifications" on public.notifications for update using (auth.uid() = user_id);
create policy "Users can delete notifications" on public.notifications for delete using (auth.uid() = user_id);

-- Typing
create policy "Users can read typing" on public.typing for select using (true);
create policy "Users can upsert typing" on public.typing for all using (true) with check (true);

-- Presence
create policy "Users can read presence" on public.presence for select using (true);
create policy "Users can upsert presence" on public.presence for all using (true) with check (true);

-- Groups
create policy "Users can read groups" on public.groups for select using (auth.uid() = any(members));
create policy "Users can create groups" on public.groups for insert with check (auth.uid() = creator_id);
create policy "Users can update groups" on public.groups for update using (
  auth.uid() = creator_id or auth.uid() = any(admins)
);
create policy "Users can delete groups" on public.groups for delete using (auth.uid() = creator_id);

-- Bookmarks
create policy "Users can read bookmarks" on public.bookmarks for select using (auth.uid() = user_id);
create policy "Users can create bookmarks" on public.bookmarks for insert with check (auth.uid() = user_id);
create policy "Users can delete bookmarks" on public.bookmarks for delete using (auth.uid() = user_id);

-- Hashtags
create policy "Users can read hashtags" on public.hashtags for select using (true);
create policy "Users can create hashtags" on public.hashtags for insert with check (true);
create policy "Users can update hashtags" on public.hashtags for update using (true);

-- Blocked users
create policy "Users can read blocked" on public.blocked_users for select using (auth.uid() = blocker_id);
create policy "Users can create blocked" on public.blocked_users for insert with check (auth.uid() = blocker_id);
create policy "Users can delete blocked" on public.blocked_users for delete using (auth.uid() = blocker_id);

-- Call signaling (open for WebRTC)
create policy "Anyone can read call_signaling" on public.call_signaling for select using (true);
create policy "Anyone can create call_signaling" on public.call_signaling for insert with check (true);
create policy "Anyone can update call_signaling" on public.call_signaling for update using (true);

-- QR sessions (open for scanning)
create policy "Anyone can read QR sessions" on public.qr_sessions for select using (true);
create policy "Anyone can create QR sessions" on public.qr_sessions for insert with check (true);
create policy "Anyone can update QR sessions" on public.qr_sessions for update using (true);

-- ============================================
-- STEP 6: ENABLE REALTIME FOR ALL TABLES
-- ============================================

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'public.users',
    'public.chats',
    'public.messages',
    'public.friend_requests',
    'public.friendships',
    'public.posts',
    'public.stories',
    'public.reels',
    'public.call_history',
    'public.wallets',
    'public.transactions',
    'public.notifications',
    'public.typing',
    'public.presence',
    'public.groups',
    'public.bookmarks',
    'public.hashtags',
    'public.blocked_users',
    'public.call_signaling',
    'public.qr_sessions'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE schemaname = split_part(t, '.', 1)
        AND tablename  = split_part(t, '.', 2)
        AND pubname    = 'supabase_realtime'
    ) THEN
      EXECUTE format('alter publication supabase_realtime add table %s;', t);
    END IF;
  END LOOP;
END $$;

-- ============================================
-- STEP 7: AUTH TRIGGERS (auto-create profile on signup)
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (
    id, email, name, display_name, username, created_at, updated_at
  )
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'username', lower(replace(split_part(new.email, '@', 1), ' ', '_'))),
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Auto-create wallet on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_wallet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.wallets (
    id, coins, staked_coins, daily_interest_rate, total_earned, total_spent, created_at, updated_at
  )
  VALUES (
    new.id, 0, 0, 0.0005, 0, 0, now(), now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_wallet ON auth.users;
CREATE TRIGGER on_auth_user_wallet
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_wallet();

-- ============================================
-- STEP 8: CREATE INDEXES FOR PERFORMANCE
-- ============================================

create index if not exists idx_users_username on public.users(username);
create index if not exists idx_users_name on public.users(name);
create index if not exists idx_users_email on public.users(email);
create index if not exists idx_chats_participants on public.chats using gin(participants);
create index if not exists idx_chats_updated_at on public.chats(updated_at desc);
create index if not exists idx_messages_chat_id on public.messages(chat_id);
create index if not exists idx_messages_sender_id on public.messages(sender_id);
create index if not exists idx_messages_created_at on public.messages(created_at);
create index if not exists idx_friend_requests_from on public.friend_requests(from_user_id);
create index if not exists idx_friend_requests_to on public.friend_requests(to_user_id);
create index if not exists idx_friendships_user on public.friendships(user_id);
create index if not exists idx_friendships_friend on public.friendships(friend_id);
create index if not exists idx_posts_user_id on public.posts(user_id);
create index if not exists idx_posts_created_at on public.posts(created_at desc);
create index if not exists idx_stories_user_id on public.stories(user_id);
create index if not exists idx_stories_expires on public.stories(expires_at);
create index if not exists idx_reels_user_id on public.reels(user_id);
create index if not exists idx_reels_created_at on public.reels(created_at desc);
create index if not exists idx_blocked_users_blocker on public.blocked_users(blocker_id);
create index if not exists idx_call_history_caller on public.call_history(caller);
create index if not exists idx_call_history_callee on public.call_history(callee);
create index if not exists idx_call_history_created_at on public.call_history(created_at desc);
create index if not exists idx_notifications_user_id on public.notifications(user_id);
create index if not exists idx_typing_chat_id on public.typing(chat_id);
create index if not exists idx_presence_online on public.presence(is_online);
create index if not exists idx_users_latitude on public.users(latitude) WHERE latitude IS NOT NULL;
create index if not exists idx_users_longitude on public.users(longitude) WHERE longitude IS NOT NULL;
create index if not exists idx_qr_sessions_session_id on public.qr_sessions(session_id);
create index if not exists idx_call_signaling_call_id on public.call_signaling(call_id);

-- ============================================
-- DONE! All tables, columns, RLS, realtime,
-- triggers, and indexes are ready.
-- ============================================
