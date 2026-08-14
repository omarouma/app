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
--   * Sender may update their own message content/metadata.
--   * Recipients may only flip delivery/read metadata.
DROP POLICY IF EXISTS "messages_sender_update" ON messages;
CREATE POLICY "messages_sender_update" ON messages
FOR UPDATE TO authenticated
USING (auth.uid()::text = sender_id)
WITH CHECK (
  auth.uid()::text = sender_id
  AND NEW.chat_id IS NOT DISTINCT FROM OLD.chat_id
  AND NEW.sender_id IS NOT DISTINCT FROM OLD.sender_id
  AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
);

DROP POLICY IF EXISTS "messages_recipient_read_update" ON messages;
CREATE POLICY "messages_recipient_read_update" ON messages
FOR UPDATE TO authenticated
USING (
  auth.uid()::text <> sender_id
  AND EXISTS (
    SELECT 1 FROM chats
    WHERE chats.id = messages.chat_id
      AND auth.uid()::text = ANY(chats.participants)
  )
)
WITH CHECK (
  auth.uid()::text <> sender_id
  AND NEW.chat_id IS NOT DISTINCT FROM OLD.chat_id
  AND NEW.sender_id IS NOT DISTINCT FROM OLD.sender_id
  AND NEW.content IS NOT DISTINCT FROM OLD.content
  AND NEW.type IS NOT DISTINCT FROM OLD.type
  AND NEW.media_url IS NOT DISTINCT FROM OLD.media_url
  AND NEW.media_urls IS NOT DISTINCT FROM OLD.media_urls
  AND NEW.reply_to IS NOT DISTINCT FROM OLD.reply_to
  AND NEW.reactions IS NOT DISTINCT FROM OLD.reactions
  AND NEW.forwarded_from IS NOT DISTINCT FROM OLD.forwarded_from
  AND NEW.poll_data IS NOT DISTINCT FROM OLD.poll_data
  AND NEW.transfer_data IS NOT DISTINCT FROM OLD.transfer_data
  AND NEW.contact_card IS NOT DISTINCT FROM OLD.contact_card
  AND NEW.edited IS NOT DISTINCT FROM OLD.edited
  AND NEW.destroyed IS NOT DISTINCT FROM OLD.destroyed
  AND NEW.disappearing_timer IS NOT DISTINCT FROM OLD.disappearing_timer
  AND NEW.disappearing_initiated_at IS NOT DISTINCT FROM OLD.disappearing_initiated_at
  AND NEW.local_id IS NOT DISTINCT FROM OLD.local_id
  AND NEW.retry_count IS NOT DISTINCT FROM OLD.retry_count
  AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
  AND (
    (NEW.read IS NOT DISTINCT FROM OLD.read AND NEW.read_at IS NOT DISTINCT FROM OLD.read_at)
    OR (NEW.read = true AND NEW.read_at IS NOT NULL)
  )
  AND (
    NEW.delivered_at IS NOT DISTINCT FROM OLD.delivered_at
    OR NEW.delivered_at IS NOT NULL
  )
  AND (
    NEW.delivery_status IS NOT DISTINCT FROM OLD.delivery_status
    OR NEW.delivery_status IN ('sent', 'delivered', 'read')
  )
);

-- DELETE: only the sender may delete their own message.
DROP POLICY IF EXISTS "messages_sender_delete" ON messages;
CREATE POLICY "messages_sender_delete" ON messages
FOR DELETE TO authenticated
USING (auth.uid()::text = sender_id);

-- ============================================================
-- DONE
-- ============================================================
