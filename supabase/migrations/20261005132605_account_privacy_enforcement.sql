-- Account privacy is authoritative on the server. Existing user-settings JSON
-- is retained; a safe projection replaces other-account raw profile reads.
create schema if not exists gaga_private;
revoke all on schema gaga_private from public, anon;
grant usage on schema gaga_private to authenticated, service_role;

create or replace function gaga_private.session_active() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from auth.sessions s where s.user_id=auth.uid()
 and s.id::text=auth.jwt()->>'session_id' and (s.not_after is null or s.not_after>now()))
$$;
create or replace function public.gaga_session_active() returns boolean
language sql stable security invoker set search_path='' as $$ select gaga_private.session_active() $$;


-- Preserve restrictive legacy choices before introducing the new audiences.
update public.user_settings set privacy_settings =
 jsonb_strip_nulls(jsonb_build_object(
 'read_receipts',case when lower(privacy_settings->>'readReceipts')='false' then false end,
 'online_status',case when lower(privacy_settings->>'showOnlineStatus')='false'
   or lower(privacy_settings->>'hideOnlineStatus')='true' then 'NOBODY' end,
 'last_seen',case when lower(privacy_settings->>'lastSeen') in ('nobody','none','false') then 'NOBODY' end,
 'profile_photo',case when lower(privacy_settings->>'profilePhoto') in ('nobody','none','private') then 'NOBODY' end,
 'bio',case when lower(privacy_settings->>'bioVisibility') in ('nobody','none','private') then 'NOBODY' end,
 'calls',case when lower(privacy_settings->>'whoCanCall') in ('nobody','none') then 'NOBODY' end,
 'friend_list',case when lower(privacy_settings->>'hideFriendList')='true' then 'ONLY_ME' end,
 'discover_id',case when lower(privacy_settings->>'discoverable')='false' then false end
 )) || coalesce(privacy_settings,'{}'::jsonb)
where privacy_settings is not null;

