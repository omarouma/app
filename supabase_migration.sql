-- ============================================
-- GaGa Chat Supabase Schema Migration
-- Run this in your Supabase SQL Editor
-- https://app.supabase.com/project/xqeriudcoozuvcmzniow
-- ============================================

-- ============================================
-- USERS TABLE
-- ============================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status text DEFAULT 'offline';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS latitude numeric;
ALTER TABLE users ADD COLUMN IF NOT EXISTS longitude numeric;
ALTER TABLE users ADD COLUMN IF NOT EXISTS coins integer DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bdt_balance numeric DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS friends text[] DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS followers text[] DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS following text[] DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_users text[] DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS favorites text[] DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS hide_online_status boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS hide_friend_list boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS friend_request_privacy text DEFAULT 'everyone';
ALTER TABLE users ADD COLUMN IF NOT EXISTS group_add_privacy text DEFAULT 'everyone';
ALTER TABLE users ADD COLUMN IF NOT EXISTS close_friends text[] DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS disappearing_messages_default integer DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS chat_locks jsonb DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS broadcast_lists text[] DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS achievements text[] DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_days integer DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_count integer DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_premium boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_expires_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cover_image text;

-- ============================================
-- CHATS TABLE
-- ============================================
ALTER TABLE chats ADD COLUMN IF NOT EXISTS last_message text;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS unread_count integer DEFAULT 0;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS is_muted boolean DEFAULT false;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS admins text[] DEFAULT '{}';
ALTER TABLE chats ADD COLUMN IF NOT EXISTS disappearing_messages integer DEFAULT 0;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS chat_locked boolean DEFAULT false;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS lock_type text;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS lock_value text;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS archived boolean DEFAULT false;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS pinned_messages jsonb DEFAULT '[]';
ALTER TABLE chats ADD COLUMN IF NOT EXISTS description text;

-- ============================================
-- MESSAGES TABLE
-- ============================================
ALTER TABLE messages ADD COLUMN IF NOT EXISTS contact_card jsonb;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS disappearing_timer integer DEFAULT 0;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS disappearing_initiated_at timestamptz;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS destroyed boolean DEFAULT false;

-- ============================================
-- POSTS TABLE
-- ============================================
ALTER TABLE posts ADD COLUMN IF NOT EXISTS images text[] DEFAULT '{}';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS likes text[] DEFAULT '{}';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS comments jsonb DEFAULT '[]';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS shares text[] DEFAULT '{}';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS user_name text;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS user_avatar text;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS poll_data jsonb;

-- ============================================
-- STORIES TABLE
-- ============================================
ALTER TABLE stories ADD COLUMN IF NOT EXISTS viewed_by text[] DEFAULT '{}';
ALTER TABLE stories ADD COLUMN IF NOT EXISTS user_name text;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS user_avatar text;

-- ============================================
-- REELS TABLE
-- ============================================
ALTER TABLE reels ADD COLUMN IF NOT EXISTS music_title text;
ALTER TABLE reels ADD COLUMN IF NOT EXISTS music_url text;
ALTER TABLE reels ADD COLUMN IF NOT EXISTS filters text[] DEFAULT '{}';
ALTER TABLE reels ADD COLUMN IF NOT EXISTS effects text[] DEFAULT '{}';
ALTER TABLE reels ADD COLUMN IF NOT EXISTS speed numeric;
ALTER TABLE reels ADD COLUMN IF NOT EXISTS voiceover text;
ALTER TABLE reels ADD COLUMN IF NOT EXISTS captions text;
ALTER TABLE reels ADD COLUMN IF NOT EXISTS duration integer DEFAULT 0;
ALTER TABLE reels ADD COLUMN IF NOT EXISTS likes text[] DEFAULT '{}';
ALTER TABLE reels ADD COLUMN IF NOT EXISTS comments jsonb DEFAULT '[]';
ALTER TABLE reels ADD COLUMN IF NOT EXISTS shares text[] DEFAULT '{}';
ALTER TABLE reels ADD COLUMN IF NOT EXISTS saved_by text[] DEFAULT '{}';
ALTER TABLE reels ADD COLUMN IF NOT EXISTS viewed_by text[] DEFAULT '{}';
ALTER TABLE reels ADD COLUMN IF NOT EXISTS user_name text;
ALTER TABLE reels ADD COLUMN IF NOT EXISTS user_avatar text;
ALTER TABLE reels ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE reels ADD COLUMN IF NOT EXISTS mentions text[] DEFAULT '{}';
ALTER TABLE reels ADD COLUMN IF NOT EXISTS remix_of text;
ALTER TABLE reels ADD COLUMN IF NOT EXISTS duet_with text;
ALTER TABLE reels ADD COLUMN IF NOT EXISTS template text;
ALTER TABLE reels ADD COLUMN IF NOT EXISTS view_count integer DEFAULT 0;
ALTER TABLE reels ADD COLUMN IF NOT EXISTS reactions jsonb;

-- ============================================
-- BLOCKED USERS TABLE
-- ============================================
ALTER TABLE blocked_users ADD COLUMN IF NOT EXISTS reason text;

-- ============================================
-- CALL HISTORY TABLE
-- ============================================
ALTER TABLE call_history ADD COLUMN IF NOT EXISTS ended_at timestamptz;

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_name ON users(name);
CREATE INDEX IF NOT EXISTS idx_chats_participants ON chats USING gin(participants);
CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON chats(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_friend_requests_from ON friend_requests(from_user_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests(to_user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_user_id ON stories(user_id);
CREATE INDEX IF NOT EXISTS idx_reels_user_id ON reels(user_id);
CREATE INDEX IF NOT EXISTS idx_reels_created_at ON reels(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON blocked_users(blocker_id);
CREATE INDEX IF NOT EXISTS idx_call_history_caller ON call_history(caller);
CREATE INDEX IF NOT EXISTS idx_call_history_callee ON call_history(callee);
CREATE INDEX IF NOT EXISTS idx_users_latitude ON users(latitude) WHERE latitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_longitude ON users(longitude) WHERE longitude IS NOT NULL;

-- ============================================
-- DONE
-- ============================================
