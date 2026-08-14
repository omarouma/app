-- ============================================================
-- GaGa Chat — FULL PRODUCTION SETUP
-- Project: alzwgikndwbecuqmlrca | Region: ap-southeast-1
-- ============================================================
-- Run this ONCE in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/alzwgikndwbecuqmlrca/sql
--
-- Order matters — run top to bottom.
-- Safe to re-run (all statements are idempotent).
-- ============================================================

-- ─── EXTENSIONS ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- 1. USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  name TEXT,
  display_name TEXT,
  username TEXT UNIQUE,
  avatar TEXT,
  cover_image TEXT,
  bio TEXT,
  phone TEXT,
  location TEXT,
  website TEXT,
  status TEXT DEFAULT 'offline',
  status_message TEXT,
  is_verified BOOLEAN DEFAULT false,
  is_admin BOOLEAN DEFAULT false,
  is_premium BOOLEAN DEFAULT false,
  premium_expires_at TIMESTAMPTZ,
  coins INTEGER DEFAULT 0,
  bdt_balance NUMERIC(18,2) DEFAULT 0,
  usd_balance NUMERIC(18,2) DEFAULT 0,
  friends TEXT[] DEFAULT '{}',
  followers TEXT[] DEFAULT '{}',
  following TEXT[] DEFAULT '{}',
  close_friends TEXT[] DEFAULT '{}',
  blocked_users TEXT[] DEFAULT '{}',
  favorites TEXT[] DEFAULT '{}',
  last_seen TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  hide_online_status BOOLEAN DEFAULT false,
  hide_friend_list BOOLEAN DEFAULT false,
  friend_request_privacy TEXT DEFAULT 'everyone',
  group_add_privacy TEXT DEFAULT 'everyone',
  referral_code TEXT,
  referral_count INTEGER DEFAULT 0,
  streak_days INTEGER DEFAULT 0,
  achievements TEXT[] DEFAULT '{}',
  disappearing_messages_default INTEGER DEFAULT 0,
  chat_locks JSONB DEFAULT '{}',
  broadcast_lists TEXT[] DEFAULT '{}',
  push_subscription TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_authenticated" ON users;
CREATE POLICY "users_select_authenticated" ON users
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "users_insert_own" ON users;
CREATE POLICY "users_insert_own" ON users
  FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = id::text);

DROP POLICY IF EXISTS "users_update_own" ON users;
CREATE POLICY "users_update_own" ON users
  FOR UPDATE TO authenticated
  USING (auth.uid()::text = id::text)
  WITH CHECK (auth.uid()::text = id::text);

-- ─── Auto-create user row on signup ───────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.users (id, email, name, display_name, created_at, updated_at)
  VALUES (
    NEW.id::text,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
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
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 2. CHATS
-- ============================================================
CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  type TEXT DEFAULT 'direct',
  participants TEXT[] DEFAULT '{}',
  name TEXT,
  avatar TEXT,
  description TEXT,
  last_message TEXT,
  last_message_sender_id TEXT,
  last_message_read BOOLEAN DEFAULT false,
  unread_count JSONB DEFAULT '{}',
  is_muted BOOLEAN DEFAULT false,
  admins TEXT[] DEFAULT '{}',
  created_by TEXT,
  pinned_messages JSONB DEFAULT '[]',
  disappearing_messages INTEGER DEFAULT 0,
  chat_locked BOOLEAN DEFAULT false,
  lock_type TEXT,
  lock_value TEXT,
  archived BOOLEAN DEFAULT false,
  pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chats_participants ON chats USING GIN (participants);
CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON chats (updated_at DESC);

ALTER TABLE chats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chats_participant_access" ON chats;
CREATE POLICY "chats_participant_access" ON chats
  FOR ALL TO authenticated
  USING (auth.uid()::text = ANY(participants))
  WITH CHECK (auth.uid()::text = ANY(participants));

-- ============================================================
-- 3. MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  content TEXT,
  type TEXT DEFAULT 'text',
  media_url TEXT,
  media_urls TEXT[] DEFAULT '{}',
  reply_to TEXT,
  reactions JSONB DEFAULT '{}',
  forwarded_from TEXT,
  poll_data JSONB,
  transfer_data JSONB,
  contact_card JSONB,
  read BOOLEAN DEFAULT false,
  edited BOOLEAN DEFAULT false,
  destroyed BOOLEAN DEFAULT false,
  delivery_status TEXT DEFAULT 'sent',
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  disappearing_timer INTEGER DEFAULT 0,
  disappearing_initiated_at TIMESTAMPTZ,
  local_id TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages (chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_created ON messages (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_read ON messages (chat_id, read) WHERE read = false;

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Read access: any chat participant can view messages in that chat.
DROP POLICY IF EXISTS "messages_participant_select" ON messages;
CREATE POLICY "messages_participant_select" ON messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM chats
      WHERE chats.id = messages.chat_id
        AND auth.uid()::text = ANY(chats.participants)
    )
  );

-- Write access: only the sender can insert their own messages into a chat they belong to.
DROP POLICY IF EXISTS "messages_participant_insert" ON messages;
CREATE POLICY "messages_participant_insert" ON messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid()::text = sender_id
    AND EXISTS (
      SELECT 1 FROM chats
      WHERE chats.id = messages.chat_id
        AND auth.uid()::text = ANY(chats.participants)
    )
  );

