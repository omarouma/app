-- Per-user chat deletion: hide a conversation for one account without
-- deleting the shared chat row/messages for every participant.

create table if not exists public.chat_hidden_users (
  chat_id text not null references public.chats(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  hidden_at timestamptz not null default timezone('utc',now()),
  primary key(chat_id,user_id)
);
create index if not exists idx_chat_hidden_users_user
  on public.chat_hidden_users(user_id,hidden_at desc);
alter table public.chat_hidden_users enable row level security;
revoke all on table public.chat_hidden_users from public,anon,authenticated;

create or replace function public.gaga_hide_chat(p_chat_id text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not gaga_private.session_active() then
    raise exception 'Sign in required' using errcode='42501';
  end if;
  if not exists (
    select 1 from public.chats c
    where c.id=p_chat_id and auth.uid()::text=any(coalesce(c.participants,'{}'::text[]))
  ) then raise exception 'Chat unavailable' using errcode='42501'; end if;
  insert into public.chat_hidden_users(chat_id,user_id,hidden_at)
  values(p_chat_id,auth.uid(),timezone('utc',now()))
  on conflict(chat_id,user_id) do update set hidden_at=excluded.hidden_at;
end $$;
revoke all on function public.gaga_hide_chat(text) from public,anon;
grant execute on function public.gaga_hide_chat(text) to authenticated;

create or replace function public.gaga_unhide_chat(p_chat_id text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not gaga_private.session_active() then
    raise exception 'Sign in required' using errcode='42501';
  end if;
  delete from public.chat_hidden_users h
  where h.chat_id=p_chat_id and h.user_id=auth.uid();
end $$;
revoke all on function public.gaga_unhide_chat(text) from public,anon;
grant execute on function public.gaga_unhide_chat(text) to authenticated;

create or replace function public.gaga_visible_chats(
  p_limit integer default 30,
  p_offset integer default 0,
  p_since timestamptz default null
)
returns setof public.chats
language sql stable security definer set search_path='' as $$
  select c.*
  from public.chats c
  where auth.uid() is not null
    and gaga_private.session_active()
    and auth.uid()::text=any(coalesce(c.participants,'{}'::text[]))
    and (p_since is null or c.updated_at >= p_since)
    and not exists (
      select 1 from public.chat_hidden_users h
      where h.chat_id=c.id and h.user_id=auth.uid()
        and c.updated_at <= h.hidden_at
    )
  order by c.updated_at desc,c.id
  limit greatest(1,least(coalesce(p_limit,30),100))
  offset greatest(coalesce(p_offset,0),0);
$$;
revoke all on function public.gaga_visible_chats(integer,integer,timestamptz) from public,anon;
grant execute on function public.gaga_visible_chats(integer,integer,timestamptz) to authenticated;

drop policy if exists chats_delete_participant on public.chats;
drop policy if exists gaga_chats_delete_participant on public.chats;
revoke delete on table public.chats from anon,authenticated;
