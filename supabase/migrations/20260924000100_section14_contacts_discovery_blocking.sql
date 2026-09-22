-- ============================================================================
-- Section 14: Contacts Screen
-- ----------------------------------------------------------------------------
-- 1. Privacy-preserving contact discovery: store only SHA-256 hashes of
--    normalized phone numbers / emails on the users row, and expose a
--    SECURITY DEFINER RPC that matches a caller-supplied set of hashes.
--    Raw address-book entries are never uploaded or stored.
-- 2. Server-side block enforcement: a user may not insert a message into a
--    direct chat when either party has blocked the other.
-- Idempotent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1a. Hash columns on users
-- ----------------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS phone_hash TEXT;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_users_phone_hash
  ON public.users (phone_hash)
  WHERE phone_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_email_hash
  ON public.users (email_hash)
  WHERE email_hash IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 1b. Keep hashes in sync whenever phone/email change.
--     Uses pgcrypto digest() so the app never has to trust client hashing for
--     the stored value (the app still hashes locally for the lookup payload).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gaga_normalize_phone(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  digits TEXT;
BEGIN
  IF p_phone IS NULL THEN
    RETURN NULL;
  END IF;
  digits := regexp_replace(p_phone, '\D', '', 'g');
  IF digits = '' THEN
    RETURN NULL;
  END IF;
  -- Strip international dialing prefix 00
  IF left(digits, 2) = '00' THEN
    digits := substring(digits from 3);
  END IF;
  RETURN digits;
END;
$$;

CREATE OR REPLACE FUNCTION public.gaga_normalize_email(p_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  trimmed TEXT;
  at_pos INT;
  local_part TEXT;
  domain_part TEXT;
BEGIN
  IF p_email IS NULL THEN
    RETURN NULL;
  END IF;
  trimmed := lower(btrim(p_email));
  at_pos := position('@' in trimmed);
  IF at_pos <= 1 THEN
    RETURN NULLIF(trimmed, '');
  END IF;
  local_part := replace(substring(trimmed from 1 for at_pos - 1), '.', '');
  domain_part := substring(trimmed from at_pos + 1);
  RETURN local_part || '@' || domain_part;
END;
$$;

CREATE OR REPLACE FUNCTION public.gaga_sync_contact_hashes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.phone_hash := encode(digest(public.gaga_normalize_phone(NEW.phone), 'sha256'), 'hex');
  NEW.email_hash := encode(digest(public.gaga_normalize_email(NEW.email), 'sha256'), 'hex');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_contact_hashes ON public.users;
CREATE TRIGGER trg_users_contact_hashes
  BEFORE INSERT OR UPDATE OF phone, email ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.gaga_sync_contact_hashes();

-- Backfill existing rows.
UPDATE public.users
SET phone_hash = encode(digest(public.gaga_normalize_phone(phone), 'sha256'), 'hex'),
    email_hash = encode(digest(public.gaga_normalize_email(email), 'sha256'), 'hex')
WHERE phone IS NOT NULL OR email IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 1c. Discovery RPC. The client sends only hashes; the function returns the
--     minimal public profile of matching users. Raw phone/email are never
--     returned. Excludes the caller and anyone in a block relationship.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.discover_contacts(
  p_phone_hashes TEXT[] DEFAULT '{}',
  p_email_hashes TEXT[] DEFAULT '{}'
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  display_name TEXT,
  username TEXT,
  avatar TEXT,
  bio TEXT,
  is_verified BOOLEAN,
  phone_hash TEXT,
  email_hash TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id,
    u.name,
    u.display_name,
    u.username,
    u.avatar,
    u.bio,
    u.is_verified,
    u.phone_hash,
    u.email_hash
  FROM public.users u
  WHERE u.id <> auth.uid()
    AND (
      (array_length(p_phone_hashes, 1) IS NOT NULL AND u.phone_hash = ANY(p_phone_hashes))
      OR (array_length(p_email_hashes, 1) IS NOT NULL AND u.email_hash = ANY(p_email_hashes))
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.blocked_users b
      WHERE (b.blocker_id = auth.uid() AND b.blocked_id = u.id)
         OR (b.blocker_id = u.id AND b.blocked_id = auth.uid())
    )
  LIMIT 500;
$$;

REVOKE ALL ON FUNCTION public.discover_contacts(TEXT[], TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.discover_contacts(TEXT[], TEXT[]) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Server-side block enforcement for direct messages.
--    Replaces the insert policy so a message cannot be written into a direct
--    chat when either participant has blocked the other.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "messages_participant_insert" ON public.messages;
CREATE POLICY "messages_participant_insert" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.chats c
      WHERE c.id = messages.chat_id
        AND auth.uid()::text = ANY (COALESCE(c.participants, '{}'::text[]))
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.chats c
      JOIN public.blocked_users b
        ON (b.blocker_id = auth.uid() AND b.blocked_id::text = ANY (COALESCE(c.participants, '{}'::text[])))
        OR (b.blocked_id = auth.uid() AND b.blocker_id::text = ANY (COALESCE(c.participants, '{}'::text[])))
      WHERE c.id = messages.chat_id
        AND c.type = 'direct'
    )
  );

-- ----------------------------------------------------------------------------
-- 3. Ensure blocked_users has sane RLS (idempotent).
-- ----------------------------------------------------------------------------
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blocked_users_select_own" ON public.blocked_users;
CREATE POLICY "blocked_users_select_own" ON public.blocked_users
  FOR SELECT TO authenticated
  USING (blocker_id = auth.uid() OR blocked_id = auth.uid());

DROP POLICY IF EXISTS "blocked_users_insert_own" ON public.blocked_users;
CREATE POLICY "blocked_users_insert_own" ON public.blocked_users
  FOR INSERT TO authenticated
  WITH CHECK (blocker_id = auth.uid());

DROP POLICY IF EXISTS "blocked_users_delete_own" ON public.blocked_users;
CREATE POLICY "blocked_users_delete_own" ON public.blocked_users
  FOR DELETE TO authenticated
  USING (blocker_id = auth.uid());
