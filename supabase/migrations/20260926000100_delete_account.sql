-- Delete Account (Play Store requirement — Master Spec §C / Item 40).
--
-- A signed-in user can irreversibly delete their own account and all data they
-- own. The function is SECURITY DEFINER so it can purge rows that RLS would
-- otherwise hide, but it is hard-scoped to auth.uid() so a caller can only ever
-- delete themselves. Deleting the auth.users row also invalidates every session
-- and refresh token for that identity.

BEGIN;

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  uid_text text := auth.uid()::text;
  uid_uuid uuid := auth.uid();
BEGIN
  IF uid_uuid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Messages authored by the user.
  DELETE FROM public.messages WHERE sender_id = uid_text;

  -- Read cursors, typing, presence.
  DELETE FROM public.chat_reads WHERE user_id = uid_text;
  DELETE FROM public.typing WHERE user_id = uid_text;
  DELETE FROM public.presence WHERE user_id = uid_text;

  -- Call history the user participated in.
  DELETE FROM public.call_history
   WHERE caller_id = uid_text
      OR callee_id = uid_text
      OR participant_ids @> ARRAY[uid_text];

  -- Devices / push tokens.
  DELETE FROM public.user_devices WHERE user_id = uid_text;

  -- Blocks in either direction.
  DELETE FROM public.blocked_users WHERE blocker_id = uid_text OR blocked_id = uid_text;

  -- Social graph.
  DELETE FROM public.friendships WHERE user_id = uid_text OR friend_id = uid_text;
  DELETE FROM public.friend_requests WHERE from_user_id = uid_text OR to_user_id = uid_text;

  -- Saved messages.
  DELETE FROM public.saved_messages WHERE user_id = uid_text OR sender_id = uid_text;

  -- Notifications.
  DELETE FROM public.notifications WHERE user_id = uid_text;

  -- Wallet.
  DELETE FROM public.wallets WHERE user_id = uid_text;

  -- Groups: remove membership; delete groups the user owned and left empty.
  DELETE FROM public.group_members WHERE user_id = uid_text;
  DELETE FROM public.groups g
   WHERE g.created_by = uid_text
     AND NOT EXISTS (SELECT 1 FROM public.group_members m WHERE m.group_id = g.id);

  -- Chats: drop the user from participants; delete chats with no participants
  -- left (covers 1:1 conversations).
  UPDATE public.chats
     SET participants = array_remove(participants, uid_text)
   WHERE participants @> ARRAY[uid_text];
  DELETE FROM public.chats WHERE participants IS NULL OR cardinality(participants) = 0;

  -- Storage objects owned by the user (paths are <uid>/<file>).
  DELETE FROM storage.objects
   WHERE split_part(name, '/', 1) = uid_text;

  -- Public profile + auth identity. Deleting auth.users cascades the session
  -- and refresh-token rows so the account can no longer authenticate.
  DELETE FROM public.users WHERE id = uid_text;
  DELETE FROM auth.users WHERE id = uid_uuid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

COMMIT;
