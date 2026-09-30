-- ============================================================================
-- FIX: per-user unread counts for the chat list
-- ----------------------------------------------------------------------------
-- The chat list showed no unread badges because:
--   * chats.unread_count is a SINGLE shared column, and
--   * only the public.send_message() RPC ever incremented it, while the app
--     sends messages with a direct INSERT into public.messages.
--
-- A shared counter cannot represent per-user unread state in a group chat, so
-- this migration introduces a correct, per-user computation backed by the
-- existing public.chat_reads table (chat_id, user_id, last_read_at).
--
--   * public.get_chat_unread_counts(p_user_id) returns (chat_id, unread_count)
--     for every chat the caller participates in, counting messages newer than
--     the caller's last_read_at that were sent by someone else.
--   * public.mark_chat_read(p_chat_id) upserts the caller's last_read_at.
--
-- The client calls get_chat_unread_counts() whenever the chat list snapshot
-- changes (the messages trigger already bumps chats.updated_at, which fires the
-- realtime chats subscription) and mark_chat_read() when a chat is opened.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Per-user unread counts
-- ---------------------------------------------------------------------------
create or replace function public.get_chat_unread_counts(p_user_id uuid)
returns table(chat_id text, unread_count integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Callers may only read their own unread counts (service_role bypasses).
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'not authorized';
  end if;

  return query
  select c.id::text as chat_id,
         count(m.id)::int as unread_count
  from public.chats c
  left join public.chat_reads r
    on r.chat_id = c.id::text
   and r.user_id = p_user_id
  left join public.messages m
    on m.chat_id::text = c.id::text
   and m.sender_id is not null
   and m.sender_id <> p_user_id
   and coalesce(m.type, 'text') not in ('typing', 'presence', 'system')
   and (r.last_read_at is null or m.created_at > r.last_read_at)
  where p_user_id::text = any(coalesce(c.participants, '{}'::text[]))
  group by c.id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Mark a chat read for the caller
-- ---------------------------------------------------------------------------
create or replace function public.mark_chat_read(p_chat_id text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not exists (
    select 1 from public.chats c
    where c.id::text = p_chat_id
      and auth.uid()::text = any(coalesce(c.participants, '{}'::text[]))
  ) then
    raise exception 'not authorized for chat';
  end if;

  insert into public.chat_reads (chat_id, user_id, last_read_at, updated_at)
  values (p_chat_id, auth.uid(), now(), now())
  on conflict (chat_id, user_id)
  do update set last_read_at = now(), updated_at = now();
end;
$function$;

-- Ensure a unique constraint exists for the upsert above.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.chat_reads'::regclass
      and contype in ('p', 'u')
      and conname = 'chat_reads_chat_id_user_id_key'
  ) and not exists (
    select 1 from pg_indexes
    where tablename = 'chat_reads'
      and indexdef ilike '%unique%'
      and indexdef ilike '%chat_id%'
      and indexdef ilike '%user_id%'
  ) then
    begin
      alter table public.chat_reads
        add constraint chat_reads_chat_id_user_id_key unique (chat_id, user_id);
    exception when others then null;
    end;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Grants
-- ---------------------------------------------------------------------------
revoke execute on function public.get_chat_unread_counts(uuid) from public;
revoke execute on function public.mark_chat_read(text) from public;
revoke execute on function public.get_chat_unread_counts(uuid) from anon;
revoke execute on function public.mark_chat_read(text) from anon;
grant execute on function public.get_chat_unread_counts(uuid) to authenticated;
grant execute on function public.mark_chat_read(text) to authenticated;
