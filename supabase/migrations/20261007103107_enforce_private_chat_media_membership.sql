-- Enforce conversation membership for private chat media reads.
-- Owners retain access immediately after upload; other users may read an object
-- only when it is referenced by a non-destroyed message in a chat they belong to.
-- The stored object path must also resolve back to the message sender, preventing
-- a user from granting themselves access by inserting another user's object URL.

create or replace function gaga_private.can_read_chat_media(p_bucket text, p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with path_info as (
    select
      '/object/public/' || p_bucket || '/' || p_name as suffix,
      case
        when split_part(p_name,'/',1) ~* '^[0-9a-f-]{36}$'
          then split_part(p_name,'/',1)
        when split_part(p_name,'/',1) = 'messages'
          and split_part(p_name,'/',2) ~* '^[0-9a-f-]{36}$'
          then split_part(p_name,'/',2)
        else null
      end as path_owner
  )
  select
    auth.uid() is not null
    and p_bucket in ('chat-media','voice-messages')
    and (
      (select path_owner = auth.uid()::text from path_info)
      or exists (
        select 1
        from public.messages m
        join public.chats c on c.id = m.chat_id
        cross join path_info p
        where auth.uid()::text = any(coalesce(c.participants,'{}'::text[]))
          and p.path_owner = m.sender_id::text
          and coalesce(m.destroyed,false) = false
          and (
            right(coalesce(m.media_url,''), length(p.suffix)) = p.suffix
            or exists (
              select 1
              from unnest(coalesce(m.media_urls,'{}'::text[])) u
              where right(coalesce(u,''), length(p.suffix)) = p.suffix
            )
            or right(coalesce(m.metadata->>'thumbnail',''), length(p.suffix)) = p.suffix
          )
      )
    );
$$;

revoke all on function gaga_private.can_read_chat_media(text,text) from public, anon;
grant execute on function gaga_private.can_read_chat_media(text,text) to authenticated;

drop policy if exists gaga_objects_chat_read on storage.objects;
create policy gaga_objects_chat_read
on storage.objects
for select
to authenticated
using (
  bucket_id in ('chat-media','voice-messages')
  and gaga_private.can_read_chat_media(bucket_id,name)
);
