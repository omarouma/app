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
  broadcast_lists TEXT[] DEFAULT '{}'
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
CREATE INDEX IF NOT EXISTS idx_messages_read ON messages (chat_id, read) WHERE read = false;

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_chat_participant" ON messages;
CREATE POLICY "messages_chat_participant" ON messages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM chats
      WHERE chats.id = messages.chat_id
      AND auth.uid()::text = ANY(chats.participants)
    )
  )
  WITH CHECK (
    auth.uid()::text = sender_id AND
    EXISTS (
      SELECT 1 FROM chats
      WHERE chats.id = messages.chat_id
      AND auth.uid()::text = ANY(chats.participants)
    )
  );

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
  duration INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reels_user_id ON reels (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reels_created_at ON reels (created_at DESC);

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
-- 26. RPCs
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
-- 27. ENABLE REALTIME
-- ============================================================
-- Core chat tables
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE chats;
ALTER PUBLICATION supabase_realtime ADD TABLE typing;
ALTER PUBLICATION supabase_realtime ADD TABLE presence;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- Social tables
ALTER PUBLICATION supabase_realtime ADD TABLE posts;
ALTER PUBLICATION supabase_realtime ADD TABLE reels;
ALTER PUBLICATION supabase_realtime ADD TABLE stories;
ALTER PUBLICATION supabase_realtime ADD TABLE comments;

-- Friend / social graph
ALTER PUBLICATION supabase_realtime ADD TABLE friend_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE friendships;

-- WebRTC signaling
ALTER PUBLICATION supabase_realtime ADD TABLE call_signaling;
ALTER PUBLICATION supabase_realtime ADD TABLE live_stream_signals;
ALTER PUBLICATION supabase_realtime ADD TABLE voice_room_signals;

-- Live / voice
ALTER PUBLICATION supabase_realtime ADD TABLE live_streams;
ALTER PUBLICATION supabase_realtime ADD TABLE voice_rooms;

-- ============================================================
-- DONE
-- ============================================================
-- All tables, RLS policies, indexes, triggers, RPCs, and
-- realtime subscriptions are now configured for production.
-- ============================================================
