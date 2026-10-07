-- Repair: the Android client marks a conversation as read by calling
--   POST /rest/v1/rpc/mark_chat_read { "p_chat_id": "<chat id>" }
-- (see core/network SupabaseRestApi.updateConversationFlags -> unreadCount == 0).
-- The function exists on the live project but was never captured in a repo
-- migration, so the schema drifted from the client contract. This migration
-- (re)defines it idempotently and keeps it aligned with the per-user read
-- marker used by public.gaga_visible_chats (unread_count is derived from
-- chat_reads.last_read_at).
--
-- The base chat_reads table is provisioned outside this migration chain, so the
-- table guard below is defensive: it is a no-op when the table already exists.

create table if not exists public.chat_reads (
  chat_id text not null references public.chats(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_message_id text,
  last_read_at timestamptz not null default timezone('utc',now()),
  primary key(chat_id,user_id)
);
create index if not exists idx_chat_reads_user on public.chat_reads(user_id,last_read_at desc);
alter table public.chat_reads enable row level security;
revoke all on table public.chat_reads from anon;
grant select,insert,update,delete on table public.chat_reads to authenticated;

-- Mark the caller's own read marker for a chat they participate in. Only the
-- authenticated participant's row is touched; the shared chat/messages rows are
-- never mutated. last_read_at=now() drives unread_count back to zero for the
-- caller, and last_read_message_id is refreshed to the newest live message.
create or replace function public.mark_chat_read(p_chat_id text)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not gaga_private.session_active() then
    raise exception 'Sign in required' using errcode='42501';
  end if;
  if p_chat_id is null or not exists (
    select 1 from public.chats c
    where c.id=p_chat_id and v_uid::text=any(coalesce(c.participants,'{}'::text[]))
  ) then
    raise exception 'Chat unavailable' using errcode='42501';
  end if;

  insert into public.chat_reads(chat_id,user_id,last_read_message_id,last_read_at)
  values (
    p_chat_id,
    v_uid,
    (
      select m.id from public.messages m
      where m.chat_id=p_chat_id and coalesce(m.destroyed,false)=false
      order by m.created_at desc,m.id desc
      limit 1
    ),
    timezone('utc',now())
  )
  on conflict(chat_id,user_id) do update set
    last_read_at=excluded.last_read_at,
    last_read_message_id=coalesce(excluded.last_read_message_id,public.chat_reads.last_read_message_id);
end $$;
revoke all on function public.mark_chat_read(text) from public,anon;
grant execute on function public.mark_chat_read(text) to authenticated;
