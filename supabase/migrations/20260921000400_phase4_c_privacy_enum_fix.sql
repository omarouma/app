-- ============================================================================
-- Phase 4 / Milestone C — Privacy enum alignment (P0 bug fix)
-- ============================================================================
--
-- BUG: The client writes `friends_of_friends` for the "Who can send friend
-- requests" and "Who can add me to groups" privacy selectors, but the DB CHECK
-- constraints only permitted ('everyone','contacts','nobody'). Every attempt to
-- select "Friends of Friends" therefore failed the CHECK and the UPDATE was
-- rejected — the setting silently never persisted (the UI optimistically showed
-- the new value until the next reload).
--
-- FIX: Widen both CHECK constraints to accept the full set the client uses:
--   everyone | friends_of_friends | contacts | nobody
--
-- `contacts` is retained for backwards compatibility with any rows written by
-- earlier builds. No existing rows use `friends_of_friends` (verified: all 39
-- users are on 'everyone'), so this migration is non-destructive.
-- ============================================================================

begin;

-- ── 1. users.friend_request_privacy ─────────────────────────────────────────
alter table public.users
  drop constraint if exists users_friend_request_privacy_check;

alter table public.users
  add constraint users_friend_request_privacy_check
  check (
    friend_request_privacy is null
    or friend_request_privacy in ('everyone', 'friends_of_friends', 'contacts', 'nobody')
  );

-- ── 2. users.group_add_privacy ──────────────────────────────────────────────
alter table public.users
  drop constraint if exists users_group_add_privacy_check;

alter table public.users
  add constraint users_group_add_privacy_check
  check (
    group_add_privacy is null
    or group_add_privacy in ('everyone', 'friends_of_friends', 'contacts', 'nobody')
  );

-- ── 3. Normalise any legacy 'contacts' rows to 'friends_of_friends' ─────────
-- The client has no 'contacts' option, so a legacy row would render as an
-- unmatched value. Map it to the closest supported semantic.
update public.users
   set friend_request_privacy = 'friends_of_friends'
 where friend_request_privacy = 'contacts';

update public.users
   set group_add_privacy = 'friends_of_friends'
 where group_add_privacy = 'contacts';

-- ── 4. Verify ───────────────────────────────────────────────────────────────
do $$
declare
  v_fr text;
  v_ga text;
begin
  select pg_get_constraintdef(oid) into v_fr
    from pg_constraint
   where conrelid = 'public.users'::regclass
     and conname = 'users_friend_request_privacy_check';

  select pg_get_constraintdef(oid) into v_ga
    from pg_constraint
   where conrelid = 'public.users'::regclass
     and conname = 'users_group_add_privacy_check';

  if v_fr is null or v_fr not like '%friends_of_friends%' then
    raise exception 'friend_request_privacy constraint not widened: %', coalesce(v_fr, 'MISSING');
  end if;

  if v_ga is null or v_ga not like '%friends_of_friends%' then
    raise exception 'group_add_privacy constraint not widened: %', coalesce(v_ga, 'MISSING');
  end if;

  raise notice 'Phase 4 C: privacy enum fix OK — both constraints accept friends_of_friends.';
end $$;

commit;