create or replace function gaga_private.policy(target uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('last_seen','FRIENDS','online_status','SAME_AS_LAST_SEEN',
 'profile_photo','FRIENDS','bio','FRIENDS','friend_list','ONLY_ME','phone','ONLY_ME',
 'email','ONLY_ME','messages','FRIENDS','calls','FRIENDS','group_invitations','APPROVAL',
 'read_receipts',true,'typing_indicator',true,'discover_phone',false,'discover_email',false,
 'discover_id',true,'recommendations',false) || coalesce((select privacy_settings from public.user_settings where user_id=target),'{}'::jsonb)
$$;
create or replace function gaga_private.friends(a uuid,b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select a=b or (exists(select 1 from public.friendships where user_id=a and friend_id=b)
 and exists(select 1 from public.friendships where user_id=b and friend_id=a))
$$;
create or replace function gaga_private.blocked(a uuid,b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.blocked_users where (blocker_id=a and blocked_id=b) or (blocker_id=b and blocked_id=a))
$$;
create or replace function gaga_private.visible(owner uuid,viewer uuid,audience text) returns boolean
language sql stable security definer set search_path = '' as $$
 select viewer is not null and (owner=viewer or (not gaga_private.blocked(owner,viewer) and
 (audience='EVERYONE' or (audience='FRIENDS' and gaga_private.friends(owner,viewer)))))
$$;
create or replace function gaga_private.get_privacy() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
 if auth.uid() is null or not gaga_private.session_active() then raise insufficient_privilege; end if;
 return gaga_private.policy(auth.uid());
end $$;
create or replace function public.gaga_get_privacy() returns jsonb
language sql stable security invoker set search_path = '' as $$ select gaga_private.get_privacy() $$;

create or replace function gaga_private.save_privacy(patch jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare k text; v jsonb; allowed text[];
begin
 if auth.uid() is null or not gaga_private.session_active() then raise insufficient_privilege; end if;
 if patch is null or jsonb_typeof(patch)<>'object' or octet_length(patch::text)>4096 then raise exception 'Invalid privacy patch'; end if;
 for k,v in select * from jsonb_each(patch) loop
  if k in ('read_receipts','typing_indicator','discover_phone','discover_email','discover_id','recommendations') then
   if jsonb_typeof(v)<>'boolean' then raise exception 'Invalid privacy boolean'; end if;
  else
   allowed := case
    when k in ('last_seen','profile_photo','bio','calls') then array['EVERYONE','FRIENDS','NOBODY']
    when k='online_status' then array['EVERYONE','SAME_AS_LAST_SEEN','NOBODY']
    when k in ('friend_list','phone','email') then array['EVERYONE','FRIENDS','ONLY_ME']
    when k='messages' then array['EVERYONE','FRIENDS','REQUESTS']
    when k='group_invitations' then array['FRIENDS','APPROVAL'] else null end;
   if allowed is null or jsonb_typeof(v)<>'string' or not ((v#>>'{}')=any(allowed)) then raise exception 'Invalid privacy audience'; end if;
  end if;
 end loop;
 insert into public.user_settings(user_id,privacy_settings) values(auth.uid(),patch)
 on conflict(user_id) do update set privacy_settings=coalesce(public.user_settings.privacy_settings,'{}')||excluded.privacy_settings,updated_at=now();
 return gaga_private.policy(auth.uid());
end $$;
create or replace function public.gaga_save_privacy(patch jsonb) returns jsonb
language sql security invoker set search_path = '' as $$ select gaga_private.save_privacy(patch) $$;

create or replace function gaga_private.profiles(ids uuid[],q text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
 if auth.uid() is null or not gaga_private.session_active() then raise insufficient_privilege; end if;
 if cardinality(ids)>200 or length(q)>128 then raise exception 'Profile query is too large'; end if;
 select coalesce(jsonb_agg(profile),'[]'::jsonb) into result from (
 select jsonb_build_object('id',u.id,'name',u.name,'display_name',u.display_name,'username',u.username,
 'avatar',case when gaga_private.visible(u.id,auth.uid(),p->>'profile_photo') then u.avatar end,
 'cover_image',case when gaga_private.visible(u.id,auth.uid(),p->>'profile_photo') then u.cover_image end,
 'cover_video',case when gaga_private.visible(u.id,auth.uid(),p->>'profile_photo') then u.cover_video end,
 'bio',case when gaga_private.visible(u.id,auth.uid(),p->>'bio') then u.bio end,
 'status_message',case when gaga_private.visible(u.id,auth.uid(),p->>'bio') then u.status_message end,
 'email',case when gaga_private.visible(u.id,auth.uid(),p->>'email') then u.email end,
 'phone',case when gaga_private.visible(u.id,auth.uid(),p->>'phone') then u.phone end,
 'status',case when gaga_private.visible(u.id,auth.uid(),case when p->>'online_status'='SAME_AS_LAST_SEEN' then p->>'last_seen' else p->>'online_status' end) then u.status else 'offline' end,
 'last_seen',case when gaga_private.visible(u.id,auth.uid(),p->>'last_seen') then u.last_seen end,
 'friends',case when gaga_private.visible(u.id,auth.uid(),p->>'friend_list') then u.friends end,
 'friend_count',case when gaga_private.visible(u.id,auth.uid(),p->>'friend_list') then u.friend_count end,
 'followers',case when gaga_private.visible(u.id,auth.uid(),p->>'friend_list') then u.followers end,
 'following',case when gaga_private.visible(u.id,auth.uid(),p->>'friend_list') then u.following end,
 'website',u.website,'is_verified',u.is_verified,'is_premium',u.is_premium,'created_at',u.created_at) as profile
 from public.users u cross join lateral (select gaga_private.policy(u.id) as p) policy
 where not gaga_private.blocked(u.id,auth.uid()) and
 ((ids is not null and u.id=any(ids)) or (ids is null and q is not null and
 ((coalesce((p->>'discover_id')::boolean,false) and lower(u.username)=lower(trim(q)))
 or (coalesce((p->>'discover_phone')::boolean,false) and u.phone=trim(q))
 or (coalesce((p->>'discover_email')::boolean,false) and lower(u.email)=lower(trim(q)))
 or ((coalesce((p->>'recommendations')::boolean,false) or gaga_private.friends(u.id,auth.uid())) and
 (u.display_name ilike '%'||q||'%' or u.username ilike '%'||q||'%')))))
 order by u.id limit 200) projected;
 return result;
end $$;
create or replace function public.gaga_profiles(ids uuid[] default null,q text default null) returns jsonb
language sql stable security invoker set search_path = '' as $$ select gaga_private.profiles(ids,q) $$;

-- Restrictive policies cannot be overridden by older permissive policies.
create policy gaga_users_private_raw on public.users as restrictive for select to authenticated using(id=auth.uid());
create policy gaga_settings_private_raw on public.user_settings as restrictive for select to authenticated using(user_id=auth.uid());
create policy gaga_profiles_private_raw on public.profiles as restrictive for select to authenticated using(id=auth.uid());
create policy gaga_friend_graph_privacy on public.friendships as restrictive for select to authenticated using(
 user_id=auth.uid() or gaga_private.visible(user_id,auth.uid(),gaga_private.policy(user_id)->>'friend_list'));

create or replace function gaga_private.call_allowed(caller uuid,callee uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select caller is not null and callee is not null and caller<>callee and not gaga_private.blocked(caller,callee)
 and gaga_private.visible(callee,caller,gaga_private.policy(callee)->>'calls')
$$;
create or replace function public.gaga_can_call(callee uuid) returns boolean
language sql stable security invoker set search_path = '' as $$ select gaga_private.session_active() and gaga_private.call_allowed(auth.uid(),callee) $$;
create or replace function gaga_private.guard_call() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if not gaga_private.call_allowed(new.caller_id,new.callee_id) then raise exception 'CALL_NOT_ALLOWED' using errcode='42501'; end if;
 return new;
end $$;
create trigger gaga_call_privacy before insert on public.call_history for each row execute function gaga_private.guard_call();

revoke all on all functions in schema gaga_private from public, anon;
grant execute on all functions in schema gaga_private to authenticated, service_role;
revoke all on function public.gaga_get_privacy(),public.gaga_save_privacy(jsonb),public.gaga_profiles(uuid[],text),public.gaga_can_call(uuid) from public,anon;
grant execute on function public.gaga_get_privacy(),public.gaga_save_privacy(jsonb),public.gaga_profiles(uuid[],text),public.gaga_can_call(uuid) to authenticated;

revoke select on public.users,public.user_settings,public.profiles from anon,public;
create policy gaga_presence_audience on public.presence as restrictive for select to authenticated using(
 gaga_private.visible(user_id,auth.uid(),case when gaga_private.policy(user_id)->>'online_status'='SAME_AS_LAST_SEEN' then gaga_private.policy(user_id)->>'last_seen' else gaga_private.policy(user_id)->>'online_status' end));
create policy gaga_typing_audience on public.typing as restrictive for select to authenticated using(
 user_id=auth.uid() or (coalesce((gaga_private.policy(user_id)->>'typing_indicator')::boolean,false) and not gaga_private.blocked(user_id,auth.uid())));
create policy gaga_receipt_audience on public.chat_reads as restrictive for select to authenticated using(
 user_id=auth.uid() or (coalesce((gaga_private.policy(user_id)->>'read_receipts')::boolean,false) and not gaga_private.blocked(user_id,auth.uid())));
create policy gaga_saved_messages_owner on public.saved_messages as restrictive for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

create or replace function gaga_private.validate_call(call_id uuid,caller uuid,incoming boolean) returns boolean
language sql stable security definer set search_path = '' as $$
 select gaga_private.session_active() and exists(select 1 from public.call_history h where h.id=call_id
 and (case when incoming then h.callee_id=auth.uid() else auth.uid() in (h.caller_id,h.callee_id) end)
 and (caller is null or h.caller_id=caller)
 and (not incoming or h.status in ('calling','ringing','connecting'))
 and gaga_private.call_allowed(h.caller_id,h.callee_id)
 and ((h.status in ('calling','ringing','connecting','accepted') and h.created_at>now()-interval '2 minutes')
 or (h.status in ('connected','reconnecting') and h.created_at>now()-interval '24 hours')))
$$;
create or replace function public.gaga_validate_call(call_id uuid,caller uuid default null,incoming boolean default false) returns boolean
language sql stable security invoker set search_path = '' as $$ select gaga_private.validate_call(call_id,caller,incoming) $$;
revoke all on function gaga_private.validate_call(uuid,uuid,boolean),public.gaga_validate_call(uuid,uuid,boolean) from public,anon;
grant execute on function gaga_private.validate_call(uuid,uuid,boolean),public.gaga_validate_call(uuid,uuid,boolean) to authenticated;

-- Pending requests are a separate inbox. Before acceptance only plain text is
-- retained there; media, normal delivery, typing and calling remain restricted.
create table public.gaga_message_requests (
 id uuid primary key default gen_random_uuid(), sender_id uuid not null references public.users(id) on delete cascade,
 recipient_id uuid not null references public.users(id) on delete cascade, chat_id text not null references public.chats(id) on delete cascade,
 preview text not null check(length(preview)<=2000), status text not null default 'pending' check(status in ('pending','accepted','deleted')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(sender_id,recipient_id,chat_id), check(sender_id<>recipient_id)
);
alter table public.gaga_message_requests enable row level security;
revoke all on public.gaga_message_requests from public,anon,authenticated;
grant select on public.gaga_message_requests to authenticated;
create policy gaga_request_participants on public.gaga_message_requests for select to authenticated using(auth.uid() in (sender_id,recipient_id));
create index gaga_request_inbox on public.gaga_message_requests(recipient_id,status,updated_at desc);

create or replace function gaga_private.message_allowed(sender uuid,recipient uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select sender=recipient or (not gaga_private.blocked(sender,recipient) and (
 gaga_private.policy(recipient)->>'messages'='EVERYONE' or gaga_private.friends(sender,recipient) or
 (gaga_private.policy(recipient)->>'messages'='REQUESTS' and exists(select 1 from public.gaga_message_requests where sender_id=sender and recipient_id=recipient and status='accepted'))))
$$;
create or replace function gaga_private.route_text(chat text,body text) returns boolean
language plpgsql security definer set search_path='' as $$
declare target uuid; c public.chats%rowtype;
begin
 if auth.uid() is null or not gaga_private.session_active() then raise insufficient_privilege; end if;
 select * into c from public.chats where id=chat and auth.uid()::text=any(participants);
 if not found then raise insufficient_privilege; end if;
 if c.type not in ('direct','dm') then return false; end if;
 if cardinality(c.participants)<>2 then raise exception 'Invalid direct conversation'; end if;
 select x::uuid into target from unnest(c.participants) x where x<>auth.uid()::text limit 1;
 if gaga_private.message_allowed(auth.uid(),target) then return false; end if;
 if gaga_private.blocked(auth.uid(),target) or gaga_private.policy(target)->>'messages'<>'REQUESTS' then raise exception 'This person is not accepting messages from you' using errcode='42501'; end if;
 if body is null or length(trim(body)) not between 1 and 2000 then raise exception 'A message request must contain 1 to 2000 characters'; end if;
 if exists(select 1 from public.gaga_message_requests where sender_id=auth.uid() and recipient_id=target and chat_id=chat and status='deleted') then raise exception 'This message request was declined' using errcode='42501'; end if;
 insert into public.gaga_message_requests(sender_id,recipient_id,chat_id,preview) values(auth.uid(),target,chat,trim(body))
 on conflict(sender_id,recipient_id,chat_id) do nothing;
 return true;
end $$;
create or replace function public.gaga_route_text(chat text,body text) returns boolean language sql security invoker set search_path='' as $$ select gaga_private.route_text(chat,body) $$;
create or replace function gaga_private.message_requests() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not gaga_private.session_active() then raise insufficient_privilege; end if;
 return coalesce((select jsonb_agg(x) from (select r.id,r.sender_id,r.chat_id,r.preview,r.status,coalesce(u.display_name,u.name,u.username,'GaGa User') as sender_name
 from public.gaga_message_requests r join public.users u on u.id=r.sender_id where r.recipient_id=auth.uid() and r.status='pending' and not gaga_private.blocked(r.sender_id,auth.uid()) order by r.updated_at desc limit 100) x),'[]'::jsonb);
end $$;
create or replace function public.gaga_message_requests() returns jsonb language sql stable security invoker set search_path='' as $$ select gaga_private.message_requests() $$;
create or replace function gaga_private.respond_request(request_id uuid,action text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.gaga_message_requests%rowtype;
begin
 if auth.uid() is null or not gaga_private.session_active() then raise insufficient_privilege; end if;
 if action not in ('accept','delete','block') then raise exception 'Invalid request action'; end if;
 select * into r from public.gaga_message_requests where id=request_id and recipient_id=auth.uid() for update;
 if not found then raise insufficient_privilege; end if;
 if action='accept' and gaga_private.blocked(r.sender_id,auth.uid()) then raise insufficient_privilege; end if;
 update public.gaga_message_requests set status=case when action='accept' then 'accepted' else 'deleted' end,updated_at=now() where id=r.id;
 if action='block' then
  insert into public.blocked_users(blocker_id,blocked_id) select auth.uid(),r.sender_id where not exists(select 1 from public.blocked_users where blocker_id=auth.uid() and blocked_id=r.sender_id);
 end if;
end $$;
create or replace function public.gaga_respond_message_request(request_id uuid,action text) returns void language sql security invoker set search_path='' as $$ select gaga_private.respond_request(request_id,action) $$;

create or replace function gaga_private.guard_message() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipient text; c public.chats%rowtype;
begin
 select * into c from public.chats where id=new.chat_id;
 if not found or not new.sender_id::text=any(c.participants) then raise insufficient_privilege; end if;
 if c.type in ('direct','dm') then
  for recipient in select x from unnest(c.participants) x where x<>new.sender_id::text loop
   if not gaga_private.message_allowed(new.sender_id,recipient::uuid) then raise exception 'MESSAGE_NOT_ALLOWED' using errcode='42501'; end if;
  end loop;
 end if;
 return new;
end $$;
create trigger gaga_message_privacy before insert on public.messages for each row execute function gaga_private.guard_message();

create or replace function gaga_private.username_available(candidate text) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not gaga_private.session_active() then raise insufficient_privilege; end if;
 if candidate is null or length(candidate) not between 3 and 32 then return false; end if;
 return not exists(select 1 from public.users where lower(username)=lower(trim(candidate)) and id<>auth.uid());
end $$;
create or replace function public.gaga_username_available(candidate text) returns boolean language sql stable security invoker set search_path='' as $$ select gaga_private.username_available(candidate) $$;

revoke all on all functions in schema gaga_private from public,anon;
grant execute on all functions in schema gaga_private to authenticated,service_role;
revoke all on function public.gaga_route_text(text,text),public.gaga_message_requests(),public.gaga_respond_message_request(uuid,text),public.gaga_username_available(text) from public,anon;
grant execute on function public.gaga_route_text(text,text),public.gaga_message_requests(),public.gaga_respond_message_request(uuid,text),public.gaga_username_available(text) to authenticated;
revoke select on public.presence,public.typing,public.chat_reads,public.friendships,public.saved_messages from public,anon;

create or replace function gaga_private.call_allowed(caller uuid,callee uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select caller is not null and callee is not null and caller<>callee and not gaga_private.blocked(caller,callee)
 and gaga_private.visible(callee,caller,gaga_private.policy(callee)->>'calls')
 and (gaga_private.policy(callee)->>'messages'<>'REQUESTS' or gaga_private.friends(caller,callee)
 or exists(select 1 from public.gaga_message_requests where sender_id=caller and recipient_id=callee and status='accepted'))
$$;
revoke all on function gaga_private.call_allowed(uuid,uuid) from public,anon;
grant execute on function gaga_private.call_allowed(uuid,uuid) to authenticated,service_role;

-- Legacy discovery RPCs must use the same opt-ins and projection as search.
-- Phone login must use Auth verification; an anonymous phone-to-email lookup
-- would defeat contact-detail visibility even with correct table RLS.
revoke execute on function public.lookup_phone_login(text) from public,anon,authenticated;
create or replace function gaga_private.contact_profiles(emails text[],phones text[],hashed boolean) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare ids uuid[];
begin
 if auth.uid() is null or not gaga_private.session_active() then raise insufficient_privilege; end if;
 if cardinality(emails)>200 or cardinality(phones)>200 then raise exception 'Contact query is too large'; end if;
 select array_agg(id) into ids from (select u.id from public.users u where u.id<>auth.uid() and not gaga_private.blocked(u.id,auth.uid()) and
 ((coalesce((gaga_private.policy(u.id)->>'discover_email')::boolean,false) and
 (case when hashed then u.email_hash=any(emails) else lower(u.email)=any(select lower(x) from unnest(emails) x) end)) or
 (coalesce((gaga_private.policy(u.id)->>'discover_phone')::boolean,false) and
 (case when hashed then u.phone_hash=any(phones) else u.phone=any(phones) end))) order by u.id limit 200) candidates;
 return gaga_private.profiles(coalesce(ids,'{}'::uuid[]),null);
end $$;
create or replace function public.match_contacts(p_emails text[] default '{}',p_phones text[] default '{}')
returns table(id uuid,name text,display_name text,username text,avatar text,is_verified boolean,is_premium boolean,phone text,email text)
language sql stable security invoker set search_path='' as $$
 select x.id,x.name,x.display_name,x.username,x.avatar,x.is_verified,x.is_premium,x.phone,x.email
 from jsonb_to_recordset(gaga_private.contact_profiles(p_emails,p_phones,false)) x(id uuid,name text,display_name text,username text,avatar text,is_verified boolean,is_premium boolean,phone text,email text)
$$;
create or replace function public.discover_contacts(p_phone_hashes text[] default '{}',p_email_hashes text[] default '{}')
returns table(id uuid,name text,display_name text,username text,avatar text,bio text,is_verified boolean,phone_hash text,email_hash text)
language sql stable security invoker set search_path='' as $$
 select x.id,x.name,x.display_name,x.username,x.avatar,x.bio,x.is_verified,null::text,null::text
 from jsonb_to_recordset(gaga_private.contact_profiles(p_email_hashes,p_phone_hashes,true)) x(id uuid,name text,display_name text,username text,avatar text,bio text,is_verified boolean)
$$;
revoke all on function gaga_private.contact_profiles(text[],text[],boolean),public.match_contacts(text[],text[]),public.discover_contacts(text[],text[]) from public,anon;
grant execute on function gaga_private.contact_profiles(text[],text[],boolean),public.match_contacts(text[],text[]),public.discover_contacts(text[],text[]) to authenticated;

-- Supabase logout/revocation leaves an access JWT valid until expiry. Every
-- exposed RLS table additionally checks the referenced Auth session record.
do $$ declare t record; begin
 for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity loop
  execute format('create policy gaga_active_session on public.%I as restrictive for all to authenticated using(gaga_private.session_active()) with check(gaga_private.session_active())',t.relname);
 end loop;
end $$;
create or replace function gaga_private.account_sessions() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not gaga_private.session_active() then raise insufficient_privilege; end if;
 return coalesce((select jsonb_agg(x) from (select s.id,s.user_agent,s.created_at,
 coalesce(s.refreshed_at::timestamptz,s.updated_at,s.created_at) as last_activity,s.id::text=auth.jwt()->>'session_id' as is_current
 from auth.sessions s where s.user_id=auth.uid() and (s.not_after is null or s.not_after>now()) order by s.created_at desc limit 100) x),'[]'::jsonb);
end $$;
create or replace function public.gaga_account_sessions() returns jsonb language sql stable security invoker set search_path='' as $$ select gaga_private.account_sessions() $$;
create or replace function gaga_private.revoke_session(session_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not gaga_private.session_active() or not exists(select 1 from auth.sessions s where s.user_id=auth.uid() and s.id::text=auth.jwt()->>'session_id' and s.created_at>now()-interval '5 minutes') then raise insufficient_privilege; end if;
 if session_id::text=auth.jwt()->>'session_id' then raise exception 'Use sign out to end the current session'; end if;
 delete from auth.sessions s where s.user_id=auth.uid() and s.id::text<>auth.jwt()->>'session_id' and (session_id is null or s.id=session_id);
end $$;
create or replace function public.gaga_revoke_session(session_id uuid default null) returns void language sql security invoker set search_path='' as $$ select gaga_private.revoke_session(session_id) $$;
create or replace function public.get_my_profile() returns public.users language sql stable security invoker set search_path='' as $$ select u from public.users u where u.id=auth.uid() $$;
revoke all on function gaga_private.session_active(),gaga_private.account_sessions(),gaga_private.revoke_session(uuid),public.gaga_session_active(),public.gaga_account_sessions(),public.gaga_revoke_session(uuid) from public,anon;
grant execute on function gaga_private.session_active(),gaga_private.account_sessions(),gaga_private.revoke_session(uuid),public.gaga_session_active(),public.gaga_account_sessions(),public.gaga_revoke_session(uuid) to authenticated,service_role;

-- Validate the same values even when an older client patches its own JSON directly.
create or replace function gaga_private.validate_privacy(patch jsonb) returns void
language plpgsql set search_path='' as $$
declare k text; v jsonb; allowed text[];
begin
 if patch is null or jsonb_typeof(patch)<>'object' or octet_length(patch::text)>4096 then raise exception 'Invalid privacy patch'; end if;
 for k,v in select * from jsonb_each(patch) loop
  if k in ('read_receipts','typing_indicator','discover_phone','discover_email','discover_id','recommendations') then
   if jsonb_typeof(v)<>'boolean' then raise exception 'Invalid privacy boolean'; end if;
  else
   allowed := case
    when k in ('last_seen','profile_photo','bio','calls') then array['EVERYONE','FRIENDS','NOBODY']
    when k='online_status' then array['EVERYONE','SAME_AS_LAST_SEEN','NOBODY']
    when k in ('friend_list','phone','email') then array['EVERYONE','FRIENDS','ONLY_ME']
    when k='messages' then array['EVERYONE','FRIENDS','REQUESTS']
    when k='group_invitations' then array['FRIENDS','APPROVAL'] else null end;
   if allowed is null or jsonb_typeof(v)<>'string' or not ((v#>>'{}')=any(allowed)) then raise exception 'Invalid privacy audience'; end if;
  end if;
 end loop;
end $$;
create or replace function gaga_private.guard_privacy_settings() returns trigger
language plpgsql security definer set search_path='' as $$
declare patch jsonb;
begin
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into patch
 from jsonb_each(coalesce(new.privacy_settings,'{}'::jsonb))
 where key=any(array['last_seen','online_status','profile_photo','bio','friend_list','phone','email','messages','calls','group_invitations','read_receipts','typing_indicator','discover_phone','discover_email','discover_id','recommendations']);
 perform gaga_private.validate_privacy(patch);
 return new;
end $$;
create trigger gaga_privacy_settings_validation before insert or update of privacy_settings on public.user_settings
for each row execute function gaga_private.guard_privacy_settings();
revoke all on function gaga_private.validate_privacy(jsonb),gaga_private.guard_privacy_settings() from public,anon,authenticated;

create or replace function gaga_private.report_chat_user(chat text,reason text) returns void
language plpgsql security definer set search_path='' as $$
declare c public.chats%rowtype; target uuid;
begin
 if not gaga_private.session_active() then raise insufficient_privilege; end if;
 if reason not in ('Spam','Harassment','Scam','Other') then raise exception 'Select a report reason'; end if;
 select * into c from public.chats where id=chat;
 if not found or c.type not in ('direct','dm') or cardinality(c.participants)<>2 or not auth.uid()::text=any(c.participants) then raise insufficient_privilege; end if;
 select x::uuid into target from unnest(c.participants) x where x<>auth.uid()::text;
 if exists(select 1 from public.reports where reporter_id=auth.uid() and reported_id=target and created_at>now()-interval '1 minute') then raise exception 'Please wait before submitting another report'; end if;
 insert into public.reports(reporter_id,reported_id,reason,details,status,target_type) values(auth.uid(),target,reason,'User report from direct chat; no message content submitted.','pending','user');
end $$;
create or replace function public.gaga_report_chat_user(chat text,reason text) returns void language sql security invoker set search_path='' as $$ select gaga_private.report_chat_user(chat,reason) $$;
revoke all on function gaga_private.report_chat_user(text,text),public.gaga_report_chat_user(text,text) from public,anon;
grant execute on function gaga_private.report_chat_user(text,text),public.gaga_report_chat_user(text,text) to authenticated;

-- Legacy profile views must obey the same underlying RLS as direct reads.
alter view public.public_profiles set (security_invoker=true);

create or replace function gaga_private.require_recent_auth() returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if not gaga_private.session_active() or not exists(select 1 from auth.sessions where user_id=auth.uid() and id::text=auth.jwt()->>'session_id' and created_at>now()-interval '5 minutes') then raise insufficient_privilege; end if;
end $$;
create or replace function gaga_private.deletion_media() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform gaga_private.require_recent_auth();
 return coalesce((select jsonb_agg(x) from (select bucket_id,name from storage.objects where owner=auth.uid() or owner_id=auth.uid()::text or split_part(name,'/',1)=auth.uid()::text order by bucket_id,name limit 200) x),'[]'::jsonb);
end $$;
create or replace function public.gaga_deletion_media() returns jsonb language sql stable security invoker set search_path='' as $$ select gaga_private.deletion_media() $$;
create or replace function gaga_private.delete_account() returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 perform gaga_private.require_recent_auth();
 if jsonb_array_length(gaga_private.deletion_media())<>0 then raise exception 'Use the account deletion service to remove owned media first'; end if;
 delete from public.users where id=uid;
 delete from public.presence where user_id=uid;
 delete from public.user_devices where user_id=uid;
 delete from auth.users where id=uid;
end $$;
create or replace function public.delete_own_account() returns void language sql security invoker set search_path='' as $$ select gaga_private.delete_account() $$;
create or replace function public.delete_user() returns void language sql security invoker set search_path='' as $$ select gaga_private.delete_account() $$;
revoke all on function gaga_private.require_recent_auth(),gaga_private.deletion_media(),gaga_private.delete_account(),public.gaga_deletion_media(),public.delete_own_account(),public.delete_user() from public,anon;
grant execute on function gaga_private.require_recent_auth(),gaga_private.deletion_media(),gaga_private.delete_account(),public.gaga_deletion_media(),public.delete_own_account(),public.delete_user() to authenticated;

-- A sender must not manufacture an accepted request or a mutual friendship.
create policy gaga_friend_request_participants on public.friend_requests as restrictive for select to authenticated
using(from_user_id=auth.uid() or to_user_id=auth.uid());
create policy gaga_friendship_accepted_request on public.friendships as restrictive for insert to authenticated
with check(user_id<>friend_id and not gaga_private.blocked(user_id,friend_id) and exists(
 select 1 from public.friend_requests r where r.status='accepted' and
 ((r.from_user_id=user_id and r.to_user_id=friend_id) or (r.from_user_id=friend_id and r.to_user_id=user_id))));
create or replace function gaga_private.guard_friend_request() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then return new; end if; -- trusted service/admin maintenance
 if not gaga_private.session_active() then raise insufficient_privilege; end if;
 if tg_op='INSERT' then
  if new.from_user_id<>auth.uid() or new.to_user_id=auth.uid() or new.status<>'pending' or gaga_private.blocked(new.from_user_id,new.to_user_id) then raise insufficient_privilege; end if;
 else
  if new.from_user_id<>old.from_user_id or new.to_user_id<>old.to_user_id or new.id<>old.id then raise insufficient_privilege; end if;
  if new.status<>old.status and not ((auth.uid()=old.to_user_id and old.status='pending' and new.status in ('accepted','rejected')) or (auth.uid()=old.from_user_id and old.status='pending' and new.status='cancelled')) then raise insufficient_privilege; end if;
 end if;
 return new;
end $$;
create trigger gaga_friend_request_validation before insert or update on public.friend_requests for each row execute function gaga_private.guard_friend_request();
revoke all on function gaga_private.guard_friend_request() from public,anon,authenticated;
