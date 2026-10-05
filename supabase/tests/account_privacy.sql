-- Run after the migration inside BEGIN/ROLLBACK. All identities are test fixtures.
insert into auth.users(id) values
 ('90abc100-0000-4000-a000-000000000001'),('90abc200-0000-4000-a000-000000000002'),
 ('90abc300-0000-4000-a000-000000000003'),('90abc400-0000-4000-a000-000000000004');
insert into public.users(id,username,display_name,email,phone,avatar,bio,status) values
 ('90abc100-0000-4000-a000-000000000001','privacy_fixture_owner','Owner','owner@example.invalid','+10000000001','owner-photo','owner-bio','online'),
 ('90abc200-0000-4000-a000-000000000002','privacy_fixture_friend','Friend','friend@example.invalid','+10000000002','friend-photo','friend-bio','online'),
 ('90abc300-0000-4000-a000-000000000003','privacy_fixture_stranger','Stranger','stranger@example.invalid','+10000000003','stranger-photo','stranger-bio','online'),
 ('90abc400-0000-4000-a000-000000000004','privacy_fixture_blocked','Blocked','blocked@example.invalid','+10000000004','blocked-photo','blocked-bio','online') on conflict(id) do update set username=excluded.username,display_name=excluded.display_name,email=excluded.email,phone=excluded.phone,avatar=excluded.avatar,bio=excluded.bio,status=excluded.status;
insert into public.friendships(user_id,friend_id) values
 ('90abc100-0000-4000-a000-000000000001','90abc200-0000-4000-a000-000000000002'),
 ('90abc200-0000-4000-a000-000000000002','90abc100-0000-4000-a000-000000000001');
insert into public.blocked_users(blocker_id,blocked_id) values('90abc100-0000-4000-a000-000000000001','90abc400-0000-4000-a000-000000000004');
insert into public.chats(id,type,participants) values('privacy_fixture_chat','direct',array['90abc100-0000-4000-a000-000000000001','90abc300-0000-4000-a000-000000000003']);
alter table public.messages disable trigger gaga_push_on_messages;
insert into auth.sessions(id,user_id,created_at,updated_at,aal) select id,id,now(),now(),'aal1' from auth.users where id::text like '90abc%';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"90abc100-0000-4000-a000-000000000001","session_id":"90abc100-0000-4000-a000-000000000001","role":"authenticated"}',true);
do $$ declare profile jsonb; begin
 if (select count(*) from public.users)<>1 then raise exception 'Raw users leaked'; end if;
 if (select count(*) from public.public_profiles)<>1 then raise exception 'Legacy view leaked'; end if;
 profile := public.gaga_profiles(array['90abc200-0000-4000-a000-000000000002']::uuid[],null)->0;
 if profile->>'email' is not null or profile->>'phone' is not null then raise exception 'Contacts leaked'; end if;
 if profile->>'avatar'<>'friend-photo' then raise exception 'Friend photo incorrectly hidden'; end if;
 if profile->>'friend_count' is not null then raise exception 'Friend graph leaked'; end if;
 if jsonb_array_length(public.gaga_profiles(array['90abc400-0000-4000-a000-000000000004']::uuid[],null))<>0 then raise exception 'Blocked profile leaked'; end if;
 if not public.gaga_can_call('90abc200-0000-4000-a000-000000000002') then raise exception 'Friend call denied'; end if;
 if public.gaga_can_call('90abc300-0000-4000-a000-000000000003') then raise exception 'Stranger call allowed'; end if;
 perform public.gaga_save_privacy('{"messages":"REQUESTS","calls":"NOBODY","read_receipts":false,"typing_indicator":false}');
 if public.gaga_get_privacy()->>'calls'<>'NOBODY' then raise exception 'Privacy not persisted'; end if;
 begin perform public.gaga_save_privacy('{"phone":"INVALID"}'); raise exception 'Invalid setting accepted'; exception when others then if sqlerrm='Invalid setting accepted' then raise; end if; end;
 perform public.gaga_report_chat_user('privacy_fixture_chat','Spam');
 if public.gaga_username_available('privacy_fixture_friend') then raise exception 'Username collision missed'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"90abc300-0000-4000-a000-000000000003","session_id":"90abc300-0000-4000-a000-000000000003","role":"authenticated"}',true);
do $$ declare profile jsonb; begin
 profile := public.gaga_profiles(array['90abc100-0000-4000-a000-000000000001']::uuid[],null)->0;
 if profile->>'avatar' is not null or profile->>'bio' is not null or profile->>'last_seen' is not null then raise exception 'Stranger profile leaked'; end if;
 begin insert into public.friendships(user_id,friend_id) values(auth.uid(),'90abc100-0000-4000-a000-000000000001'); raise exception 'Friendship forged'; exception when insufficient_privilege then null; end;
 begin insert into public.friend_requests(from_user_id,to_user_id,status) values(auth.uid(),'90abc100-0000-4000-a000-000000000001','accepted'); raise exception 'Accepted request forged'; exception when insufficient_privilege then null; end;
 if not public.gaga_route_text('privacy_fixture_chat','Hello, please accept my request') then raise exception 'Request was not routed'; end if;
 begin insert into public.messages(chat_id,sender_id,content,type) values('privacy_fixture_chat',auth.uid(),'Bypass','text'); raise exception 'Unaccepted message delivered'; exception when insufficient_privilege then null; end;
 if public.gaga_can_call('90abc100-0000-4000-a000-000000000001') then raise exception 'Disallowed caller allowed'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"90abc100-0000-4000-a000-000000000001","session_id":"90abc100-0000-4000-a000-000000000001","role":"authenticated"}',true);
do $$ declare r uuid; begin
 if jsonb_array_length(public.gaga_message_requests())<>1 then raise exception 'Inbox did not receive request'; end if;
 r := (public.gaga_message_requests()->0->>'id')::uuid;
 perform public.gaga_respond_message_request(r,'accept');
 if jsonb_array_length(public.gaga_message_requests())<>0 then raise exception 'Accepted request retained in inbox'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"90abc300-0000-4000-a000-000000000003","session_id":"90abc300-0000-4000-a000-000000000003","role":"authenticated"}',true);
do $$ begin
 if public.gaga_route_text('privacy_fixture_chat','Accepted message') then raise exception 'Accepted request still gated'; end if;
 insert into public.messages(chat_id,sender_id,content,type) values('privacy_fixture_chat',auth.uid(),'Accepted message','text');
end $$;
reset role;
delete from auth.sessions where user_id='90abc300-0000-4000-a000-000000000003';
set local role authenticated;
do $$ begin
 if public.gaga_session_active() then raise exception 'Revoked session still valid'; end if;
 if (select count(*) from public.users)<>0 then raise exception 'Revoked session can read raw table'; end if;
 begin perform public.gaga_get_privacy(); raise exception 'Revoked session can read RPC'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update auth.sessions set created_at=now()-interval '1 hour' where user_id='90abc400-0000-4000-a000-000000000004';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"90abc400-0000-4000-a000-000000000004","session_id":"90abc400-0000-4000-a000-000000000004","role":"authenticated"}',true);
do $$ begin
 begin perform public.delete_own_account(); raise exception 'Old session deleted account'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update auth.sessions set created_at=now() where user_id='90abc400-0000-4000-a000-000000000004';
set local role authenticated;
select public.delete_own_account();
reset role;
do $$ begin
 if exists(select 1 from auth.users where id='90abc400-0000-4000-a000-000000000004') then raise exception 'Fresh session deletion failed'; end if;
end $$;
select 'owner, friend, stranger, blocked account, invalid patch, message admission, request acceptance: passed' as result;
