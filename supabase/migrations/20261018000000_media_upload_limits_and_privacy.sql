-- ============================================================================
-- Media upload limits, MIME allow-lists and chat-media privacy
-- ============================================================================
--
-- Background
-- ----------
-- Every bucket was created with only `(id, name, public)`. Supabase therefore
-- fell back to the *project-level* storage cap (50 MB by default) and accepted
-- any content type. The Android client, however, advertises:
--
--     image    25 MB
--     video   100 MB
--     audio    25 MB
--     document 50 MB
--
-- so any video between 50 MB and 100 MB was rejected by the storage layer with
-- a generic "Payload too large" after the user had already waited for the whole
-- file to upload. That is the "sending videos doesn't work" report.
--
-- This migration:
--   1. pins an explicit `file_size_limit` on each media bucket, matching the
--      client-side constants in `core/common/Constants.kt`;
--   2. pins an explicit `allowed_mime_types` allow-list so an unsupported file
--      fails fast with a clear 415 instead of a silent corruption;
--   3. flips `chat-media` and `voice-messages` to private, which is what the
--      Android client already assumes (`MediaUrlResolver.PRIVATE_BUCKETS`) and
--      what the `gaga_private.can_read_chat_media` membership policy was
--      written for. Today the buckets are `public = true`, so any URL that
--      leaks is readable by anyone on the internet forever.
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Size limits
-- ---------------------------------------------------------------------------
-- Supabase's `file_size_limit` is per bucket, in bytes, and is enforced before
-- the object is written. Setting it explicitly overrides the project default.

update storage.buckets
   set file_size_limit = 26214400 -- 25 MB
 where id = 'avatars';

update storage.buckets
   set file_size_limit = 104857600 -- 100 MB, matches MAX_VIDEO_UPLOAD_BYTES
 where id = 'chat-media';

update storage.buckets
   set file_size_limit = 26214400 -- 25 MB, matches MAX_AUDIO_UPLOAD_BYTES
 where id = 'voice-messages';

update storage.buckets
   set file_size_limit = 104857600 -- 100 MB, matches MAX_UPLOAD_BYTES
 where id = 'media';

-- Do not modify posts/stories/reels here. Those are feed buckets and may
-- already have independent 100 MB limits; reducing them would be an unrelated
-- production regression in a chat attachment repair.

-- ---------------------------------------------------------------------------
-- 2. MIME allow-lists
-- ---------------------------------------------------------------------------
-- Exact-match lists, so every type the Android picker can produce has to be
-- named. `application/octet-stream` is included deliberately: the client falls
-- back to it when a content provider reports no type, and rejecting it would
-- turn "unknown document" into a hard failure.
--
-- NOTE: the allow-list is checked against the Content-Type header the client
-- sends, not against the file bytes.

update storage.buckets
   set allowed_mime_types = array[
     'image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/gif',
     'image/webp', 'image/bmp', 'image/x-ms-bmp', 'image/heic', 'image/heif',
     'image/heic-sequence', 'image/avif'
   ]
 where id = 'avatars';

update storage.buckets
   set allowed_mime_types = array[
     -- images
     'image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/gif',
     'image/webp', 'image/bmp', 'image/x-ms-bmp', 'image/heic', 'image/heif',
     'image/heic-sequence', 'image/avif',
     -- video
     'video/mp4', 'video/x-m4v', 'video/quicktime', 'video/3gpp',
     'video/3gpp2', 'video/webm', 'video/x-matroska', 'video/mpeg',
     'video/x-msvideo', 'video/x-flv',
     -- audio (voice notes are audio/mp4, but the picker can send more)
     'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac',
     'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/opus', 'audio/webm',
     'audio/amr', 'audio/3gpp', 'audio/flac', 'audio/x-flac',
     -- documents
     'application/pdf', 'text/plain', 'text/csv', 'text/html', 'text/rtf',
     'application/rtf', 'application/json', 'application/xml', 'text/xml',
     'application/msword', 'application/vnd.ms-word',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.ms-excel',
     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
     'application/vnd.ms-powerpoint',
     'application/vnd.openxmlformats-officedocument.presentationml.presentation',
     'application/vnd.oasis.opendocument.text',
     'application/vnd.oasis.opendocument.spreadsheet',
     'application/epub+zip',
     -- archives
     'application/zip', 'application/x-zip-compressed',
     'application/x-rar-compressed', 'application/vnd.rar',
     'application/x-7z-compressed', 'application/gzip', 'application/x-tar',
     -- last-resort fallback for providers that report nothing
     'application/octet-stream', 'binary/octet-stream'
   ]
 where id = 'chat-media';

