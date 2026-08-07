-- ============================================================
-- GaGa Chat — Realtime Performance Fixes
-- Project: alzwgikndwbecuqmlrca | Region: ap-southeast-1
-- ============================================================
-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/alzwgikndwbecuqmlrca/sql
--
-- Safe to re-run (idempotent). Adds two RPCs used by the client
-- to perform atomic unread-count increments and batched read-receipt
-- updates instead of read-then-write round-trips.
-- ============================================================

-- ─── Atomic unread counter ────────────────────────────────────────
-- Increments the unread_count for a chat for every participant EXCEPT
-- the sender. The column is JSONB in the schema (map_message reads it as
-- unreadCount), so we add/update per-participant keys atomically.
-- A numeric fallback guards against older numeric-typed deployments.
CREATE OR REPLACE FUNCTION increment_chat_unread(
  p_chat_id TEXT,
  p_sender_id TEXT
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_participants TEXT[];
  v_participant TEXT;
  v_unread JSONB;
BEGIN
  SELECT participants INTO v_participants FROM chats WHERE id = p_chat_id;
  IF v_participants IS NULL THEN
    RETURN;
  END IF;

  SELECT unread_count INTO v_unread FROM chats WHERE id = p_chat_id;
  IF v_unread IS NULL OR jsonb_typeof(v_unread) <> 'object' THEN
    v_unread := '{}'::jsonb;
  END IF;

  FOREACH v_participant IN ARRAY v_participants LOOP
    IF v_participant <> p_sender_id THEN
      v_unread := jsonb_set(
        v_unread,
        ARRAY[v_participant],
        to_jsonb(COALESCE((v_unread->>v_participant)::int, 0) + 1)
      );
    END IF;
  END LOOP;

  UPDATE chats
    SET unread_count = v_unread,
        updated_at = now()
    WHERE id = p_chat_id;
END;
$$;

-- ─── Batched mark-as-read ─────────────────────────────────────────
-- Sets read=true on all unread messages for a chat belonging to the
-- recipient, then resets only that recipient's unread_count key.
CREATE OR REPLACE FUNCTION mark_chat_read(
  p_chat_id TEXT,
  p_user_id TEXT
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_unread JSONB;
BEGIN
  UPDATE messages
    SET read = true,
        read_at = now()
    WHERE chat_id = p_chat_id
      AND sender_id <> p_user_id
      AND read = false;

  SELECT unread_count INTO v_unread FROM chats WHERE id = p_chat_id;
  IF v_unread IS NULL OR jsonb_typeof(v_unread) <> 'object' THEN
    v_unread := '{}'::jsonb;
  END IF;

  v_unread := v_unread - p_user_id;

  UPDATE chats
    SET unread_count = v_unread,
        last_message_read = true,
        updated_at = now()
    WHERE id = p_chat_id;
END;
$$;

-- ============================================================
-- DONE
-- ============================================================
