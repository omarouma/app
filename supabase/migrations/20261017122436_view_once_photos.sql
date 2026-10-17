insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('gaga-view-once','gaga-view-once',false,10485760,array['image/jpeg','image/png','image/webp']);
-- No client storage policy permits reading, signing or writing this bucket.
create table gaga_private.view_once_photos (
  id uuid primary key,
  chat_id text not null references public.chats(id) on delete cascade,
  sender_id uuid not null references public.users(id) on delete cascade,
  recipient_id uuid not null references public.users(id) on delete cascade,
  object_name text not null unique,
  mime text not null check(mime in ('image/jpeg','image/png','image/webp')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '7 days',
  published_at timestamptz,
  consumed_at timestamptz
);
alter table gaga_private.view_once_photos enable row level security;
revoke all on gaga_private.view_once_photos from public,anon,authenticated;
grant all on gaga_private.view_once_photos to service_role;

create function public.gaga_reserve_view_once(p_id uuid,p_chat_id text,p_mime text)
returns text language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_chat public.chats%rowtype; v_other uuid; v_photo gaga_private.view_once_photos%rowtype;
begin
  if v_owner is null or not gaga_private.session_active() then raise exception 'Active session required' using errcode='28000'; end if;
  select * into v_chat from public.chats where id=p_chat_id;
  if v_chat.type<>'direct' or array_length(v_chat.participants,1)<>2
    or not coalesce(v_owner::text=any(v_chat.participants),false) then
    raise exception 'Direct chat membership required' using errcode='42501';
  end if;
  select p::uuid into v_other from unnest(v_chat.participants) p where p<>v_owner::text;
  if v_other is null or exists(select 1 from public.blocked_users b
    where (b.blocker_id=v_owner and b.blocked_id=v_other) or (b.blocker_id=v_other and b.blocked_id=v_owner)) then
    raise exception 'Recipient unavailable' using errcode='42501';
  end if;
  if p_mime not in ('image/jpeg','image/png','image/webp') then raise exception 'Photo format unsupported' using errcode='22023'; end if;
  select * into v_photo from gaga_private.view_once_photos where id=p_id;
  if found then
    if v_photo.sender_id<>v_owner or v_photo.chat_id<>p_chat_id or v_photo.mime<>p_mime
      or v_photo.expires_at<=now() or v_photo.consumed_at is not null then
      raise exception 'Photo identity unavailable' using errcode='42501';
    end if;
    return v_photo.object_name;
  end if;
  -- Serialize reservations for one sender so concurrent calls cannot evade the quota.
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text,810));
  if (select count(*) from gaga_private.view_once_photos where sender_id=v_owner and created_at>now()-interval '1 minute')>=10 then
    raise exception 'Too many photos; try later' using errcode='54000';
  end if;
  insert into gaga_private.view_once_photos(id,chat_id,sender_id,recipient_id,object_name,mime)
  values(p_id,p_chat_id,v_owner,v_other,v_owner::text||'/'||p_id::text,p_mime);
  return v_owner::text||'/'||p_id::text;
end $$;

create function public.gaga_publish_view_once(p_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_photo gaga_private.view_once_photos%rowtype;
begin
  if auth.uid() is null or not gaga_private.session_active() then raise exception 'Active session required' using errcode='28000'; end if;
  select * into strict v_photo from gaga_private.view_once_photos where id=p_id for update;
  if v_photo.sender_id<>auth.uid() or v_photo.expires_at<=now() or v_photo.consumed_at is not null then
    raise exception 'Photo unavailable' using errcode='42501';
  end if;
  -- Recheck membership and blocks immediately before creating the message.
  perform public.gaga_reserve_view_once(v_photo.id,v_photo.chat_id,v_photo.mime);
  if v_photo.published_at is not null then return p_id; end if;
  if not exists(select 1 from storage.objects where bucket_id='gaga-view-once' and name=v_photo.object_name) then
    raise exception 'Photo upload incomplete' using errcode='22023';
  end if;
  insert into public.messages(id,local_id,chat_id,sender_id,type,content,media_url,metadata,delivery_status)
  values(p_id,p_id::text,v_photo.chat_id,v_photo.sender_id,'image','View-once photo',
    'gaga-view-once:'||p_id::text,jsonb_build_object('view_once',true),'sent');
  update gaga_private.view_once_photos set published_at=now() where id=p_id;
  return p_id;
end $$;

create function public.gaga_consume_view_once(p_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare v_photo gaga_private.view_once_photos%rowtype;
begin
  if auth.uid() is null or not gaga_private.session_active() then raise exception 'Active session required' using errcode='28000'; end if;
  select * into strict v_photo from gaga_private.view_once_photos where id=p_id for update;
  if v_photo.recipient_id<>auth.uid() or v_photo.published_at is null or v_photo.consumed_at is not null
    or v_photo.expires_at<=now() or not exists(select 1 from public.chats c where c.id=v_photo.chat_id
      and v_photo.recipient_id::text=any(c.participants) and v_photo.sender_id::text=any(c.participants))
    or exists(select 1 from public.blocked_users b where
      (b.blocker_id=v_photo.sender_id and b.blocked_id=v_photo.recipient_id) or
      (b.blocker_id=v_photo.recipient_id and b.blocked_id=v_photo.sender_id))
    or not exists(select 1 from public.messages m where m.id=p_id and m.destroyed is not true
      and m.media_url='gaga-view-once:'||p_id::text) then
    raise exception 'Photo already opened or unavailable' using errcode='42501';
  end if;
  update gaga_private.view_once_photos set consumed_at=now() where id=p_id;
  update public.messages set content='View-once photo opened',metadata=coalesce(metadata,'{}'::jsonb)||'{"view_once_opened":true}'::jsonb,
    updated_at=now() where id=p_id;
  return v_photo.object_name;
end $$;
revoke all on function public.gaga_reserve_view_once(uuid,text,text),public.gaga_publish_view_once(uuid),public.gaga_consume_view_once(uuid) from public,anon;
grant execute on function public.gaga_reserve_view_once(uuid,text,text),public.gaga_publish_view_once(uuid),public.gaga_consume_view_once(uuid) to authenticated;

-- Expiry and consumption deny access immediately; Edge garbage collection removes bytes in bounded batches.
create function public.gaga_view_once_garbage()
returns table(object_name text) language sql stable security definer set search_path='' as $$
  select p.object_name from gaga_private.view_once_photos p
  join storage.objects o on o.bucket_id='gaga-view-once' and o.name=p.object_name
  where p.expires_at<=now() or p.consumed_at<now()-interval '5 minutes'
    or (p.published_at is null and p.created_at<now()-interval '1 hour')
  order by p.created_at limit 40;
$$;
revoke all on function public.gaga_view_once_garbage() from public,anon,authenticated;
grant execute on function public.gaga_view_once_garbage() to service_role;
