-- Already applied to the live GaGa project as migration 20261015191730.
-- Preserve the existing permissive access policy and the restrictive
-- gaga_private.session_active() AND guard. This changes only a stable
-- auth.uid() lookup to the recommended (SELECT auth.uid()) initplan form.
-- All ten policies and their original auth.uid() references must exist;
-- otherwise this migration fails atomically (no partial policy updates).
DO $gaga$
DECLARE
  p RECORD;
  new_using TEXT;
  new_check TEXT;
  statement TEXT;
  changed_count INTEGER := 0;
BEGIN
  FOR p IN
    SELECT x.tablename, x.policyname, x.permissive, x.qual, x.with_check
    FROM pg_policies x
    JOIN (VALUES
      ('chats','chats_insert_own'),
      ('chats','chats_select_participant'),
      ('chats','chats_update_participant'),
      ('messages','messages_participant_insert'),
      ('messages','messages_participant_select'),
      ('messages','messages_sender_delete'),
      ('messages','messages_sender_update'),
      ('notifications','notifications_delete_own'),
      ('notifications','notifications_select_own'),
      ('notifications','notifications_update_own')
    ) AS targets(tablename,policyname)
      ON targets.tablename=x.tablename AND targets.policyname=x.policyname
    WHERE x.schemaname='public'
  LOOP
    IF p.permissive <> 'PERMISSIVE' THEN
      RAISE EXCEPTION 'Unexpected RLS policy kind: %.%', p.tablename, p.policyname;
    END IF;
    IF position('auth.uid()' IN (coalesce(p.qual,'') || coalesce(p.with_check,'')))=0 THEN
      RAISE EXCEPTION 'Unexpected RLS expression: %.%', p.tablename, p.policyname;
    END IF;
    IF (coalesce(p.qual,'') || coalesce(p.with_check,'')) ~* '\\mselect[[:space:]]+auth[.]uid[(][)]' THEN
      RAISE EXCEPTION 'Manual review required for existing cached auth.uid in %.%', p.tablename, p.policyname;
    END IF;
    new_using := replace(p.qual,'auth.uid()','(SELECT auth.uid())');
    new_check := replace(p.with_check,'auth.uid()','(SELECT auth.uid())');
    statement := format('ALTER POLICY %I ON public.%I',p.policyname,p.tablename);
    IF new_using IS NOT NULL THEN
      statement := statement || ' USING (' || new_using || ')';
    END IF;
    IF new_check IS NOT NULL THEN
      statement := statement || ' WITH CHECK (' || new_check || ')';
    END IF;
    EXECUTE statement;
    changed_count := changed_count+1;
  END LOOP;
  IF changed_count <> 10 THEN
    RAISE EXCEPTION 'RLS migration aborted: expected 10 matching policies, got %', changed_count;
  END IF;
END
$gaga$;