-- Sender can update their own message content, metadata, and edits.
DROP POLICY IF EXISTS "messages_sender_update" ON messages;
CREATE POLICY "messages_sender_update" ON messages
  FOR UPDATE TO authenticated
  USING (auth.uid()::text = sender_id)
  WITH CHECK (
    auth.uid()::text = sender_id
    AND NEW.chat_id IS NOT DISTINCT FROM OLD.chat_id
    AND NEW.sender_id IS NOT DISTINCT FROM OLD.sender_id
    AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
  );

-- Recipients may only update read-delivery metadata; they cannot change message content.
DROP POLICY IF EXISTS "messages_recipient_read_update" ON messages;
CREATE POLICY "messages_recipient_read_update" ON messages
  FOR UPDATE TO authenticated
  USING (
    auth.uid()::text <> sender_id
    AND EXISTS (
      SELECT 1 FROM chats
      WHERE chats.id = messages.chat_id
        AND auth.uid()::text = ANY(chats.participants)
    )
  )
  WITH CHECK (
    auth.uid()::text <> sender_id
    AND NEW.chat_id IS NOT DISTINCT FROM OLD.chat_id
    AND NEW.sender_id IS NOT DISTINCT FROM OLD.sender_id
    AND NEW.content IS NOT DISTINCT FROM OLD.content
    AND NEW.type IS NOT DISTINCT FROM OLD.type
    AND NEW.media_url IS NOT DISTINCT FROM OLD.media_url
    AND NEW.media_urls IS NOT DISTINCT FROM OLD.media_urls
    AND NEW.reply_to IS NOT DISTINCT FROM OLD.reply_to
    AND NEW.reactions IS NOT DISTINCT FROM OLD.reactions
    AND NEW.forwarded_from IS NOT DISTINCT FROM OLD.forwarded_from
    AND NEW.poll_data IS NOT DISTINCT FROM OLD.poll_data
    AND NEW.transfer_data IS NOT DISTINCT FROM OLD.transfer_data
    AND NEW.contact_card IS NOT DISTINCT FROM OLD.contact_card
    AND NEW.edited IS NOT DISTINCT FROM OLD.edited
    AND NEW.destroyed IS NOT DISTINCT FROM OLD.destroyed
    AND NEW.disappearing_timer IS NOT DISTINCT FROM OLD.disappearing_timer
    AND NEW.disappearing_initiated_at IS NOT DISTINCT FROM OLD.disappearing_initiated_at
    AND NEW.local_id IS NOT DISTINCT FROM OLD.local_id
    AND NEW.retry_count IS NOT DISTINCT FROM OLD.retry_count
    AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
    AND (
      (NEW.read IS NOT DISTINCT FROM OLD.read AND NEW.read_at IS NOT DISTINCT FROM OLD.read_at)
      OR (NEW.read = true AND NEW.read_at IS NOT NULL)
    )
    AND (
      NEW.delivered_at IS NOT DISTINCT FROM OLD.delivered_at
      OR NEW.delivered_at IS NOT NULL
    )
    AND (
      NEW.delivery_status IS NOT DISTINCT FROM OLD.delivery_status
      OR NEW.delivery_status IN ('sent', 'delivered', 'read')
    )
  );

