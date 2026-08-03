-- ============================================================
-- GaGa Chat — Supplemental Production Patch
-- Run AFTER supabase_full_setup.sql
-- Project: alzwgikndwbecuqmlrca
-- ============================================================

-- ─── Add push_subscription column to users ────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS push_subscription TEXT;

-- ─── Add missing indexes for common query patterns ────────────

-- Posts: orderBy createdAt (used by timeline)
CREATE INDEX IF NOT EXISTS idx_posts_created_at_desc ON posts (created_at DESC);

-- Stories: orderBy createdAt
CREATE INDEX IF NOT EXISTS idx_stories_created_at_desc ON stories (created_at DESC);

-- Reels: orderBy viewCount (trending)
CREATE INDEX IF NOT EXISTS idx_reels_view_count ON reels (view_count DESC);

-- Reels: tags array-contains
CREATE INDEX IF NOT EXISTS idx_reels_tags ON reels USING GIN (tags);

-- Reels: category filter
CREATE INDEX IF NOT EXISTS idx_reels_category ON reels (category, created_at DESC);

-- Notifications: timestamp orderBy
CREATE INDEX IF NOT EXISTS idx_notifications_timestamp ON notifications (user_id, timestamp DESC);

-- Friend requests: composite for status checks
CREATE INDEX IF NOT EXISTS idx_friend_requests_status ON friend_requests (from_user_id, to_user_id, status);

-- Friendships: friend_id lookup
CREATE INDEX IF NOT EXISTS idx_friendships_friend_id ON friendships (friend_id);

-- Call history: callee lookup
CREATE INDEX IF NOT EXISTS idx_call_history_callee_created ON call_history (callee_id, created_at DESC);

-- Messages: unread per chat
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages (chat_id, read, created_at DESC) WHERE read = false;

-- ─── Ensure realtime is enabled for all tables ────────────────
-- (safe to run even if already added)
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'messages','chats','typing','presence','notifications',
    'posts','reels','stories','comments',
    'friend_requests','friendships',
    'call_signaling','live_stream_signals','voice_room_signals',
    'live_streams','voice_rooms','users'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', tbl);
    EXCEPTION WHEN duplicate_object THEN
      -- already in publication, skip
    END;
  END LOOP;
END $$;

-- ─── Auto-update updated_at on users ──────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS chats_updated_at ON chats;
CREATE TRIGGER chats_updated_at
  BEFORE UPDATE ON chats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS messages_updated_at ON messages;
CREATE TRIGGER messages_updated_at
  BEFORE UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Cleanup: auto-delete expired stories (optional cron) ─────
-- Run this manually or set up a pg_cron job:
-- SELECT cron.schedule('delete-expired-stories', '0 * * * *',
--   'DELETE FROM stories WHERE expires_at < now()');

-- ─── Cleanup: auto-delete old signaling rows (> 1 hour) ───────
-- SELECT cron.schedule('delete-old-signals', '*/30 * * * *',
--   'DELETE FROM call_signaling WHERE created_at < now() - INTERVAL ''1 hour'';
--    DELETE FROM live_stream_signals WHERE created_at < now() - INTERVAL ''1 hour'';
--    DELETE FROM voice_room_signals WHERE created_at < now() - INTERVAL ''1 hour'';');

-- ============================================================
-- DONE — Patch applied successfully
-- ============================================================
