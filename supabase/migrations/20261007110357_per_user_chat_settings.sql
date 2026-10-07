-- Per-user chat-list preferences. Shared chat membership/content stays on
-- public.chats; pin/mute/archive belong to the current user. Unread count is
-- derived from chat_reads rather than the legacy shared chats.unread_count field.

create table if not exists public.chat_user_settings (
  chat_id text not null references public.chats(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  pinned boolean not null default false,
  muted boolean not null default false,
  archived boolean not null default false,
  updated_at timestamptz not null default timezone('utc',now()),
  primary key(chat_id,user_id)
);
create index if not exists idx_chat_user_settings_user
  on public.chat_user_settings(user_id,pinned desc,archived,updated_at desc);
alter table public.chat_user_settings enable row level security;
revoke all on table public.chat_user_settings from public,anon,authenticated;

create or replace function public.gaga_save_chat_settings(
 p_chat_id text,p_pinned boolean default null,p_muted boolean default null,p_archived boolean default null
) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not gaga_private.session_active() then
   raise exception 'Sign in required' using errcode='42501';
 end if;
 if not exists(
   select 1 from public.chats c
   where c.id=p_chat_id and auth.uid()::text=any(coalesce(c.participants,'{}'::text[]))
 ) then raise exception 'Chat unavailable' using errcode='42501'; end if;
 insert into public.chat_user_settings(chat_id,user_id,pinned,muted,archived,updated_at)
 values(p_chat_id,auth.uid(),coalesce(p_pinned,false),coalesce(p_muted,false),coalesce(p_archived,false),timezone('utc',now()))
 on conflict(chat_id,user_id) do update set
   pinned=coalesce(p_pinned,public.chat_user_settings.pinned),
   muted=coalesce(p_muted,public.chat_user_settings.muted),
   archived=coalesce(p_archived,public.chat_user_settings.archived),
   updated_at=timezone('utc',now());
end $$;
revoke all on function public.gaga_save_chat_settings(text,boolean,boolean,boolean) from public,anon;
grant execute on function public.gaga_save_chat_settings(text,boolean,boolean,boolean) to authenticated;

create or replace function public.gaga_visible_chats(
  p_limit integer default 30,p_offset integer default 0,p_since timestamptz default null
)
returns setof public.chats language sql stable security definer set search_path='' as $$
 select jsonb_populate_record(
   null::public.chats,
   to_jsonb(c) || jsonb_build_object(
     'pinned',coalesce(s.pinned,false),
     'is_muted',coalesce(s.muted,false),
     'archived',coalesce(s.archived,false),
     'unread_count',coalesce((
       select count(*)::int from public.messages m
       where m.chat_id=c.id and m.sender_id<>auth.uid()
         and coalesce(m.destroyed,false)=false
         and m.created_at > coalesce((
           select r.last_read_at from public.chat_reads r
           where r.chat_id=c.id and r.user_id=auth.uid()
           order by r.last_read_at desc limit 1
         ),'-infinity'::timestamptz)
     ),0)
   )
 )
 from public.chats c
 left join public.chat_user_settings s on s.chat_id=c.id and s.user_id=auth.uid()
 where auth.uid() is not null
   and gaga_private.session_active()
   and auth.uid()::text=any(coalesce(c.participants,'{}'::text[]))
   and (p_since is null or c.updated_at>=p_since)
   and not exists(
     select 1 from public.chat_hidden_users h
     where h.chat_id=c.id and h.user_id=auth.uid() and c.updated_at<=h.hidden_at
   )
 order by coalesce(s.pinned,false) desc,c.updated_at desc,c.id
 limit greatest(1,least(coalesce(p_limit,30),100))
 offset greatest(coalesce(p_offset,0),0);
$$;
revoke all on function public.gaga_visible_chats(integer,integer,timestamptz) from public,anon;
grant execute on function public.gaga_visible_chats(integer,integer,timestamptz) to authenticated;
