-- GaGa — Call events as first-class chat timeline items.
--
-- One call session (a call_history row) maps to exactly ONE chat timeline item.
-- The item is inserted when the call starts and UPDATED (never re-inserted) as
-- the call progresses: calling → connected → ended / missed / declined /
-- cancelled / busy / failed.
--
-- Idempotency is enforced by a partial unique index on (chat_id, call_session_id)
-- so a duplicate insert collapses into the existing row instead of creating a
-- second bubble.

alter table public.messages
  add column if not exists call_session_id text;

alter table public.messages
  add column if not exists call_data jsonb;

-- One logical call-history record per chat timeline item.
create unique index if not exists messages_chat_call_session_uq
  on public.messages (chat_id, call_session_id)
  where call_session_id is not null;

create index if not exists idx_messages_call_session
  on public.messages (call_session_id)
  where call_session_id is not null;

-- Ensure the message type check accepts 'call' (idempotent re-assert).
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'messages_type_check'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages drop constraint messages_type_check;
  end if;
  alter table public.messages
    add constraint messages_type_check
    check (
      type is null
      or type in (
        'text', 'image', 'video', 'audio', 'voice', 'file', 'document',
        'location', 'contact', 'sticker', 'gif', 'system', 'call',
        'poll', 'link'
      )
    ) not valid;
end $$;
