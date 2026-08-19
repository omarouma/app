-- Final production hardening for media ownership and safe profile lookups.

BEGIN;

-- Storage paths are <bucket-root>/<user-id>/<filename>. The previous policies
-- checked segment 2, which compared the user id against the filename.
DROP POLICY IF EXISTS "gaga_media_upload_own_folder" ON storage.objects;
CREATE POLICY "gaga_media_upload_own_folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('chat-media', 'voice-messages', 'avatars', 'posts', 'stories', 'reels')
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "gaga_media_update_own_folder" ON storage.objects;
CREATE POLICY "gaga_media_update_own_folder"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('chat-media', 'voice-messages', 'avatars', 'posts', 'stories', 'reels')
    AND split_part(name, '/', 1) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id IN ('chat-media', 'voice-messages', 'avatars', 'posts', 'stories', 'reels')
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "gaga_media_delete_own_folder" ON storage.objects;
CREATE POLICY "gaga_media_delete_own_folder"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id IN ('chat-media', 'voice-messages', 'avatars', 'posts', 'stories', 'reels')
    AND split_part(name, '/', 1) = auth.uid()::text
  );

-- Secure phone-login lookup. It returns only the email needed to continue
-- authentication and never exposes the users table to direct SELECT.
CREATE OR REPLACE FUNCTION public.lookup_phone_login(p_phone TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT email
  FROM public.users
  WHERE phone = p_phone
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.lookup_phone_login(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_phone_login(TEXT) TO anon, authenticated;

COMMIT;
