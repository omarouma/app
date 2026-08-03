-- ============================================================
-- GaGa Chat — RLS & Schema Fix (run in Supabase SQL Editor)
-- ============================================================
-- Fixes the following broken features:
--   1. Create Post  → posts table RLS blocked INSERT
--   2. Reels posting → reels table RLS blocked INSERT
--   3. Story upload  → stories table RLS blocked INSERT
--   4. Reel Comments → comments table did not exist
--
-- This is safe to run multiple times (idempotent).
-- NOTE: This is PostgreSQL syntax — run it in the Supabase SQL
-- Editor (NOT in a SQL Server / T-SQL tool).
-- ============================================================

-- ─── 1. POSTS: enable RLS + allow authenticated users to insert/update their own ──
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "posts_select_all" ON posts;
CREATE POLICY "posts_select_all" ON posts
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "posts_insert_own" ON posts;
CREATE POLICY "posts_insert_own" ON posts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "posts_update_own" ON posts;
CREATE POLICY "posts_update_own" ON posts
  FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = user_id::text)
  WITH CHECK (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "posts_delete_own" ON posts;
CREATE POLICY "posts_delete_own" ON posts
  FOR DELETE
  TO authenticated
  USING (auth.uid()::text = user_id::text);

-- ─── 2. REELS: enable RLS + allow authenticated users to insert/update their own ──
ALTER TABLE reels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reels_select_all" ON reels;
CREATE POLICY "reels_select_all" ON reels
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "reels_insert_own" ON reels;
CREATE POLICY "reels_insert_own" ON reels
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "reels_update_own" ON reels;
CREATE POLICY "reels_update_own" ON reels
  FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = user_id::text)
  WITH CHECK (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "reels_delete_own" ON reels;
CREATE POLICY "reels_delete_own" ON reels
  FOR DELETE
  TO authenticated
  USING (auth.uid()::text = user_id::text);

-- ─── 3. STORIES: enable RLS + allow authenticated users to insert/update their own ──
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stories_select_all" ON stories;
CREATE POLICY "stories_select_all" ON stories
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "stories_insert_own" ON stories;
CREATE POLICY "stories_insert_own" ON stories
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "stories_update_own" ON stories;
CREATE POLICY "stories_update_own" ON stories
  FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = user_id::text)
  WITH CHECK (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "stories_delete_own" ON stories;
CREATE POLICY "stories_delete_own" ON stories
  FOR DELETE
  TO authenticated
  USING (auth.uid()::text = user_id::text);

-- ─── 4. COMMENTS: create table if missing (used for reel comments) ──
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id UUID,
  post_id UUID,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  user_name TEXT,
  user_avatar TEXT,
  likes TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_reel_id ON comments (reel_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments (post_id, created_at);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comments_select_all" ON comments;
CREATE POLICY "comments_select_all" ON comments
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "comments_insert_own" ON comments;
CREATE POLICY "comments_insert_own" ON comments
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "comments_delete_own" ON comments;
CREATE POLICY "comments_delete_own" ON comments
  FOR DELETE
  TO authenticated
  USING (auth.uid()::text = user_id::text);

-- ─── 5. USERS: ensure ownership update policy (avatar upload) ──
-- (UPDATE was already allowed, but make it explicit and safe.)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_authenticated" ON users;
CREATE POLICY "users_select_authenticated" ON users
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "users_update_own" ON users;
CREATE POLICY "users_update_own" ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = id::text)
  WITH CHECK (auth.uid()::text = id::text);

-- ─── 6. Enable realtime for posts/reels/stories/comments (live feed) ──
ALTER PUBLICATION supabase_realtime ADD TABLE posts;
ALTER PUBLICATION supabase_realtime ADD TABLE reels;
ALTER PUBLICATION supabase_realtime ADD TABLE stories;
ALTER PUBLICATION supabase_realtime ADD TABLE comments;

-- ============================================================
-- Done. Verify by creating a post in the app.
-- ============================================================
