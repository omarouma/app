-- ============================================
-- GaGa Chat Full Database Schema for Supabase
-- 100% Idempotent — safe to run multiple times
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- ============================================

begin;

-- ============================================
-- STEP 1: CREATE ALL TABLES
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

-- ============================================
-- STEP 2: ENABLE ROW LEVEL SECURITY (RLS)
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

-- ============================================
-- STEP 3: DROP EXISTING POLICIES (for reruns)
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

-- ============================================
-- STEP 4: CREATE SECURITY POLICIES
-- ============================================

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

-- ============================================
-- STEP 5: ENABLE REALTIME FOR ALL TABLES (idempotent)
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
    'public.blocked_users'
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
-- STEP 6: CREATE INDEXES FOR PERFORMANCE
-- ============================================

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
