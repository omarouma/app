-- GaGa Firebase chat mirror readiness audit (read-only; no user/chat identifiers).
-- Run in the Supabase SQL Editor on the intended SOURCE project before
-- any staging backfill or production mirror rollout. This script does not
-- rotate credentials, change schema, enqueue work or touch Firebase.
--
-- A nonzero malformed/duplicate/unsupported count means some source chats
-- cannot safely sync without a privacy-reviewed data repair.
-- Atypical direct-chat size requires human investigation; never auto-delete
-- or auto-add users to make a metric green.

select
  count(*) as total_chats,
  count(*) filter (where type = 'direct') as direct_chats,
  count(*) filter (where type = 'group') as group_chats,
  count(*) filter (where type not in ('direct','group') or type is null)
    as unsupported_chat_types,
  count(*) filter (where updated_at is null) as missing_source_version,
  count(*) filter (where participants is null) as null_membership,
  count(*) filter (where cardinality(participants) = 0) as zero_member_chats,
  count(*) filter (where cardinality(participants) > 1000)
    as oversized_membership,
  count(*) filter (where type = 'direct' and cardinality(participants) <> 2)
    as atypical_direct_chats,
  count(*) filter (
    where exists (
      select 1 from unnest(participants) as x
      where x is null
        or x !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
  ) as malformed_member_ids,
  count(*) filter (
    where cardinality(participants) <>
      cardinality(array(select distinct x from unnest(participants) as x))
  ) as duplicate_member_chats
from public.chats;

-- A group member being present in one authoritative Supabase representation
-- but missing from another must be repaired before a trusted backfill.
-- This computes counts only; no identifiers or message content are emitted.
with joined as (
  select
    g.id as group_id,
    c.id as chat_id,
    coalesce(g.participants, '{}'::text[]) as group_membership,
    coalesce(c.participants, '{}'::text[]) as chat_membership,
    (
      select array_agg(gm.user_id::text order by gm.user_id::text)
      from public.group_members gm
      where gm.group_id = g.id
    ) as roster
  from public.groups g
  left join public.chats c on c.id = g.id::text
)
select
  count(*) as group_records,
  count(*) filter (where chat_id is null) as group_without_chat,
  count(*) filter (
    where chat_id is not null
      and (
        select array_agg(distinct x order by x)
        from unnest(group_membership) as x
      ) is distinct from (
        select array_agg(distinct x order by x)
        from unnest(chat_membership) as x
      )
  ) as group_chat_divergence,
  count(*) filter (
    where roster is distinct from (
      select array_agg(distinct x order by x)
      from unnest(group_membership) as x
    )
  ) as roster_group_divergence
from joined;

-- Permission-sensitive security check: run only using the authorized
-- Supabase SQL Editor or read-only administrative SQL credentials. auth.users
-- is not exposed to Android clients or PostgREST. Do NOT publish identities.
-- The Firestore mirroring service must NOT blindly project deleted identities:
-- an old Firebase login might otherwise retain membership after a Supabase
-- account was deleted. A nonzero result BLOCKS historical backfill.
with memberships as (
  select
    c.id as chat_id,
    c.type,
    count(*) filter (where pu.id is null) as missing_profile_members,
    count(*) filter (where au.id is null) as missing_auth_members,
    count(*) filter (where pu.id is null and au.id is not null)
      as missing_profile_only_members,
    count(*) filter (where pu.id is not null and au.id is null)
      as missing_auth_only_members
  from public.chats c
  cross join lateral unnest(c.participants) as member(user_id)
  left join public.users pu on pu.id::text = lower(member.user_id)
  left join auth.users au on au.id::text = lower(member.user_id)
  group by c.id, c.type
)
select
  count(*) filter (where missing_auth_members > 0)
    as chats_with_missing_auth_users,
  count(*) filter (where missing_profile_members > 0)
    as chats_with_missing_public_users,
  count(*) filter (where missing_auth_members > 0 and type = 'direct')
    as direct_chats_with_missing_auth_users,
  count(*) filter (where missing_auth_members > 0 and type = 'group')
    as group_chats_with_missing_auth_users,
  coalesce(sum(missing_auth_members), 0) as orphan_auth_membership_entries,
  coalesce(sum(missing_profile_members), 0)
    as orphan_public_membership_entries,
  coalesce(sum(missing_profile_only_members), 0)
    as auth_user_without_public_profile_entries,
  coalesce(sum(missing_auth_only_members), 0)
    as public_profile_without_auth_user_entries
from memberships;
