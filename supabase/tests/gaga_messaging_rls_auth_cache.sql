-- Read-only post-migration guard, suitable for production.
-- Run with Supabase SQL editor. Any failure aborts with explanation.
DO $gaga$
DECLARE
  correct_count integer;
  session_count integer;
BEGIN
  SELECT count(*) INTO correct_count
  FROM pg_policies
  WHERE schemaname='public'
    AND permissive='PERMISSIVE'
    AND ((tablename='chats' AND policyname IN (
        'chats_insert_own','chats_select_participant','chats_update_participant'))
      OR (tablename='messages' AND policyname IN (
        'messages_participant_insert','messages_participant_select',
        'messages_sender_delete','messages_sender_update'))
      OR (tablename='notifications' AND policyname IN (
        'notifications_delete_own','notifications_select_own',
        'notifications_update_own')))
    AND (coalesce(qual,'') || coalesce(with_check,'')) ~* '[(][[:space:]]*SELECT auth[.]uid[(][)]';
  IF correct_count <> 10 THEN
    RAISE EXCEPTION 'Expected 10 optimized messaging policies, found %',correct_count;
  END IF;
  SELECT count(*) INTO session_count
  FROM pg_policies
  WHERE schemaname='public' AND tablename IN ('chats','messages','notifications')
    AND policyname='gaga_active_session'
    AND permissive='RESTRICTIVE';
  IF session_count <> 3 THEN
    RAISE EXCEPTION 'Session authorization guard missing from chats/messages/notifications';
  END IF;
END
$gaga$;
