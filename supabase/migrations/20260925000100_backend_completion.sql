-- =============================================================================
-- GaGa Chat — Backend completion migration (v2 — corrected)
-- =============================================================================
-- Idempotent. Safe to run multiple times.
--
-- FIX (v2): the storage RLS block previously used a PL/pgSQL variable
-- (`buckets`) inside CREATE POLICY DDL, which the parser rejected with
-- `column "buckets" does not exist` (42703). CREATE POLICY is a utility
-- statement and does not substitute PL/pgSQL variables, so the bucket list is
-- now inlined as a literal array in every policy.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Storage buckets
-- ---------------------------------------------------------------------------
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

-- Remove the mismatched legacy policies (they keyed on segment 2).
DROP POLICY IF EXISTS "gaga_media_upload_own_folder" ON storage.objects;
DROP POLICY IF EXISTS "gaga_media_update_own_folder" ON storage.objects;
DROP POLICY IF EXISTS "gaga_media_delete_own_folder" ON storage.objects;

-- Recreate them keyed on segment 1 (literal bucket array inlined).
DROP POLICY IF EXISTS "gaga_media_insert_own_folder" ON storage.objects;
CREATE POLICY "gaga_media_insert_own_folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = ANY (ARRAY['chat-media','media','voice-messages','avatars','posts','stories','reels'])
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "gaga_media_update_own_folder_v2" ON storage.objects;
CREATE POLICY "gaga_media_update_own_folder_v2"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = ANY (ARRAY['chat-media','media','voice-messages','avatars','posts','stories','reels'])
    AND split_part(name, '/', 1) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = ANY (ARRAY['chat-media','media','voice-messages','avatars','posts','stories','reels'])
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "gaga_media_delete_own_folder_v2" ON storage.objects;
CREATE POLICY "gaga_media_delete_own_folder_v2"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = ANY (ARRAY['chat-media','media','voice-messages','avatars','posts','stories','reels'])
    AND split_part(name, '/', 1) = auth.uid()::text
  );

-- Public read for the media buckets.
DROP POLICY IF EXISTS "gaga_media_public_read" ON storage.objects;
CREATE POLICY "gaga_media_public_read"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = ANY (ARRAY['chat-media','media','voice-messages','avatars','posts','stories','reels']));

-- Tighten the overly-broad avatar upload policy so a user can only write into
-- their own folder (previously it allowed ANY authenticated user to write ANY
-- path in the avatars bucket).
DROP POLICY IF EXISTS "avatars_upload_authenticated" ON storage.objects;
CREATE POLICY "avatars_upload_authenticated"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- 3. Device registry — make (user_id, device_id) upsert-safe
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_devices_user_device
  ON public.user_devices (user_id, device_id);

CREATE INDEX IF NOT EXISTS idx_user_devices_push_token
  ON public.user_devices (push_token)
  WHERE push_token IS NOT NULL;

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
-- The old view hid `device_id` (NOT NULL on user_devices) and filtered on
-- push_token, so inserts through it failed. Recreate it exposing every column
-- and back it with INSTEAD OF triggers so legacy clients keep working.
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
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY['chats','messages','chat_reads','call_history','typing','presence','notifications'];
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY tbls LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Signup trigger — honour the `display_name` metadata key
-- ---------------------------------------------------------------------------
-- The native app sends `data: { display_name: <name> }` on signup, but the
-- original handle_new_profile only read `name` / `full_name`, so the display
-- name fell back to the email local-part until onboarding saved the profile.
CREATE OR REPLACE FUNCTION public.handle_new_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_name text;
    v_username text;
BEGIN
    v_name := COALESCE(
        NULLIF(NEW.raw_user_meta_data->>'display_name', ''),
        NULLIF(NEW.raw_user_meta_data->>'name', ''),
        NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
        NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
        'GaGa User'
    );

    v_username := lower(regexp_replace(v_name, '[^a-zA-Z0-9]', '', 'g'));
    IF v_username IS NULL OR length(v_username) < 3 THEN
        v_username := 'user';
    END IF;
    v_username := left(v_username, 20) || '_' || substr(NEW.id::text, 1, 6);

    INSERT INTO public.users (id, email, name, display_name, username, created_at)
    VALUES (NEW.id, NEW.email, v_name, v_name, v_username, now())
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id) VALUES (NEW.id)
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$function$;

-- =============================================================================
-- Done. Verify with:
--   SELECT id, public FROM storage.buckets ORDER BY id;
--   SELECT * FROM public.device_tokens LIMIT 1;
-- =============================================================================
