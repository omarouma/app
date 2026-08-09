-- ============================================================
-- GaGa Chat — FIX: messages RLS "mark as read" 403 Forbidden
-- Project: alzwgikndwbecuqmlrca
-- ============================================================
-- ROOT CAUSE
-- ----------
-- The single `messages_chat_participant` policy is `FOR ALL` with
-- `WITH CHECK (auth.uid()::text = sender_id AND ...)`. When a chat
-- RECIPIENT marks a message as read (PATCH on messages), they are NOT
-- the sender, so the WITH CHECK fails and PostgREST returns 403.
--
-- FIX
-- ---
-- Split into granular policies so participants can:
--   * SELECT  — any participant of the chat
--   * INSERT  — the sender (writer) of a message in a chat they belong to
--   * UPDATE  — any participant may flip `read` / read-state fields
--   * DELETE  — chat participants (for clear-chat / leave-group cleanup)
--
-- Safe to re-run (all statements are idempotent).
-- ============================================================

-- Drop the old over-restrictive single policy
DROP POLICY IF EXISTS "messages_chat_participant" ON messages;

-- SELECT: any participant can read a chat's messages
DROP POLICY IF EXISTS "messages_participant_select" ON messages;
CREATE POLICY "messages_participant_select" ON messages
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM chats
    WHERE chats.id = messages.chat_id
      AND auth.uid()::text = ANY(chats.participants)
  )
);

-- INSERT: the sender inserting into a chat they belong to
DROP POLICY IF EXISTS "messages_participant_insert" ON messages;
CREATE POLICY "messages_participant_insert" ON messages
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid()::text = sender_id
  AND EXISTS (
    SELECT 1 FROM chats
    WHERE chats.id = messages.chat_id
      AND auth.uid()::text = ANY(chats.participants)
  )
);

-- UPDATE:
--   * Any participant may mark messages read (read / read_at / delivered_at
--     / delivery_status) so the recipient can PATCH read=true.
--   * Editing content/type/media is restricted to the original sender.
DROP POLICY IF EXISTS "messages_participant_update" ON messages;
CREATE POLICY "messages_participant_update" ON messages
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM chats
    WHERE chats.id = messages.chat_id
      AND auth.uid()::text = ANY(chats.participants)
  )
)
WITH CHECK (
  -- Sender may update anything for their own message
  (auth.uid()::text = sender_id)
  OR
  -- Non-senders (recipients) may ONLY set read-state fields
  (
    NOT auth.uid()::text = sender_id
    AND (
      NEW.chat_id IS NOT DISTINCT FROM OLD.chat_id
      AND NEW.sender_id IS NOT DISTINCT FROM OLD.sender_id
      AND NEW.content IS NOT DISTINCT FROM OLD.content
      AND NEW.type IS NOT DISTINCT FROM OLD.type
      AND NEW.media_url IS NOT DISTINCT FROM OLD.media_url
      AND NEW.reactions IS NOT DISTINCT FROM OLD.reactions
      AND NEW.poll_data IS NOT DISTINCT FROM OLD.poll_data
      AND NEW.contact_card IS NOT DISTINCT FROM OLD.contact_card
    )
  )
);

-- DELETE: participants may delete messages (clear chat / leave group)
DROP POLICY IF EXISTS "messages_participant_delete" ON messages;
CREATE POLICY "messages_participant_delete" ON messages
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM chats
    WHERE chats.id = messages.chat_id
      AND auth.uid()::text = ANY(chats.participants)
  )
);

-- ============================================================
-- DONE
-- ============================================================
