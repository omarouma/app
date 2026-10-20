-- GaGa backend baseline contract assertions, reviewed 2026-10-20.
-- READ ONLY: SELECT on pg_catalog / pg_publication_tables and server-owned
-- wallet_feature_flags. Run in Supabase SQL Editor; never call as a client RPC.
-- All ten checks returned passed=true on live fcjgbbmfqdkucfpqjxae.
-- A pass is metadata evidence, not an authenticated device E2E test.
with checks as (
 select 'rls_core_tables'::text as check_name,
 (select count(*)=9 and bool_and(c.relrowsecurity)
  from pg_class c join pg_namespace n on c.relnamespace=n.oid
  where n.nspname='public' and c.relname=any(array[
  'users','chats','messages','notifications','friend_requests','call_signaling','friendships','wallets','wallet_transactions'
  ]) and c.relkind in ('r','p')) as passed
 union all select 'core_rls_have_policies',
  (select count(distinct t.tablename)=9 from pg_policies t where t.schemaname='public'
   and t.tablename=any(array['users','chats','messages','notifications','friend_requests','call_signaling','friendships','wallets','wallet_transactions']))
 union all select 'realtime_required_tables',
  (select count(distinct p.tablename)=7 from pg_publication_tables p
   where p.pubname='supabase_realtime' and p.schemaname='public' and
   p.tablename=any(array['chats','messages','notifications','call_signaling','friend_requests','friendships','user_devices']))
 union all select 'private_internal_tables_no_client_access',
  (select count(*)=4 and bool_and(
    not has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
    and not has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE')
   ) from pg_class c join pg_namespace n on c.relnamespace=n.oid
   where n.nspname='public' and c.relname=any(array[
    'chat_hidden_users','chat_user_settings','friend_push_dispatches','wallet_feature_flags']) and c.relkind in ('r','p'))
 union all select 'rpc_anon_forbidden',
  (select count(distinct p.proname)=6 and bool_and(
    not has_function_privilege('anon',p.oid,'EXECUTE')
  ) from pg_proc p join pg_namespace n on p.pronamespace=n.oid
  where n.nspname='public' and p.proname=any(array[
    'send_message','admin_update_user','wallet_transfer','delete_own_account','create_notification','credit_wallet_from_settlement']))
 union all select 'server_only_rpcs_block_clients',
  (select count(distinct p.proname)=3 and bool_and(
    not has_function_privilege('authenticated',p.oid,'EXECUTE') and
    not has_function_privilege('anon',p.oid,'EXECUTE')
  ) from pg_proc p join pg_namespace n on p.pronamespace=n.oid
  where n.nspname='public' and p.proname=any(array[
    'create_notification','credit_wallet_from_settlement','gaga_create_call']))
 union all select 'money_transfer_flag_disabled',
  (select count(*)=1 and bool_and(enabled=false)
   from public.wallet_feature_flags where flag='real_money_p2p')
 union all select 'wallet_ledger_accepts_runtime_types',
  (select count(*)=1 and bool_and(convalidated and
     pg_get_constraintdef(c.oid) like '%interest%' and pg_get_constraintdef(c.oid) like '%withdraw%'
     and pg_get_constraintdef(c.oid) like '%reward%')
  from pg_constraint c where c.conrelid='public.wallet_transactions'::regclass
   and c.conname='wallet_transactions_type_check')
 union all select 'secure_session_guard_exists',
  (select count(*)=1 from pg_proc p join pg_namespace n on p.pronamespace=n.oid
   where n.nspname='gaga_private' and p.proname='session_active' and p.prosecdef)
 union all select 'critical_rpcs_have_session_guard',
  (select count(distinct p.proname)=3 and bool_and(
    pg_get_functiondef(p.oid) ~* 'gaga_private[.]session_active[(][)]'
  ) from pg_proc p join pg_namespace n on p.pronamespace=n.oid
  where n.nspname='public' and p.proname=any(array[
    'send_message','admin_update_user','wallet_transfer']))
)
select check_name,coalesce(passed,false) as passed from checks order by check_name;