-- Delete access: only the sender may delete their own message.
DROP POLICY IF EXISTS "messages_sender_delete" ON messages;
CREATE POLICY "messages_sender_delete" ON messages
  FOR DELETE TO authenticated
  USING (auth.uid()::text = sender_id);

-- ============================================================
-- 4. POSTS
-- ============================================================
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  content TEXT,
  media_url TEXT,
  media_urls TEXT[] DEFAULT '{}',
  type TEXT DEFAULT 'text',
  likes TEXT[] DEFAULT '{}',
  comments_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0,
  views_count INTEGER DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  location TEXT,
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts (created_at DESC);

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "posts_select_all" ON posts;
CREATE POLICY "posts_select_all" ON posts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "posts_insert_own" ON posts;
CREATE POLICY "posts_insert_own" ON posts
  FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "posts_update_own" ON posts;
CREATE POLICY "posts_update_own" ON posts
  FOR UPDATE TO authenticated
  USING (auth.uid()::text = user_id::text)
  WITH CHECK (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "posts_delete_own" ON posts;
CREATE POLICY "posts_delete_own" ON posts
  FOR DELETE TO authenticated USING (auth.uid()::text = user_id::text);

-- ============================================================
-- 5. STORIES
-- ============================================================
CREATE TABLE IF NOT EXISTS stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  media_url TEXT NOT NULL,
  type TEXT DEFAULT 'image',
  caption TEXT,
  viewers TEXT[] DEFAULT '{}',
  likes TEXT[] DEFAULT '{}',
  duration INTEGER DEFAULT 5,
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stories_user_id ON stories (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_expires_at ON stories (expires_at);

ALTER TABLE stories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stories_select_all" ON stories;
CREATE POLICY "stories_select_all" ON stories FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "stories_insert_own" ON stories;
CREATE POLICY "stories_insert_own" ON stories
  FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "stories_update_own" ON stories;
CREATE POLICY "stories_update_own" ON stories
  FOR UPDATE TO authenticated
  USING (auth.uid()::text = user_id::text)
  WITH CHECK (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "stories_delete_own" ON stories;
CREATE POLICY "stories_delete_own" ON stories
  FOR DELETE TO authenticated USING (auth.uid()::text = user_id::text);

-- ============================================================
-- 6. REELS
-- ============================================================
CREATE TABLE IF NOT EXISTS reels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  caption TEXT,
  likes TEXT[] DEFAULT '{}',
  comments_count INTEGER DEFAULT 0,
  views_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  category TEXT,
  duration INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reels_user_id ON reels (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reels_created_at ON reels (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reels_views_count ON reels (views_count DESC);
CREATE INDEX IF NOT EXISTS idx_reels_tags ON reels USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_reels_category ON reels (category, created_at DESC);

ALTER TABLE reels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reels_select_all" ON reels;
CREATE POLICY "reels_select_all" ON reels FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "reels_insert_own" ON reels;
CREATE POLICY "reels_insert_own" ON reels
  FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "reels_update_own" ON reels;
CREATE POLICY "reels_update_own" ON reels
  FOR UPDATE TO authenticated
  USING (auth.uid()::text = user_id::text)
  WITH CHECK (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "reels_delete_own" ON reels;
CREATE POLICY "reels_delete_own" ON reels
  FOR DELETE TO authenticated USING (auth.uid()::text = user_id::text);

-- ============================================================
-- 7. COMMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID,
  reel_id UUID,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  user_name TEXT,
  user_avatar TEXT,
  likes TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments (post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_reel_id ON comments (reel_id, created_at);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comments_select_all" ON comments;
CREATE POLICY "comments_select_all" ON comments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "comments_insert_own" ON comments;
CREATE POLICY "comments_insert_own" ON comments
  FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "comments_delete_own" ON comments;
CREATE POLICY "comments_delete_own" ON comments
  FOR DELETE TO authenticated USING (auth.uid()::text = user_id::text);

-- ============================================================
-- 8. FRIENDSHIPS
-- ============================================================
CREATE TABLE IF NOT EXISTS friendships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  friend_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_friendships_user_id ON friendships (user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend_id ON friendships (friend_id);

ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "friendships_all" ON friendships;
CREATE POLICY "friendships_all" ON friendships
  FOR ALL TO authenticated
  USING (auth.uid()::text = user_id OR auth.uid()::text = friend_id)
  WITH CHECK (auth.uid()::text = user_id OR auth.uid()::text = friend_id);

-- ============================================================
-- 9. FRIEND REQUESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS friend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (from_user_id, to_user_id)
);

CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests (to_user_id, status);
CREATE INDEX IF NOT EXISTS idx_friend_requests_from ON friend_requests (from_user_id, status);

ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "friend_requests_all" ON friend_requests;
CREATE POLICY "friend_requests_all" ON friend_requests
  FOR ALL TO authenticated
  USING (auth.uid()::text = from_user_id OR auth.uid()::text = to_user_id)
  WITH CHECK (auth.uid()::text = from_user_id OR auth.uid()::text = to_user_id);

-- ============================================================
-- 10. BLOCKED USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS blocked_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id TEXT NOT NULL,
  blocked_id TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON blocked_users (blocker_id);

ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blocked_users_own" ON blocked_users;
CREATE POLICY "blocked_users_own" ON blocked_users
  FOR ALL TO authenticated
  USING (auth.uid()::text = blocker_id)
  WITH CHECK (auth.uid()::text = blocker_id);

-- ============================================================
-- 11. NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT,
  body TEXT,
  read BOOLEAN DEFAULT false,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  timestamp TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (user_id, read) WHERE read = false;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_own" ON notifications;
CREATE POLICY "notifications_own" ON notifications
  FOR ALL TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- Allow service role to insert notifications for other users (triggers/edge functions)
DROP POLICY IF EXISTS "notifications_service_insert" ON notifications;
CREATE POLICY "notifications_service_insert" ON notifications
  FOR INSERT TO service_role WITH CHECK (true);

-- ============================================================
-- 12. PRESENCE
-- ============================================================
CREATE TABLE IF NOT EXISTS presence (
  user_id TEXT PRIMARY KEY,
  is_online BOOLEAN DEFAULT false,
  last_seen TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "presence_all" ON presence;
CREATE POLICY "presence_all" ON presence
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 13. TYPING
-- ============================================================
CREATE TABLE IF NOT EXISTS typing (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT,
  is_typing BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_typing_chat_id ON typing (chat_id);

ALTER TABLE typing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "typing_all" ON typing;
CREATE POLICY "typing_all" ON typing
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 14. LIVE STREAMS
-- ============================================================
CREATE TABLE IF NOT EXISTS live_streams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  title TEXT,
  description TEXT,
  thumbnail_url TEXT,
  status TEXT DEFAULT 'live',
  viewer_count INTEGER DEFAULT 0,
  peak_viewers INTEGER DEFAULT 0,
  likes TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_live_streams_user_id ON live_streams (user_id);
CREATE INDEX IF NOT EXISTS idx_live_streams_status ON live_streams (status);

ALTER TABLE live_streams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "live_streams_all" ON live_streams;
CREATE POLICY "live_streams_all" ON live_streams
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 15. CALL SIGNALING (WebRTC 1:1)
-- ============================================================
CREATE TABLE IF NOT EXISTS call_signaling (
  call_id TEXT PRIMARY KEY,
  offer JSONB,
  answer JSONB,
  caller_ice JSONB DEFAULT '[]',
  callee_ice JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE call_signaling ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "call_signaling_all" ON call_signaling;
CREATE POLICY "call_signaling_all" ON call_signaling
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 16. LIVE STREAM SIGNALS (WebRTC broadcast)
-- ============================================================
CREATE TABLE IF NOT EXISTS live_stream_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id TEXT NOT NULL,
  type TEXT NOT NULL,
  "from" TEXT NOT NULL,
  "to" TEXT,
  sdp TEXT,
  candidate TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_stream_signals_stream_id ON live_stream_signals (stream_id, created_at);

ALTER TABLE live_stream_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "live_stream_signals_all" ON live_stream_signals;
CREATE POLICY "live_stream_signals_all" ON live_stream_signals
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 17. VOICE ROOM SIGNALS (WebRTC multi-party)
-- ============================================================
CREATE TABLE IF NOT EXISTS voice_room_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT NOT NULL,
  type TEXT NOT NULL,
  "from" TEXT NOT NULL,
  "to" TEXT,
  sdp TEXT,
  candidate TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voice_room_signals_room_id ON voice_room_signals (room_id, created_at);

ALTER TABLE voice_room_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "voice_room_signals_all" ON voice_room_signals;
CREATE POLICY "voice_room_signals_all" ON voice_room_signals
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 18. VOICE ROOMS
-- ============================================================
CREATE TABLE IF NOT EXISTS voice_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  creator_id TEXT NOT NULL,
  participants TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ
);

ALTER TABLE voice_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "voice_rooms_all" ON voice_rooms;
CREATE POLICY "voice_rooms_all" ON voice_rooms
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 19. CALL HISTORY
-- ============================================================
CREATE TABLE IF NOT EXISTS call_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id TEXT NOT NULL,
  callee_id TEXT NOT NULL,
  type TEXT DEFAULT 'audio',
  status TEXT DEFAULT 'missed',
  duration INTEGER DEFAULT 0,
  signaling JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_call_history_caller ON call_history (caller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_history_callee ON call_history (callee_id, created_at DESC);

ALTER TABLE call_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "call_history_own" ON call_history;
CREATE POLICY "call_history_own" ON call_history
  FOR ALL TO authenticated
  USING (auth.uid()::text = caller_id OR auth.uid()::text = callee_id)
  WITH CHECK (auth.uid()::text = caller_id OR auth.uid()::text = callee_id);

-- ============================================================
-- 20. WALLETS
-- ============================================================
CREATE TABLE IF NOT EXISTS wallets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  bdt_balance NUMERIC(18,2) DEFAULT 0,
  usd_balance NUMERIC(18,2) DEFAULT 0,
  coins INTEGER DEFAULT 0,
  transactions JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wallets_own" ON wallets;
CREATE POLICY "wallets_own" ON wallets
  FOR ALL TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- ============================================================
-- 21. GROUPS
-- ============================================================
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  avatar TEXT,
  creator_id TEXT NOT NULL,
  admins TEXT[] DEFAULT '{}',
  participants TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_groups_participants ON groups USING GIN (participants);

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "groups_participant_access" ON groups;
CREATE POLICY "groups_participant_access" ON groups
  FOR ALL TO authenticated
  USING (auth.uid()::text = ANY(participants))
  WITH CHECK (auth.uid()::text = ANY(participants));

-- ============================================================
-- 22. BROADCAST LISTS
-- ============================================================
CREATE TABLE IF NOT EXISTS broadcast_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  recipient_ids TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE broadcast_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "broadcast_lists_own" ON broadcast_lists;
CREATE POLICY "broadcast_lists_own" ON broadcast_lists
  FOR ALL TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- ============================================================
-- 23. USER REPORTS
-- ============================================================
CREATE TABLE IF NOT EXISTS user_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id TEXT NOT NULL,
  reported_id TEXT NOT NULL,
  reason TEXT,
  details TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_reports_insert" ON user_reports;
CREATE POLICY "user_reports_insert" ON user_reports
  FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = reporter_id);

DROP POLICY IF EXISTS "user_reports_select_own" ON user_reports;
CREATE POLICY "user_reports_select_own" ON user_reports
  FOR SELECT TO authenticated USING (auth.uid()::text = reporter_id);

-- ============================================================
-- 24. BOOKMARKS
-- ============================================================
CREATE TABLE IF NOT EXISTS bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  post_id UUID,
  reel_id UUID,
  collection_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON bookmarks (user_id);

ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bookmarks_own" ON bookmarks;
CREATE POLICY "bookmarks_own" ON bookmarks
  FOR ALL TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- ============================================================
-- 25. HASHTAGS
-- ============================================================
CREATE TABLE IF NOT EXISTS hashtags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag TEXT UNIQUE NOT NULL,
  post_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE hashtags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hashtags_all" ON hashtags;
CREATE POLICY "hashtags_all" ON hashtags
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 26. REPORTS (content moderation — AdminPage)
-- ============================================================
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id TEXT NOT NULL,
  reported_id TEXT NOT NULL,
  reason TEXT,
  details TEXT,
  status TEXT DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  action_taken TEXT,
  content_id TEXT,
  content_type TEXT,
  severity TEXT,
  post_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports (reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_reported ON reports (reported_id);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports (created_at DESC);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reports_admin_all" ON reports;
CREATE POLICY "reports_admin_all" ON reports
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid()::text AND users.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid()::text AND users.is_admin = true));

DROP POLICY IF EXISTS "reports_insert_any_auth" ON reports;
CREATE POLICY "reports_insert_any_auth" ON reports
  FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = reporter_id);

DROP POLICY IF EXISTS "reports_select_own" ON reports;
CREATE POLICY "reports_select_own" ON reports
  FOR SELECT TO authenticated USING (auth.uid()::text = reporter_id);

-- ============================================================
-- 27. BOOKMARK COLLECTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS bookmark_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT DEFAULT 'Saved',
  count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookmark_collections_user ON bookmark_collections (user_id);

ALTER TABLE bookmark_collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bookmark_collections_own" ON bookmark_collections;
CREATE POLICY "bookmark_collections_own" ON bookmark_collections
  FOR ALL TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- ============================================================
-- 28. TIPS (Premium creator tipping)
-- ============================================================
CREATE TABLE IF NOT EXISTS tips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  from_user_name TEXT,
  to_user_name TEXT,
  amount NUMERIC(18,2) DEFAULT 0,
  currency TEXT DEFAULT 'coins',
  message TEXT,
  content_id TEXT,
  content_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tips_from ON tips (from_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tips_to ON tips (to_user_id, created_at DESC);

ALTER TABLE tips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tips_own" ON tips;
CREATE POLICY "tips_own" ON tips
  FOR ALL TO authenticated
  USING (auth.uid()::text = from_user_id OR auth.uid()::text = to_user_id)
  WITH CHECK (auth.uid()::text = from_user_id);

-- ============================================================
-- 29. SUBSCRIPTIONS (Premium plans)
-- ============================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan_id TEXT,
  status TEXT DEFAULT 'active',
  started_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  auto_renew BOOLEAN DEFAULT false,
  price NUMERIC(18,2) DEFAULT 0,
  currency TEXT DEFAULT 'BDT',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions (user_id, status);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions_own" ON subscriptions;
CREATE POLICY "subscriptions_own" ON subscriptions
  FOR ALL TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- ============================================================
-- 30. REFERRALS
-- ============================================================
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id TEXT NOT NULL,
  referred_id TEXT NOT NULL,
  status TEXT DEFAULT 'rewarded',
  reward_amount NUMERIC(18,2) DEFAULT 0,
  currency TEXT DEFAULT 'coins',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals (referrer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals (referred_id);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "referrals_own" ON referrals;
CREATE POLICY "referrals_own" ON referrals
  FOR ALL TO authenticated
  USING (auth.uid()::text = referrer_id OR auth.uid()::text = referred_id)
  WITH CHECK (auth.uid()::text = referrer_id);

-- ============================================================
-- 31. CREATOR SUBSCRIPTIONS (creator monetization)
-- ============================================================
CREATE TABLE IF NOT EXISTS creator_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  plan_id TEXT,
  status TEXT DEFAULT 'active',
  price NUMERIC(18,2) DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  UNIQUE (creator_id, subscriber_id)
);

CREATE INDEX IF NOT EXISTS idx_creator_subs_creator ON creator_subscriptions (creator_id);
CREATE INDEX IF NOT EXISTS idx_creator_subs_subscriber ON creator_subscriptions (subscriber_id);

ALTER TABLE creator_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "creator_subs_own" ON creator_subscriptions;
CREATE POLICY "creator_subs_own" ON creator_subscriptions
  FOR ALL TO authenticated
  USING (auth.uid()::text = creator_id OR auth.uid()::text = subscriber_id)
  WITH CHECK (auth.uid()::text = subscriber_id);

-- ============================================================
-- 31b. NOTIFICATION TRIGGERS
-- ============================================================
-- Auto-create a real-time notification when a friend request is sent.
-- Uses SECURITY DEFINER so the recipient gets a notification even though
-- the sender cannot insert rows on the recipient's behalf via RLS.
CREATE OR REPLACE FUNCTION notify_on_friend_request()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  sender_name TEXT;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    SELECT COALESCE(name, display_name, split_part(COALESCE(email, NEW.from_user_id), '@', 1), 'Someone')
      INTO sender_name FROM users WHERE id = NEW.from_user_id;
    INSERT INTO notifications (user_id, type, title, body, read, data, created_at, timestamp)
    VALUES (
      NEW.to_user_id,
      'friend_request',
      'New Friend Request',
      COALESCE(sender_name, 'Someone') || ' wants to be your friend',
      false,
      jsonb_build_object('fromUserId', NEW.from_user_id, 'senderName', COALESCE(sender_name, 'Someone')),
      now(),
      now()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_friend_request_created ON friend_requests;
CREATE TRIGGER on_friend_request_created
  AFTER INSERT ON friend_requests
  FOR EACH ROW EXECUTE FUNCTION notify_on_friend_request();

-- ─── Incoming-call notification trigger ────────────────────────
-- When a call is created with status 'calling', insert a notification row for
-- the callee so a backgrounded/foreground user gets a real-time ring via the
-- notifications realtime channel (and optionally a push notification from the
-- client-side push service that tails the notifications table).
CREATE OR REPLACE FUNCTION notify_on_call()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  caller_name TEXT;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'calling' AND NEW.caller_id IS DISTINCT FROM NEW.callee_id THEN
    SELECT COALESCE(name, display_name, split_part(COALESCE(email, NEW.caller_id), '@', 1), 'Someone')
      INTO caller_name FROM users WHERE id = NEW.caller_id;
    INSERT INTO notifications (user_id, type, title, body, read, data, created_at, timestamp)
    VALUES (
      NEW.callee_id,
      'call',
      'Incoming Call',
      COALESCE(caller_name, 'Someone') || ' is calling you',
      false,
      jsonb_build_object('callId', NEW.id::text, 'fromUserId', NEW.caller_id, 'callerName', COALESCE(caller_name, 'Someone'), 'callType', NEW.type),
      now(),
      now()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_call_created ON call_history;
CREATE TRIGGER on_call_created
  AFTER INSERT ON call_history
  FOR EACH ROW EXECUTE FUNCTION notify_on_call();

-- ─── Missed-call trigger ───────────────────────────────────────
-- When a call transitions away from 'calling' without being answered, mark it
-- as 'missed' server-side so the call shows up in both parties' history as a
-- missed call even if the callee never opened the app.
CREATE OR REPLACE FUNCTION mark_missed_call()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Fire ~45s after a call is created if it's still 'calling' (never answered).
  PERFORM pg_sleep(45);
  UPDATE call_history
    SET status = 'missed', ended_at = COALESCE(ended_at, now())
    WHERE id = OLD.id AND status = 'calling';
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_call_missed ON call_history;
CREATE TRIGGER on_call_missed
  AFTER INSERT ON call_history
  FOR EACH ROW
  WHEN (NEW.status = 'calling')
  EXECUTE PROCEDURE mark_missed_call();

-- ============================================================
-- 32. AUTO-UPDATE TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS chats_updated_at ON chats;
CREATE TRIGGER chats_updated_at
  BEFORE UPDATE ON chats FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS messages_updated_at ON messages;
CREATE TRIGGER messages_updated_at
  BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 27. RPCs
-- ============================================================

-- Append ICE candidate atomically (used by WebRTC 1:1 calls)
CREATE OR REPLACE FUNCTION append_ice_candidate(
  p_call_id TEXT,
  p_field TEXT,
  p_candidate JSONB
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  EXECUTE format(
    'UPDATE call_signaling SET %I = COALESCE(%I, ''[]''::jsonb) || $1, updated_at = now() WHERE call_id = $2',
    p_field, p_field
  ) USING p_candidate::jsonb, p_call_id;
END;
$$;

-- Delete own account
CREATE OR REPLACE FUNCTION delete_user()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

-- ============================================================
-- 28. ENABLE REALTIME
-- ============================================================
DO $$
DECLARE
  tbl TEXT;
tables TEXT[] := ARRAY[
    'messages','chats','typing','presence','notifications',
    'posts','reels','stories','comments',
    'friend_requests','friendships',
    'call_signaling','live_stream_signals','voice_room_signals',
    'live_streams','voice_rooms','call_history','groups','users',
    'reports','bookmark_collections','tips','subscriptions','referrals','creator_subscriptions'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', tbl);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

-- ============================================================
-- DONE
-- ============================================================
-- Single master file — replaces supabase_migration.sql,
-- supabase_fix_rls.sql, and supabase_patch.sql.
-- Safe to re-run (fully idempotent).
-- ============================================================
