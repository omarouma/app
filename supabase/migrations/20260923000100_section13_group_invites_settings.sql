-- ============================================================================
-- Section 13: Group Chat — invite links + per-group settings
-- ----------------------------------------------------------------------------
-- Adds the columns required by the group invite-link flow and the per-group
-- admin controls (only-admins-can-post / only-admins-can-add). Idempotent.
-- ============================================================================

ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS invite_code TEXT;

ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;

-- Fast lookup when a user opens an invite link (/join/:code).
CREATE INDEX IF NOT EXISTS idx_chats_invite_code
  ON public.chats (invite_code)
  WHERE invite_code IS NOT NULL;

-- ----------------------------------------------------------------------------
-- RLS: allow an authenticated user to discover a group by its invite code so
-- they can join it. The existing participant policy still governs all other
-- reads/writes; this only widens SELECT for rows that carry an invite code.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "chats_select_by_invite" ON public.chats;
CREATE POLICY "chats_select_by_invite" ON public.chats
  FOR SELECT TO authenticated
  USING (invite_code IS NOT NULL);

-- Allow a user to add themselves to a group they were invited to. The WITH
-- CHECK ensures the resulting row still contains the acting user.
DROP POLICY IF EXISTS "chats_join_by_invite" ON public.chats;
CREATE POLICY "chats_join_by_invite" ON public.chats
  FOR UPDATE TO authenticated
  USING (invite_code IS NOT NULL)
  WITH CHECK (auth.uid()::text = ANY(participants));
