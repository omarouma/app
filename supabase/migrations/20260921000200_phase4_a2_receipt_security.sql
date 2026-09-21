-- ============================================================================
-- GaGa Chat — Phase 4 Milestone A2 (part 2)
-- Receipt RPC authorization hardening
-- ----------------------------------------------------------------------------
-- FINDING: public.mark_messages_read(p_chat_id text, p_user_id uuid) is
-- SECURITY DEFINER and performs NO authorization check. Any authenticated
-- caller could pass an arbitrary p_user_id and mark another user's messages as
-- read, corrupting read receipts and unread counts for every participant.
--
-- The single-argument overload mark_messages_read(p_chat_id text) is correct:
-- it derives the actor from auth.uid() and verifies chat membership.
--
-- FIX: replace the two-argument overload with an authorization-checked version
-- that (a) requires authentication, (b) only permits acting on your own
-- receipts, and (c) verifies chat membership.
-- ============================================================================

create or replace function public.mark_messages_read(
  p_chat_id text,
  p_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  updated_count integer;
  v_actor uuid := auth.uid();
begin
  -- (a) Must be authenticated.
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- (b) A caller may only mark their OWN receipts. Service role (auth.uid() is
  --     null but the request carries the service key) is handled by the
  --     authentication check above, so no bypass is possible from a client.
  if p_user_id is distinct from v_actor then
    raise exception 'not authorized to mark receipts for another user'
      using errcode = '42501';
  end if;

  -- (c) Must actually be a participant of the chat.
  if not exists (
    select 1 from public.chats c
    where c.id::text = p_chat_id
      and v_actor::text = any(coalesce(c.participants, '{}'::text[]))
  ) then
    raise exception 'not authorized for chat' using errcode = '42501';
  end if;

  update public.messages
     set delivery_status = 'read',
         read = true,
         read_at = timezone('utc', now()),
         updated_at = timezone('utc', now())
   where chat_id = p_chat_id
     and sender_id <> v_actor
     and (delivery_status is null or delivery_status in ('sent', 'delivered'));

  get diagnostics updated_count = row_count;

  -- Keep the per-chat read cursor in sync so unread counts stay correct.
  insert into public.chat_reads (chat_id, user_id, last_read_at, updated_at)
  values (p_chat_id, v_actor, timezone('utc', now()), timezone('utc', now()))
  on conflict (chat_id, user_id)
  do update set last_read_at = timezone('utc', now()),
                updated_at = timezone('utc', now());

  return updated_count;
end;
$function$;

revoke all on function public.mark_messages_read(text, uuid) from public;
grant execute on function public.mark_messages_read(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Same audit for the sibling receipt RPCs: confirm they are locked down.
-- ---------------------------------------------------------------------------
-- mark_messages_delivered(p_chat_id) already checks auth.uid() and membership.
-- mark_chat_read(p_chat_id) already checks auth.uid() and membership.
-- get_chat_unread_counts(p_user_id) already rejects cross-user reads.
-- No change required for those three; recorded here so the audit is explicit.

-- ---------------------------------------------------------------------------
-- Harden the single-argument overload too: it currently sets read = true but
-- does not advance the chat_reads cursor, which makes get_chat_unread_counts()
-- disagree with the message rows. Align both.
-- ---------------------------------------------------------------------------
create or replace function public.mark_messages_read(p_chat_id text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.chats c
    where c.id::text = p_chat_id
      and auth.uid()::text = any(coalesce(c.participants, '{}'::text[]))
  ) then
    raise exception 'not authorized for chat' using errcode = '42501';
  end if;

  update public.messages m
     set read = true,
         read_at = timezone('utc', now()),
         delivery_status = 'read',
         updated_at = timezone('utc', now())
   where m.chat_id = p_chat_id
     and m.sender_id <> auth.uid()
     and coalesce(m.read, false) = false;

  insert into public.chat_reads (chat_id, user_id, last_read_at, updated_at)
  values (p_chat_id, auth.uid(), timezone('utc', now()), timezone('utc', now()))
  on conflict (chat_id, user_id)
  do update set last_read_at = timezone('utc', now()),
                updated_at = timezone('utc', now());
end;
$function$;

revoke all on function public.mark_messages_read(text) from public;
grant execute on function public.mark_messages_read(text) to authenticated;

-- ---------------------------------------------------------------------------
-- mark_messages_delivered: also advance nothing but ensure it cannot be used
-- to mark your OWN messages delivered (which would fake a receipt).
-- ---------------------------------------------------------------------------
create or replace function public.mark_messages_delivered(p_chat_id text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.chats c
    where c.id::text = p_chat_id
      and auth.uid()::text = any(coalesce(c.participants, '{}'::text[]))
  ) then
    raise exception 'not authorized for chat' using errcode = '42501';
  end if;

  update public.messages m
     set delivery_status = 'delivered',
         delivered_at = timezone('utc', now()),
         updated_at = timezone('utc', now())
   where m.chat_id = p_chat_id
     and m.sender_id <> auth.uid()
     and m.delivery_status = 'sent';
end;
$function$;

revoke all on function public.mark_messages_delivered(text) from public;
grant execute on function public.mark_messages_delivered(text) to authenticated;