update storage.buckets
   set allowed_mime_types = array[
     'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac',
     'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/opus', 'audio/webm',
     'audio/amr', 'audio/3gpp', 'audio/flac', 'audio/x-flac'
   ]
 where id = 'voice-messages';

-- ---------------------------------------------------------------------------
-- 3. Chat media is private
-- ---------------------------------------------------------------------------
-- The Android client never reads `/object/public/chat-media/...` directly. It
-- rewrites those URLs into short-lived signed URLs (TTL 3600s) via
-- `POST /object/sign/{bucket}/{path}`, and the RLS policy
-- `gaga_private.can_read_chat_media` authorises the signer only when they are
-- the path owner or a participant in a chat that references the object.
--
-- With `public = true` that whole mechanism is bypassed: anyone holding the
-- URL can read the photo, video or voice note with no session at all. Flipping
-- the buckets to private closes that hole without changing client behaviour.
--
-- Existing rows keep their stored `/object/public/...` string; the resolver
-- recognises the bucket name and exchanges it for a signed URL at read time.

update storage.buckets set public = false where id = 'chat-media';
update storage.buckets set public = false where id = 'voice-messages';

-- ---------------------------------------------------------------------------
-- 4. Close the blanket read policy on chat media
-- ---------------------------------------------------------------------------
-- `20260925000100_backend_completion.sql` created:
--
--     create policy gaga_media_public_read on storage.objects
--       for select to public
--       using (bucket_id = any(array['chat-media','media','voice-messages',...]));
--
-- and `20261007103107_enforce_private_chat_media_membership.sql` later added a
-- *restrictive-looking* membership policy, `gaga_objects_chat_read`, but never
-- dropped the blanket one. Postgres RLS policies are permissive and OR'ed, so
-- the blanket policy won: every row in `chat-media` and `voice-messages`
-- remained readable by `anon` and by any signed-in user, regardless of chat
-- membership. The membership check was dead code.
--
-- Fix: scope the public-read policy to the buckets that are genuinely public
-- (avatars and the feed), and recreate the membership policy for the two chat
-- buckets so this migration is self-contained.

drop policy if exists gaga_media_public_read on storage.objects;
create policy gaga_media_public_read
  on storage.objects for select to public
  using (bucket_id in ('avatars', 'posts', 'stories', 'reels', 'media'));

drop policy if exists gaga_objects_chat_read on storage.objects;
create policy gaga_objects_chat_read
  on storage.objects for select to authenticated
  using (
    bucket_id in ('chat-media', 'voice-messages')
    and gaga_private.can_read_chat_media(bucket_id, name)
  );

-- ---------------------------------------------------------------------------
-- 5. Require an active session IN ADDITION to bucket and membership rules
-- ---------------------------------------------------------------------------
-- Production also has a permissive FOR ALL policy named
-- gaga_storage_active_session on storage.objects.  PostgreSQL combines
-- permissive policies using OR, so an active session alone currently permits
-- SELECT/INSERT/UPDATE/DELETE on *every* storage object -- bypassing the
-- owner-folder policy and the chat participant check above.
--
-- Make the session policy RESTRICTIVE: its predicate is AND'ed with the
-- operation-specific permissive policies. A caller now needs both an active
-- Supabase session and the applicable bucket/owner/membership authorization.
-- This is intentionally limited to authenticated clients; public bucket reads
-- remain publicly accessible under their own public-read policy.
drop policy if exists gaga_storage_active_session on storage.objects;
create policy gaga_storage_active_session
  on storage.objects as restrictive
  for all to authenticated
  using ((select gaga_private.session_active()))
  with check ((select gaga_private.session_active()));

-- ---------------------------------------------------------------------------
-- 6. Fail loudly if the buckets are missing
-- ---------------------------------------------------------------------------
-- A silent no-op here would leave the app in exactly the state this migration
-- is meant to fix, so assert that every bucket we touched actually exists.

do $$
declare
  missing text;
begin
  select string_agg(b, ', ')
    into missing
    from unnest(array['chat-media', 'voice-messages', 'avatars', 'media']) as b
   where not exists (select 1 from storage.buckets sb where sb.id = b);

  if missing is not null then
    raise exception 'Media buckets missing, cannot apply limits: %', missing;
  end if;
end;
$$;
