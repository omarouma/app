-- Enforce the same recipient privacy before uploading as normal message insertion.
create or replace function public.gaga_reserve_view_once(p_id uuid,p_chat_id text,p_mime text)
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
  if v_other is null or not gaga_private.message_allowed(v_owner,v_other) or exists(select 1 from public.blocked_users b
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

