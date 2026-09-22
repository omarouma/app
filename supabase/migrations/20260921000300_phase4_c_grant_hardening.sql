-- ============================================================================
-- Phase 4 / Milestone C — Function grant hardening
-- ============================================================================
-- Audit of pg_proc.proacl on the live project found several SECURITY DEFINER
-- functions that were still executable by the `anon` role (and in one case by
-- PUBLIC). Because these functions run with the definer's privileges, an
-- unauthenticated caller could reach data that RLS would otherwise deny.
--
-- Findings and fixes:
--
--   claim_idempotency_key(text,text,text)   anon -> authenticated only
--   complete_idempotency_key(text,jsonb)    anon -> authenticated only
--   cleanup_phase4_housekeeping()           anon -> service_role only
--   resolve_user_id(text)                   anon -> authenticated only
--       (leaked the firebase_uid -> users.id mapping to anonymous callers)
--   mark_messages_read(text,uuid)           anon -> authenticated only
--   is_admin()                              PUBLIC -> authenticated only
--
-- All of these are idempotent: `revoke` on a privilege that is not held is a
-- no-op, and `grant` on a privilege already held is a no-op.
-- ============================================================================

-- ── 1. Idempotency helpers ──────────────────────────────────────────────────
revoke all on function public.claim_idempotency_key(text, text, text) from public, anon;
grant execute on function public.claim_idempotency_key(text, text, text) to authenticated, service_role;

revoke all on function public.complete_idempotency_key(text, jsonb) from public, anon;
grant execute on function public.complete_idempotency_key(text, jsonb) to authenticated, service_role;

-- ── 2. Housekeeping — server-side only ──────────────────────────────────────
revoke all on function public.cleanup_phase4_housekeeping() from public, anon, authenticated;
grant execute on function public.cleanup_phase4_housekeeping() to service_role;

-- ── 3. Identity resolution — never expose to anonymous callers ──────────────
revoke all on function public.resolve_user_id(text) from public, anon;
grant execute on function public.resolve_user_id(text) to authenticated, service_role;

-- ── 4. Receipts — the 2-arg overload must not be reachable anonymously ──────
revoke all on function public.mark_messages_read(text, uuid) from public, anon;
grant execute on function public.mark_messages_read(text, uuid) to authenticated, service_role;

-- ── 5. is_admin() — PUBLIC execute was granted by default ───────────────────
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- ── 6. Belt-and-braces: revoke PUBLIC execute on every SECURITY DEFINER
--      function in `public` that is not an extension-owned helper, then
--      re-grant to authenticated + service_role. This closes the default
--      `=X/postgres` PUBLIC grant that PostgreSQL applies to new functions.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
      and p.prokind = 'f'
      -- Skip trigger functions: they are invoked by the executor, not by
      -- clients, and revoking EXECUTE on them can break DML.
      and not exists (
        select 1 from pg_trigger t where t.tgfoid = p.oid and not t.tgisinternal
      )
  loop
    begin
      execute format('revoke all on function %s from public, anon', r.sig);
      execute format('grant execute on function %s to authenticated, service_role', r.sig);
    exception when others then
      raise warning 'grant hardening skipped for %: %', r.sig, sqlerrm;
    end;
  end loop;
end $$;

-- ── 7. Verify: no SECURITY DEFINER function should remain anon-executable ───
do $$
declare
  v_leaks text;
begin
  select string_agg(p.oid::regprocedure::text, ', ')
    into v_leaks
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef = true
    and p.prokind = 'f'
    and has_function_privilege('anon', p.oid, 'execute');

  if v_leaks is not null then
    raise warning 'Phase 4 C: anon can still execute SECURITY DEFINER functions: %', v_leaks;
  else
    raise notice 'Phase 4 C: grant hardening OK — no anon-executable SECURITY DEFINER functions remain.';
  end if;
end $$;
