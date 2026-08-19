-- Production schema completion for call participant tracking and media uploads.

ALTER TABLE public.call_history
  ADD COLUMN IF NOT EXISTS participant_ids TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_call_history_participant_ids
  ON public.call_history USING GIN (participant_ids);

-- Buckets used by src/lib/storage.ts. Public read is intentional because the
-- client stores public media URLs; writes remain restricted to authenticated
-- users and their own user folder.
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('chat-media', 'chat-media', true),
  ('voice-messages', 'voice-messages', true),
  ('avatars', 'avatars', true),
  ('posts', 'posts', true),
  ('stories', 'stories', true),
  ('reels', 'reels', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "gaga_media_upload_own_folder" ON storage.objects;
CREATE POLICY "gaga_media_upload_own_folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('chat-media', 'voice-messages', 'avatars', 'posts', 'stories', 'reels')
    AND split_part(name, '/', 2) = auth.uid()::text
  );

DROP POLICY IF EXISTS "gaga_media_update_own_folder" ON storage.objects;
CREATE POLICY "gaga_media_update_own_folder"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('chat-media', 'voice-messages', 'avatars', 'posts', 'stories', 'reels')
    AND split_part(name, '/', 2) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id IN ('chat-media', 'voice-messages', 'avatars', 'posts', 'stories', 'reels')
    AND split_part(name, '/', 2) = auth.uid()::text
  );

DROP POLICY IF EXISTS "gaga_media_delete_own_folder" ON storage.objects;
CREATE POLICY "gaga_media_delete_own_folder"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id IN ('chat-media', 'voice-messages', 'avatars', 'posts', 'stories', 'reels')
    AND split_part(name, '/', 2) = auth.uid()::text
  );
