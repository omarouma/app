-- =============================================================================
-- GaGa Chat — Backend completion migration
-- =============================================================================
-- Idempotent. Safe to run multiple times. Apply in the Supabase SQL editor
-- (Dashboard -> SQL Editor -> New query -> paste -> Run) against the LIVE
-- project, or via `supabase db push` if you have CLI access.
--
-- WHY THIS EXISTS
-- A live probe of the production project found three concrete backend gaps that
-- broke parts of the native app:
--
--   1. STORAGE: the `media` bucket referenced by the shipped build config did
--      not exist (uploads returned 404 NoSuchBucket). The buckets that DO exist
--      are chat-media / avatars / voice-messages. The app has been repointed to
--      `chat-media`; this migration also creates `media` plus the remaining
--      buckets (posts / stories / reels) so every client has a valid target.
--
--   2. STORAGE RLS: the previously-shipped policy scoped writes to path segment
--      2 (`split_part(name,'/',2)`), but the client writes `<userId>/<file>`
--      (segment 1). This migration installs policies keyed on segment 1 and
--      removes the mismatched one, so uploads work AND stay scoped to the
--      caller's own folder.
--
--   3. DEVICES: the `device_tokens` view did not expose `device_id`, which is
--      NOT NULL on the underlying `user_devices` table — so every insert failed
--      with `null value in column "device_id"`. The app now writes to
--      `user_devices` directly; this migration repairs the view for any other
--      client and adds a unique index so (user_id, device_id) upserts are safe.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Storage buckets
-- ---------------------------------------------------------------------------
-- Public read is intentional: the client stores public media URLs. Writes are
-- restricted by the RLS policies below.
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('chat-media',     'chat-media',     true),
  ('media',          'media',          true),
  ('voice-messages', 'voice-messages', true),
  ('avatars',        'avatars',        true),
  ('posts',          'posts',          true),
  ('stories',        'stories',        true),
  ('reels',          'reels',          true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- ---------------------------------------------------------------------------
-- 2. Storage RLS — scope writes to the caller's own top-level folder
-- ---------------------------------------------------------------------------
-- Object paths are `<userId>/<uploadId>.<ext>`, i.e. the owner is segment 1.
DO $$
DECLARE
  b text;
  buckets text[] := ARRAY['chat-media','media','voice-messages','avatars','posts','stories','reels'];
BEGIN
  -- Remove the mismatched legacy policy (segment 2).
  DROP POLICY IF EXISTS "gaga_media_upload_own_folder" ON storage.objects;
  DROP POLICY IF EXISTS "gaga_media_update_own_folder" ON storage.objects;
  DROP POLICY IF EXISTS "gaga_media_delete_own_folder" ON storage.objects;

  -- Recreate them keyed on segment 1.
  DROP POLICY IF EXISTS "gaga_media_insert_own_folder" ON storage.objects;
  CREATE POLICY "gaga_media_insert_own_folder"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = ANY (buckets)
      AND split_part(name, '/', 1) = auth.uid()::text
    );

  DROP POLICY IF EXISTS "gaga_media_update_own_folder_v2" ON storage.objects;
  CREATE POLICY "gaga_media_update_own_folder_v2"
    ON storage.objects FOR UPDATE TO authenticated
    USING (
      bucket_id = ANY (buckets)
      AND split_part(name, '/', 1) = auth.uid()::text
    )
    WITH CHECK (
      bucket_id = ANY (buckets)
      AND split_part(name, '/', 1) = auth.uid()::text
    );

  DROP POLICY IF EXISTS "gaga_media_delete_own_folder_v2" ON storage.objects;
  CREATE POLICY "gaga_media_delete_own_folder_v2"
    ON storage.objects FOR DELETE TO authenticated
    USING (
      bucket_id = ANY (buckets)
      AND split_part(name, '/', 1) = auth.uid()::text
    );

  -- Public read for the media buckets.
  DROP POLICY IF EXISTS "gaga_media_public_read" ON storage.objects;
  CREATE POLICY "gaga_media_public_read"
    ON storage.objects FOR SELECT TO public
    USING (bucket_id = ANY (buckets));
END $$;

-- ---------------------------------------------------------------------------
-- 3. Device registry — make (user_id, device_id) upsert-safe
-- ---------------------------------------------------------------------------
-- The app dedupes client-side, but a unique index makes concurrent
-- registrations (e.g. token refresh racing a login) safe as well.
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_devices_user_device
  ON public.user_devices (user_id, device_id);

