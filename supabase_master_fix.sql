-- ============================================================
-- GaGa Chat — MASTER FIX MIGRATION (idempotent, safe to re-run)
-- Project: alzwgikndwbecuqmlrca
--
-- Addresses the Supabase Dashboard advisor findings in one pass:
--   SECURITY  — rls_disabled_in_public, function_search_path_mutable,
--               extension_in_public
--   PERF      — unindexed_foreign_keys, auth_rls_initplan
--   REALTIME  — tables missing from the supabase_realtime publication
--   STORAGE   — buckets + RLS policies for chat media
--   AUTH      — robust handle_new_user trigger
--   SCHEMA    — push_subscription, posts media columns
--
-- How to run: Supabase Dashboard → SQL Editor → paste → Run.
-- Everything here is idempotent — run it as many times as you like.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. ROW LEVEL SECURITY — enable on EVERY public table
--    (fixes: rls_disabled_in_public errors)
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────
-- 2. FUNCTION SEARCH PATH — pin search_path on all public functions
--    (fixes: function_search_path_mutable warnings)
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  f RECORD;
BEGIN
  FOR f IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    BEGIN
      EXECUTE format(
        'ALTER FUNCTION public.%I(%s) SET search_path = public, pg_catalog, pg_temp',
        f.proname, f.args
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'search_path skip %: %', f.proname, SQLERRM;
    END;
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────
-- 3. EXTENSIONS SCHEMA — move extensions out of public
--    (fixes: extension_in_public warnings)
-- ────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS extensions;
DO $$
DECLARE
  e RECORD;
BEGIN
  FOR e IN
    SELECT extname FROM pg_extension
    WHERE extnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      AND extname NOT IN ('plpgsql')
  LOOP
    BEGIN
      EXECUTE format('ALTER EXTENSION %I SET SCHEMA extensions', e.extname);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'extension move skip %: %', e.extname, SQLERRM;
    END;
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────
-- 4. FOREIGN KEY INDEXES
--    (fixes: unindexed_foreign_keys performance warnings)
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_messages_chat_id        ON messages (chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id      ON messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at     ON messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chats_participants      ON chats USING GIN (participants);
CREATE INDEX IF NOT EXISTS idx_chats_updated_at        ON chats (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post_id        ON comments (post_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id        ON comments (user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id       ON bookmarks (user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_post_id       ON bookmarks (post_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_collection_id ON bookmarks (collection_id);
CREATE INDEX IF NOT EXISTS idx_bookmark_collections_user_id ON bookmark_collections (user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_user_id     ON friendships (user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend_id   ON friendships (friend_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_from    ON friend_requests (from_user_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_to      ON friend_requests (to_user_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker   ON blocked_users (blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked   ON blocked_users (blocked_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id   ON notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created   ON notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user_id           ON posts (user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at        ON posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_user_id         ON stories (user_id);
CREATE INDEX IF NOT EXISTS idx_stories_created_at      ON stories (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reels_user_id           ON reels (user_id);
CREATE INDEX IF NOT EXISTS idx_reels_created_at        ON reels (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_streams_user_id    ON live_streams (user_id);
CREATE INDEX IF NOT EXISTS idx_call_history_caller     ON call_history (caller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_history_callee     ON call_history (callee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_history_status     ON call_history (status);
CREATE INDEX IF NOT EXISTS idx_tips_from_user          ON tips (from_user_id);
CREATE INDEX IF NOT EXISTS idx_tips_to_user            ON tips (to_user_id);
CREATE INDEX IF NOT EXISTS idx_wallets_user_id         ON wallets (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id   ON subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer      ON referrals (referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred      ON referrals (referred_id);
CREATE INDEX IF NOT EXISTS idx_creator_subs_creator    ON creator_subscriptions (creator_id);
CREATE INDEX IF NOT EXISTS idx_creator_subs_subscriber ON creator_subscriptions (subscriber_id);
CREATE INDEX IF NOT EXISTS idx_reports_reporter        ON reports (reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_reported        ON reports (reported_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_reporter   ON user_reports (reporter_id);
CREATE INDEX IF NOT EXISTS idx_groups_creator_id       ON groups (creator_id);
CREATE INDEX IF NOT EXISTS idx_groups_participants     ON groups USING GIN (participants);
CREATE INDEX IF NOT EXISTS idx_presence_user_id        ON presence (user_id);
CREATE INDEX IF NOT EXISTS idx_typing_chat_id          ON typing (chat_id);
CREATE INDEX IF NOT EXISTS idx_hashtags_tag            ON hashtags (tag);
CREATE INDEX IF NOT EXISTS idx_voice_rooms_creator_id  ON voice_rooms (creator_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_lists_user    ON broadcast_lists (user_id);
CREATE INDEX IF NOT EXISTS idx_users_push_subscription ON users (push_subscription) WHERE push_subscription IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 5. AUTH INITPLAN — rewrite hot-path RLS policies so auth.uid()
--    is evaluated once per query instead of once per row
--    (fixes: auth_rls_initplan performance warnings)
-- ────────────────────────────────────────────────────────────

-- messages: granular policies (also fixes the 403 "mark as read" bug)
DROP POLICY IF EXISTS "messages_chat_participant" ON messages;
DROP POLICY IF EXISTS "messages_participant_select" ON messages;
CREATE POLICY "messages_participant_select" ON messages
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM chats
    WHERE chats.id = messages.chat_id
      AND (select auth.uid())::text = ANY(chats.participants)
  )
);

DROP POLICY IF EXISTS "messages_participant_insert" ON messages;
CREATE POLICY "messages_participant_insert" ON messages
FOR INSERT TO authenticated
WITH CHECK (
  (select auth.uid())::text = sender_id
  AND EXISTS (
    SELECT 1 FROM chats
    WHERE chats.id = messages.chat_id
      AND (select auth.uid())::text = ANY(chats.participants)
  )
);

DROP POLICY IF EXISTS "messages_sender_update" ON messages;
CREATE POLICY "messages_sender_update" ON messages
FOR UPDATE TO authenticated
USING ((select auth.uid())::text = sender_id)
WITH CHECK (
  (select auth.uid())::text = sender_id
  AND NEW.chat_id IS NOT DISTINCT FROM OLD.chat_id
  AND NEW.sender_id IS NOT DISTINCT FROM OLD.sender_id
  AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
);

DROP POLICY IF EXISTS "messages_recipient_read_update" ON messages;
CREATE POLICY "messages_recipient_read_update" ON messages
FOR UPDATE TO authenticated
USING (
  (select auth.uid())::text <> sender_id
  AND EXISTS (
    SELECT 1 FROM chats
    WHERE chats.id = messages.chat_id
      AND (select auth.uid())::text = ANY(chats.participants)
  )
)
WITH CHECK (
  (select auth.uid())::text <> sender_id
  AND NEW.chat_id IS NOT DISTINCT FROM OLD.chat_id
  AND NEW.sender_id IS NOT DISTINCT FROM OLD.sender_id
  AND NEW.content IS NOT DISTINCT FROM OLD.content
  AND NEW.type IS NOT DISTINCT FROM OLD.type
  AND NEW.media_url IS NOT DISTINCT FROM OLD.media_url
  AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
);

DROP POLICY IF EXISTS "messages_sender_delete" ON messages;
CREATE POLICY "messages_sender_delete" ON messages
FOR DELETE TO authenticated
USING ((select auth.uid())::text = sender_id);

-- chats: participants can read/update their chats
DROP POLICY IF EXISTS "chats_participant_all" ON chats;
DROP POLICY IF EXISTS "chats_participant_select" ON chats;
CREATE POLICY "chats_participant_select" ON chats
FOR SELECT TO authenticated
USING ((select auth.uid())::text = ANY(participants));

DROP POLICY IF EXISTS "chats_participant_insert" ON chats;
CREATE POLICY "chats_participant_insert" ON chats
FOR INSERT TO authenticated
WITH CHECK ((select auth.uid())::text = ANY(participants));

DROP POLICY IF EXISTS "chats_participant_update" ON chats;
CREATE POLICY "chats_participant_update" ON chats
FOR UPDATE TO authenticated
USING ((select auth.uid())::text = ANY(participants))
WITH CHECK ((select auth.uid())::text = ANY(participants));

-- call_history: caller + callee access
ALTER TABLE call_history ADD COLUMN IF NOT EXISTS participant_ids TEXT[] DEFAULT '{}';

DROP POLICY IF EXISTS "call_history_own" ON call_history;
DROP POLICY IF EXISTS "call_history_participant_select" ON call_history;
CREATE POLICY "call_history_participant_select" ON call_history
FOR SELECT TO authenticated
USING (
  (select auth.uid())::text = caller_id
  OR (select auth.uid())::text = callee_id
  OR (select auth.uid())::text = ANY(COALESCE(participant_ids, '{}'))
);

DROP POLICY IF EXISTS "call_history_caller_insert" ON call_history;
CREATE POLICY "call_history_caller_insert" ON call_history
FOR INSERT TO authenticated
WITH CHECK ((select auth.uid())::text = caller_id);

DROP POLICY IF EXISTS "call_history_participant_update" ON call_history;
CREATE POLICY "call_history_participant_update" ON call_history
FOR UPDATE TO authenticated
USING (
  (select auth.uid())::text = caller_id
  OR (select auth.uid())::text = callee_id
  OR (select auth.uid())::text = ANY(COALESCE(participant_ids, '{}'))
);

DROP POLICY IF EXISTS "call_history_participant_delete" ON call_history;
CREATE POLICY "call_history_participant_delete" ON call_history
FOR DELETE TO authenticated
USING (
  (select auth.uid())::text = caller_id
  OR (select auth.uid())::text = callee_id
);

-- users: anyone signed in can read profiles; only owner can write
DROP POLICY IF EXISTS "users_select_all" ON users;
CREATE POLICY "users_select_all" ON users
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "users_owner_insert" ON users;
CREATE POLICY "users_owner_insert" ON users
FOR INSERT TO authenticated
WITH CHECK ((select auth.uid())::text = id);

DROP POLICY IF EXISTS "users_owner_update" ON users;
CREATE POLICY "users_owner_update" ON users
FOR UPDATE TO authenticated
USING ((select auth.uid())::text = id)
WITH CHECK ((select auth.uid())::text = id);

-- presence / typing: read by all signed-in users, write own row
DROP POLICY IF EXISTS "presence_select_all" ON presence;
CREATE POLICY "presence_select_all" ON presence
FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "presence_owner_write" ON presence;
CREATE POLICY "presence_owner_write" ON presence
FOR ALL TO authenticated
USING ((select auth.uid())::text = user_id)
WITH CHECK ((select auth.uid())::text = user_id);

DROP POLICY IF EXISTS "typing_select_all" ON typing;
CREATE POLICY "typing_select_all" ON typing
FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "typing_owner_write" ON typing;
CREATE POLICY "typing_owner_write" ON typing
FOR ALL TO authenticated
USING ((select auth.uid())::text = user_id)
WITH CHECK ((select auth.uid())::text = user_id);

-- notifications: owner only
DROP POLICY IF EXISTS "notifications_owner_all" ON notifications;
CREATE POLICY "notifications_owner_all" ON notifications
FOR ALL TO authenticated
USING ((select auth.uid())::text = user_id)
WITH CHECK ((select auth.uid())::text = user_id);

-- ────────────────────────────────────────────────────────────
-- 6. AUTH TRIGGER — robust new-user profile creation
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
  meta_name TEXT;
BEGIN
  meta_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'name', ''),
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    split_part(NEW.email, '@', 1)
  );
  BEGIN
    INSERT INTO public.users (id, email, name, display_name, created_at, updated_at)
    VALUES (NEW.id::text, NEW.email, meta_name, meta_name, now(), now())
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'handle_new_user: profile insert skipped (%): %', SQLERRM, NEW.email;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ────────────────────────────────────────────────────────────
-- 7. SCHEMA PATCHES — columns the app expects
-- ────────────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS push_subscription TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_type TEXT DEFAULT 'text';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS poll_data JSONB;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS hashtags TEXT[] DEFAULT '{}';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS content_warning TEXT;

-- ────────────────────────────────────────────────────────────
-- 8. REALTIME — publish hot tables for live updates
--    (fixes: realtime not streaming chats/calls/presence)
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
  realtime_tables TEXT[] := ARRAY[
    'messages', 'chats', 'call_history', 'presence', 'typing',
    'notifications', 'friend_requests', 'friendships', 'posts',
    'comments', 'stories', 'groups', 'voice_rooms', 'live_streams'
  ];
BEGIN
  FOREACH t IN ARRAY realtime_tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t)
       AND NOT EXISTS (
         SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime'
           AND schemaname = 'public' AND tablename = t
       )
    THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- Replica identity for realtime UPDATE/DELETE payloads
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t.tablename);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'replica identity skip %: %', t.tablename, SQLERRM;
    END;
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────
-- 9. STORAGE — buckets + RLS policies for chat media
--    (fixes: storage advisor warnings)
-- ────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('chat-media', 'chat-media', true),
  ('avatars', 'avatars', true),
  ('posts', 'posts', true),
  ('stories', 'stories', true),
  ('reels', 'reels', true),
  ('voice-messages', 'voice-messages', true)
ON CONFLICT (id) DO NOTHING;

-- Public read on the media buckets
DROP POLICY IF EXISTS "storage_public_read" ON storage.objects;
CREATE POLICY "storage_public_read" ON storage.objects
FOR SELECT TO public
USING (bucket_id IN ('chat-media', 'avatars', 'posts', 'stories', 'reels', 'voice-messages'));

-- Signed-in users can upload to the media buckets
DROP POLICY IF EXISTS "storage_authenticated_insert" ON storage.objects;
CREATE POLICY "storage_authenticated_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id IN ('chat-media', 'avatars', 'posts', 'stories', 'reels', 'voice-messages'));

-- Owners can update/delete their own objects
DROP POLICY IF EXISTS "storage_owner_update" ON storage.objects;
CREATE POLICY "storage_owner_update" ON storage.objects
FOR UPDATE TO authenticated
USING (owner = (select auth.uid()))
WITH CHECK (owner = (select auth.uid()));

DROP POLICY IF EXISTS "storage_owner_delete" ON storage.objects;
CREATE POLICY "storage_owner_delete" ON storage.objects
FOR DELETE TO authenticated
USING (owner = (select auth.uid()));

COMMIT;

-- ============================================================
-- DASHBOARD-ONLY ITEMS (cannot be done via SQL):
--
--   AUTH WARN "leaked password protection":
--     Dashboard → Authentication → Settings → enable
--     "Leaked password protection" (HaveIBeenPwned).
--
--   AUTH email delivery errors:
--     Dashboard → Authentication → SMTP Settings → configure a
--     real SMTP provider (Resend/SendGrid/SES), OR turn OFF
--     "Confirm email" under Providers → Email for instant signup.
--
--   API GATEWAY errors:
--     Usually resolved by the RLS fixes above (403s) plus the
--     missing-column patches (400s). Re-check Logs → API Gateway
--     after running this script.
-- ============================================================
