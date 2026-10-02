-- =============================================================================
-- Remove web-app-only backend objects.
-- =============================================================================
-- The web client (React/Vite) has been removed from the repository; the native
-- Android app is the only supported client. The objects below were only ever
-- used by the web app and are safe to drop.
--
-- The native app stores its Firebase Cloud Messaging token in
-- `public.user_devices.push_token` (see PushTokenRegistrar / SupabaseRestApi),
-- never in `public.users.push_subscription`, so removing the latter does not
-- affect push notifications or background call invitations.
--
-- Idempotent: safe to run multiple times.
-- =============================================================================

-- 1. Web push subscription column on `users`.
ALTER TABLE IF EXISTS public.users DROP COLUMN IF EXISTS push_subscription;
DROP INDEX IF EXISTS public.idx_users_push_subscription;

-- 2. Web push subscription table (VAPID endpoint store), if it exists.
DROP TABLE IF EXISTS public.push_subscriptions;

-- 3. Web-only edge functions are removed from the repository
--    (supabase/functions/ai-chat, supabase/functions/send-push). If they were
--    previously deployed, delete them with the Supabase CLI / dashboard:
--      supabase functions delete ai-chat
--      supabase functions delete send-push
--    (DDL cannot drop edge functions, so this is documented rather than run.)
