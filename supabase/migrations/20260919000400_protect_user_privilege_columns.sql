-- ============================================================================
-- Protect privilege / currency columns on public.users
-- ============================================================================
-- Context
-- -------
-- The RLS policy `users_update_own` allows a user to UPDATE any column of their
-- own row (`USING (id = auth.uid()) WITH CHECK (id = auth.uid())`). Combined with
-- the table-level UPDATE grant to `authenticated`, a signed-in user could run:
--
--     update public.users set coins = 999999999, is_admin = true where id = auth.uid();
--
-- directly from the browser (PostgREST) and mint unlimited coins or grant
-- themselves admin / verified / premium status.
--
-- A guard trigger `trg_prevent_client_user_privilege_changes` already existed,
-- but it detected "client" updates by inspecting the JWT role claim:
--
--     coalesce(current_setting('request.jwt.claim.role', true), 'authenticated') <> 'service_role'
--
-- That check is wrong for SECURITY DEFINER functions: when a signed-in user
-- calls e.g. `wallet_claim_daily_checkin()` (which legitimately updates
-- `streak_days`), the JWT role claim is still `authenticated`, so the trigger
-- raised `server-managed user fields cannot be changed by clients` and the
-- feature was broken.
--
-- Fix
-- ---
-- Detect the *effective* database role with `current_user` instead:
--   * Browser / PostgREST requests run as `authenticated` (or `anon`)  -> guarded
--   * SECURITY DEFINER functions run as their owner (`postgres`)        -> allowed
--   * service_role / migrations / supabase_admin                        -> allowed
--
-- The function is SECURITY INVOKER so `current_user` reflects the caller's
-- effective role rather than the function owner.
-- ============================================================================

create or replace function public.prevent_client_user_privilege_changes()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Trusted server-side roles (SECURITY DEFINER functions, service_role,
  -- migrations) may change anything.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'server-managed user fields cannot be changed by clients';
  end if;

  if (new.is_admin           is distinct from old.is_admin)
    or (new.is_verified        is distinct from old.is_verified)
    or (new.is_premium         is distinct from old.is_premium)
    or (new.premium_expires_at is distinct from old.premium_expires_at)
    or (new.coins              is distinct from old.coins)
    or (new.usd_balance        is distinct from old.usd_balance)
    or (new.bdt_balance        is distinct from old.bdt_balance)
    or (new.referral_count     is distinct from old.referral_count)
    or (new.streak_days        is distinct from old.streak_days)
    or (new.created_at         is distinct from old.created_at)
  then
    raise exception 'server-managed user fields cannot be changed by clients';
  end if;

  return new;
end;
$$;

-- Remove the redundant duplicate guard added during this review (if present).
drop trigger if exists trg_users_guard_privileged_columns on public.users;
drop function if exists public.users_guard_privileged_columns();

comment on function public.prevent_client_user_privilege_changes() is
  'Blocks client (authenticated/anon) updates to server-managed columns on public.users (coins, balances, is_admin, is_verified, is_premium, premium_expires_at, referral_count, streak_days, id, created_at). Uses the effective DB role so SECURITY DEFINER functions are unaffected.';
