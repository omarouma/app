-- ============================================================================
-- Contact matching RPC + public_profiles view hardening
-- ============================================================================
-- Problem
-- -------
-- 1. `public_profiles` (the view the client reads for user lookups) exposed
--    `phone` and `referral_code` to every authenticated user. That is a PII
--    leak: any signed-in user could enumerate phone numbers / referral codes.
-- 2. Contact matching was done client-side by querying `users` with
--    `phone >= ...` / `email == ...`, which requires those columns to be
--    readable. Moving matching server-side lets us drop them from the view.
--
-- Fix
-- ---
-- * Add `public.match_contacts(p_emails text[], p_phones text[])` (SECURITY
--   DEFINER) that returns only the minimal public fields of matched users.
-- * Recreate `public_profiles` WITHOUT `phone` and `referral_code`.
-- ============================================================================

-- 1. Server-side contact matching. Returns only public fields.
create or replace function public.match_contacts(p_emails text[] default '{}', p_phones text[] default '{}')
returns table (
  id uuid,
  name text,
  display_name text,
  username text,
  avatar text,
  is_verified boolean,
  is_premium boolean,
  phone text,
  email text
)
language sql
security definer
set search_path = public
as $$
  select u.id, u.name, u.display_name, u.username, u.avatar,
         u.is_verified, u.is_premium, u.phone, u.email
  from public.users u
  where (coalesce(array_length(p_emails, 1), 0) > 0 and lower(u.email) = any (
           select lower(x) from unnest(p_emails) as x
         ))
     or (coalesce(array_length(p_phones, 1), 0) > 0 and u.phone = any (p_phones))
  limit 500;
$$;

revoke all on function public.match_contacts(text[], text[]) from public;
revoke all on function public.match_contacts(text[], text[]) from anon;
grant execute on function public.match_contacts(text[], text[]) to authenticated;

comment on function public.match_contacts(text[], text[]) is
  'Server-side contact matching. Returns minimal public fields for users whose email/phone matches the supplied lists. Keeps phone/email out of the public_profiles view.';

-- 2. Recreate the public view without phone / referral_code.
drop view if exists public.public_profiles;
create view public.public_profiles as
  select id, name, display_name, username, avatar, cover_image, bio,
         is_verified, status, status_message, location, website,
         is_premium, premium_expires_at, followers, following, close_friends,
         interests, streak_days, created_at, last_seen, hide_online_status,
         nicknames
  from public.users;

grant select on public.public_profiles to authenticated, anon;
