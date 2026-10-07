-- Cross-device synchronization for per-user hidden conversations.
create or replace function public.gaga_hidden_chats()
returns table(chat_id text)
language sql stable security definer set search_path='' as $$
  select h.chat_id
  from public.chat_hidden_users h
  join public.chats c on c.id=h.chat_id
  where auth.uid() is not null
    and gaga_private.session_active()
    and h.user_id=auth.uid()
    and c.updated_at <= h.hidden_at;
$$;
revoke all on function public.gaga_hidden_chats() from public,anon;
grant execute on function public.gaga_hidden_chats() to authenticated;