CREATE INDEX IF NOT EXISTS idx_user_devices_push_token
  ON public.user_devices (push_token)
  WHERE push_token IS NOT NULL;

-- Keep updated_at honest without relying on the client.
CREATE OR REPLACE FUNCTION public.touch_user_devices_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_user_devices_touch ON public.user_devices;
CREATE TRIGGER trg_user_devices_touch
  BEFORE UPDATE ON public.user_devices
  FOR EACH ROW EXECUTE FUNCTION public.touch_user_devices_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Repair the `device_tokens` compatibility view
-- ---------------------------------------------------------------------------
-- The old view exposed only (id, user_id, token, platform, device_name,
-- last_seen_at, created_at, fcm_token) and HID `device_id`, which is NOT NULL
-- on `user_devices` -- so every INSERT through the view failed with
-- `null value in column "device_id"`. Recreate it exposing every column and
-- back it with INSTEAD OF triggers so legacy clients that only know about
-- `token` keep working (device_id is auto-filled when absent).
DROP VIEW IF EXISTS public.device_tokens;

CREATE VIEW public.device_tokens
WITH (security_invoker = true)
AS
SELECT
  id,
  user_id,
  device_id,
  device_name,
  platform,
  app_version,
  push_token,
  push_token AS token,      -- legacy alias used by older clients
  push_token AS fcm_token,  -- legacy alias used by older clients
  last_seen_at,
  created_at,
  updated_at
FROM public.user_devices;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_tokens TO authenticated;

-- INSERT: fill in device_id when a legacy client omits it.
CREATE OR REPLACE FUNCTION public.device_tokens_ins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  INSERT INTO public.user_devices (
    user_id, device_id, device_name, platform, app_version, push_token, last_seen_at
  ) VALUES (
    NEW.user_id,
    COALESCE(NULLIF(NEW.device_id, ''), 'legacy-' || gen_random_uuid()::text),
    COALESCE(NEW.device_name, ''),
    COALESCE(NULLIF(NEW.platform, ''), 'android'),
    NEW.app_version,
    COALESCE(NEW.push_token, NEW.token, NEW.fcm_token),
    COALESCE(NEW.last_seen_at, now())
  );
  RETURN NEW;
END $$;

-- UPDATE: propagate the legacy aliases onto the real columns.
CREATE OR REPLACE FUNCTION public.device_tokens_upd()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE public.user_devices
     SET push_token   = COALESCE(NEW.push_token, NEW.token, NEW.fcm_token, push_token),
         device_name  = COALESCE(NEW.device_name, device_name),
         platform     = COALESCE(NEW.platform, platform),
         last_seen_at = COALESCE(NEW.last_seen_at, last_seen_at),
         updated_at   = now()
   WHERE id = OLD.id;
  RETURN NEW;
END $$;

-- DELETE: forward to the real table.
CREATE OR REPLACE FUNCTION public.device_tokens_del()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  DELETE FROM public.user_devices WHERE id = OLD.id;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_device_tokens_ins ON public.device_tokens;
CREATE TRIGGER trg_device_tokens_ins
  INSTEAD OF INSERT ON public.device_tokens
  FOR EACH ROW EXECUTE FUNCTION public.device_tokens_ins();

DROP TRIGGER IF EXISTS trg_device_tokens_upd ON public.device_tokens;
CREATE TRIGGER trg_device_tokens_upd
  INSTEAD OF UPDATE ON public.device_tokens
  FOR EACH ROW EXECUTE FUNCTION public.device_tokens_upd();

DROP TRIGGER IF EXISTS trg_device_tokens_del ON public.device_tokens;
CREATE TRIGGER trg_device_tokens_del
  INSTEAD OF DELETE ON public.device_tokens
  FOR EACH ROW EXECUTE FUNCTION public.device_tokens_del();

-- ---------------------------------------------------------------------------
-- 5. Realtime — make sure the chat tables are published
-- ---------------------------------------------------------------------------
-- Guarded so it is a no-op if the publication already contains the table.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['chats','messages','chat_reads','call_history','typing','presence','notifications'];
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY tables LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $$;

-- =============================================================================
-- Done. Verify with:
--   SELECT id, public FROM storage.buckets ORDER BY id;
--   SELECT * FROM public.device_tokens LIMIT 1;
-- =============================================================================
