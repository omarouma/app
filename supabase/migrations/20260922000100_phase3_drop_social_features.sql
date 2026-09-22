-- ============================================================================
-- Phase 3: Remove Social Features + Professional Messaging-First Rebuild
-- ----------------------------------------------------------------------------
-- GaGa Chat is now a focused messaging + voice/video calling application.
-- This migration removes all social-feed tables, policies, storage buckets and
-- related objects, then adds messaging/call indexes and tightens RLS.
--
-- Safe to run multiple times (all statements are idempotent / IF EXISTS).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Drop social-feed tables (CASCADE removes dependent policies, indexes, FKs)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.post_views          CASCADE;
DROP TABLE IF EXISTS public.post_reactions      CASCADE;
DROP TABLE IF EXISTS public.post_comments       CASCADE;
DROP TABLE IF EXISTS public.comments            CASCADE;
DROP TABLE IF EXISTS public.posts               CASCADE;
DROP TABLE IF EXISTS public.stories             CASCADE;
DROP TABLE IF EXISTS public.story_highlights    CASCADE;
DROP TABLE IF EXISTS public.story_viewers       CASCADE;
DROP TABLE IF EXISTS public.reels               CASCADE;
DROP TABLE IF EXISTS public.reel_comments       CASCADE;
DROP TABLE IF EXISTS public.live_stream_signals CASCADE;
DROP TABLE IF EXISTS public.live_streams        CASCADE;
DROP TABLE IF EXISTS public.live_comments       CASCADE;
DROP TABLE IF EXISTS public.live_gifts          CASCADE;
DROP TABLE IF EXISTS public.voice_room_signals  CASCADE;
DROP TABLE IF EXISTS public.voice_rooms         CASCADE;
DROP TABLE IF EXISTS public.hashtags            CASCADE;
DROP TABLE IF EXISTS public.bookmarks           CASCADE;
DROP TABLE IF EXISTS public.bookmark_collections CASCADE;
DROP TABLE IF EXISTS public.marketplace         CASCADE;
DROP TABLE IF EXISTS public.marketplace_items   CASCADE;
DROP TABLE IF EXISTS public.marketplace_offers  CASCADE;
DROP TABLE IF EXISTS public.events              CASCADE;
DROP TABLE IF EXISTS public.achievements        CASCADE;
DROP TABLE IF EXISTS public.streaks             CASCADE;
DROP TABLE IF EXISTS public.ads                 CASCADE;
DROP TABLE IF EXISTS public.analytics           CASCADE;
DROP TABLE IF EXISTS public.creator_subscriptions CASCADE;
DROP TABLE IF EXISTS public.polls               CASCADE;
DROP TABLE IF EXISTS public.daily_challenges    CASCADE;
DROP TABLE IF EXISTS public.challenge_participations CASCADE;
DROP TABLE IF EXISTS public.referrals           CASCADE;

-- ----------------------------------------------------------------------------
-- 2. Social storage buckets
-- ----------------------------------------------------------------------------
-- NOTE: storage.objects and storage.buckets rows are protected by the
-- storage.protect_delete() trigger and MUST be removed through the Storage API
-- (done out-of-band before this migration runs). No SQL is issued here.

-- ----------------------------------------------------------------------------
-- 3. Re-create media storage policies WITHOUT the removed social buckets
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "gaga_media_upload_own_folder" ON storage.objects;
CREATE POLICY "gaga_media_upload_own_folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('chat-media', 'voice-messages', 'avatars')
    AND split_part(name, '/', 2) = auth.uid()::text
  );

DROP POLICY IF EXISTS "gaga_media_update_own_folder" ON storage.objects;
CREATE POLICY "gaga_media_update_own_folder"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('chat-media', 'voice-messages', 'avatars')
    AND split_part(name, '/', 2) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id IN ('chat-media', 'voice-messages', 'avatars')
    AND split_part(name, '/', 2) = auth.uid()::text
  );

DROP POLICY IF EXISTS "gaga_media_delete_own_folder" ON storage.objects;
CREATE POLICY "gaga_media_delete_own_folder"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id IN ('chat-media', 'voice-messages', 'avatars')
    AND split_part(name, '/', 2) = auth.uid()::text
  );

-- ----------------------------------------------------------------------------
-- 4. Messaging & calling performance indexes
-- ----------------------------------------------------------------------------
-- Messages: fast per-chat history + unread + sender lookups
CREATE INDEX IF NOT EXISTS idx_messages_chat_created
  ON public.messages (chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender
  ON public.messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat_unread
  ON public.messages (chat_id) WHERE read = false;

-- Chats: participant membership (jsonb array) + recency ordering
CREATE INDEX IF NOT EXISTS idx_chats_participants
  ON public.chats USING GIN (participants);
CREATE INDEX IF NOT EXISTS idx_chats_updated
  ON public.chats (updated_at DESC);

-- Groups: membership (jsonb array) + creator
CREATE INDEX IF NOT EXISTS idx_groups_participants
  ON public.groups USING GIN (participants);
CREATE INDEX IF NOT EXISTS idx_groups_created_by
  ON public.groups (created_by);

-- Call history: per-user recent calls
CREATE INDEX IF NOT EXISTS idx_call_history_caller
  ON public.call_history (caller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_history_callee
  ON public.call_history (callee_id, created_at DESC);

-- Call signaling: fast lookup of active sessions
CREATE INDEX IF NOT EXISTS idx_call_signaling_call
  ON public.call_signaling (call_id);
CREATE INDEX IF NOT EXISTS idx_call_signaling_created
  ON public.call_signaling (created_at DESC);

-- Presence / typing: per-user lookups
CREATE INDEX IF NOT EXISTS idx_presence_user
  ON public.presence (user_id);
CREATE INDEX IF NOT EXISTS idx_typing_chat
  ON public.typing (chat_id);

-- Notifications: per-user unread feed
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);

-- Friendships / requests: per-user lookups
CREATE INDEX IF NOT EXISTS idx_friendships_user
  ON public.friendships (user_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_to
  ON public.friend_requests (to_user_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 5. RLS hardening for messaging tables (ensure RLS is enabled)
-- ----------------------------------------------------------------------------
ALTER TABLE public.messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_history    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_signaling  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_users   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presence        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.typing          ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 6. Drop orphaned social helper functions (if any)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.increment_post_views(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.toggle_post_reaction(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.get_feed(uuid, integer, integer) CASCADE;
DROP FUNCTION IF EXISTS public.get_trending_hashtags(integer) CASCADE;
