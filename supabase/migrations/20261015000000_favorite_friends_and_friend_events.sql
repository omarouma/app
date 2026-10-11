-- GaGa People: account-synced favorites and durable friendship notifications.
-- Source-only until the production schema is backed up and migration reviewed.
-- Existing user_settings and friendships schemas are intentionally untouched.

create table if not exists public.favorite_friends (
  user_id uuid not null references public.users(id) on delete cascade,
  friend_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  constraint favorite_friends_no_self check (user_id <> friend_id)
);
create index if not exists favorite_friends_friend_idx on public.favorite_friends(friend_id);
alter table public.favorite_friends enable row level security;

drop policy if exists favorite_friends_owner_read on public.favorite_friends;
create policy favorite_friends_owner_read on public.favorite_friends for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists favorite_friends_owner_insert on public.favorite_friends;
create policy favorite_friends_owner_insert on public.favorite_friends for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.friendships f
      where f.user_id = (select auth.uid()) and f.friend_id = favorite_friends.friend_id
    )
  );

drop policy if exists favorite_friends_owner_delete on public.favorite_friends;
create policy favorite_friends_owner_delete on public.favorite_friends for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.favorite_friends from public, anon;
grant select, insert, delete on public.favorite_friends to authenticated;

-- Permanently unfavorite someone when their specific friendship is deleted.
-- All changes are server-owned; private favorite lists never become public.
create or replace function public.gaga_remove_stale_favorite()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.favorite_friends
    where user_id = old.user_id and friend_id = old.friend_id;
  return old;
end $$;
drop trigger if exists trg_gaga_clear_favorite_on_unfriend on public.friendships;
create trigger trg_gaga_clear_favorite_on_unfriend
  after delete on public.friendships for each row
  execute function public.gaga_remove_stale_favorite();
revoke all on function public.gaga_remove_stale_favorite() from public, anon, authenticated;

-- Immutable inbox events are created transactionally from trusted DB transitions.
-- Push delivery is separate and best-effort; the inbox remains available if FCM
-- is offline. Only the real request sender/recipient may create the transition.
create or replace function public.gaga_friend_event_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_recipient uuid;
  v_actor uuid;
  v_type text;
  v_title text;
  v_body text;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then return new; end if;
    v_recipient := new.to_user_id;
    v_actor := new.from_user_id;
    v_type := 'friend_request';
    v_title := 'New friend request';
    v_body := 'Someone wants to connect with you on GaGa.';
  elsif tg_op = 'UPDATE' then
    if old.status is not distinct from new.status then return new; end if;
    if old.status <> 'pending' or new.status <> 'accepted' then return new; end if;
    v_recipient := new.from_user_id;
    v_actor := new.to_user_id;
    v_type := 'friend_accepted';
    v_title := 'Friend request accepted';
    v_body := 'Your GaGa friend request was accepted.';
  else
    return new;
  end if;

  insert into public.notifications(user_id, type, title, body, data, actor_id, from_id)
  values (
    v_recipient, v_type, v_title, v_body,
    jsonb_build_object('type', v_type, 'request_id', new.id::text,
                       'actor_id', v_actor::text, 'user_id', v_recipient::text),
    v_actor, v_actor
  );
  return new;
end $$;

drop trigger if exists trg_gaga_friend_request_notify_insert on public.friend_requests;
create trigger trg_gaga_friend_request_notify_insert
  after insert on public.friend_requests for each row
  execute function public.gaga_friend_event_notification();

drop trigger if exists trg_gaga_friend_request_notify_accept on public.friend_requests;
create trigger trg_gaga_friend_request_notify_accept
  after update of status on public.friend_requests for each row
  execute function public.gaga_friend_event_notification();

revoke all on function public.gaga_friend_event_notification() from public, anon, authenticated;

-- Push delivery idempotency for the authenticated friend-event Edge Function.
-- Only the server's service role can inspect or record dispatch attempts.
create table if not exists public.friend_push_dispatches (
  request_id uuid not null references public.friend_requests(id) on delete cascade,
  event_type text not null check (event_type in ('friend_request', 'friend_accepted')),
  created_at timestamptz not null default now(),
  primary key (request_id, event_type)
);
alter table public.friend_push_dispatches enable row level security;
revoke all on public.friend_push_dispatches from public, anon, authenticated;
grant select, insert on public.friend_push_dispatches to service_role;
