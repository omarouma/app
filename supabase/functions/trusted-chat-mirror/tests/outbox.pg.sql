\set ON_ERROR_STOP on
-- Ephemeral PostgreSQL 17 CI only. No Supabase project or credentials are used.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create table public.chats (
  id text primary key,
  type text not null,
  participants text[] not null,
  updated_at timestamptz not null default now()
);
\i supabase/migrations/20261020125000_trusted_firebase_chat_outbox.sql

-- Disabled-by-default is a hard safety invariant.
insert into public.chats values
  ('chat_off', 'direct', array['alice','bob'],now());
do $$
begin
  if exists (select 1 from gaga_private.firebase_chat_sync_outbox) then
    raise exception 'Outbox accidentally enabled at install';
  end if;
  if (select enabled from gaga_private.firebase_mirror_settings where singleton) then
    raise exception 'Firebase sync should be disabled by default';
  end if;
  if has_table_privilege('authenticated','gaga_private.firebase_chat_sync_outbox','SELECT')
     or has_table_privilege('anon','gaga_private.firebase_chat_sync_outbox','INSERT')
     or has_function_privilege('authenticated','public.gaga_claim_chat_mirror_sync(integer)','EXECUTE')
     or has_function_privilege('anon','public.gaga_finish_chat_mirror_sync(text,bigint,uuid,boolean,text)','EXECUTE')
  then raise exception 'Exposed private mirror queue or service RPC'; end if;
end
$$;

update gaga_private.firebase_mirror_settings
set enabled=true, updated_at=now() where singleton=true;
insert into public.chats values ('chat_on','direct',array['alice','bob'],now());
do $$
begin
  if (select revision from gaga_private.firebase_chat_sync_outbox where chat_id='chat_on') <> 1 then
    raise exception 'Missing INSERT event';
  end if;
end
$$;

-- Non-membership metadata changes must NOT enqueue unnecessary work.
update public.chats set updated_at=now() where id='chat_on';
do $$
begin
  if (select revision from gaga_private.firebase_chat_sync_outbox where chat_id='chat_on') <> 1 then
    raise exception 'Metadata-only UPDATE wrongly enqueued';
  end if;
end
$$;

update public.chats set participants=array['alice','charlie'] where id='chat_on';
update public.chats set type='group' where id='chat_on';
do $$
begin
  if (select revision from gaga_private.firebase_chat_sync_outbox where chat_id='chat_on') <> 3 then
    raise exception 'Missing UPDATE membership or chat type event';
  end if;
end
$$;

-- Real-time gateway request principal must be service_role. Function grant
-- prevents clients calling it, and the function itself also checks JWT role.
do $$
begin
  perform public.gaga_claim_chat_mirror_sync(1);
  raise exception 'Missing service_role role check';
exception when insufficient_privilege then null;
end
$$;
-- Modern PostgREST supplies a single JSON setting; legacy scalar claim
-- must not override an explicit unprivileged JSON role.
select set_config('request.jwt.claim.role','service_role',false);
select set_config('request.jwt.claims','{"role":"authenticated","sub":"11111111-1111-4111-8111-111111111111"}',false);
do $service_claim$
begin
  perform public.gaga_claim_chat_mirror_sync(1);
  raise exception 'Modern unprivileged JWT claim bypassed the service gate';
exception when insufficient_privilege then null;
end
$service_claim$;
do $service_finish$
begin
  perform public.gaga_finish_chat_mirror_sync(
    'chat_on',1,'11111111-1111-4111-8111-111111111111',true
  );
  raise exception 'Modern unprivileged JWT claim bypassed finish RPC gate';
exception when insufficient_privilege then null;
end
$service_finish$;
select set_config('request.jwt.claims','{"role":"service_role"}',false);

do $$
declare j record;
begin
  select * into j from public.gaga_claim_chat_mirror_sync(1);
  if j.chat_id <> 'chat_on' or j.revision <> 3 or j.lease_token is null then
    raise exception 'Unexpected first lease';
  end if;
  -- A second call cannot claim an unexpired lease.
  if exists (select 1 from public.gaga_claim_chat_mirror_sync(1)) then
    raise exception 'Concurrent claim returned an already leased job';
  end if;
  -- A later Supabase group membership update invalidates any leased revision.
  update public.chats set participants=array['alice','charlie','david'] where id='chat_on';
  if public.gaga_finish_chat_mirror_sync('chat_on',j.revision,j.lease_token,true) then
    raise exception 'Stale success acknowledgment incorrectly removed new event';
  end if;
end
$$;

do $$
declare j record;
begin
  select * into j from public.gaga_claim_chat_mirror_sync(1);
  if j.revision <> 4 then raise exception 'Latest revision not claimable'; end if;
  if not public.gaga_finish_chat_mirror_sync('chat_on',j.revision,j.lease_token,false,'FIRESTORE_WRITE_FAILED') then
    raise exception 'Retryable failure not acknowledged';
  end if;
  if (select last_error_code from gaga_private.firebase_chat_sync_outbox where chat_id='chat_on')
     <> 'FIRESTORE_WRITE_FAILED' then
    raise exception 'Safe error category not preserved';
  end if;
  -- Reset delay in this disposable test DB only, then retry.
  update gaga_private.firebase_chat_sync_outbox
  set next_attempt_at = now() - interval '1 second' where chat_id='chat_on';
  select * into j from public.gaga_claim_chat_mirror_sync(1);
  if not public.gaga_finish_chat_mirror_sync('chat_on',j.revision,j.lease_token,true) then
    raise exception 'Successful retry not acknowledged';
  end if;
  if exists (select 1 from gaga_private.firebase_chat_sync_outbox where chat_id='chat_on') then
    raise exception 'Successful event was not removed from queue';
  end if;
end
$$;

delete from public.chats where id='chat_on';
do $$
begin
  if not exists (select 1 from gaga_private.firebase_chat_sync_outbox where chat_id='chat_on') then
    raise exception 'DELETE did not queue mirror access revocation';
  end if;
end
$$;
select 'trusted_firestore_outbox_contracts_pass' as result;
