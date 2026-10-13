create table if not exists public.china_shop_admin_users (
 user_id uuid primary key references auth.users(id) on delete cascade,
 granted_at timestamptz not null default now(),
 granted_by uuid references auth.users(id)
);
alter table public.china_shop_admin_users enable row level security;
revoke all on public.china_shop_admin_users from anon,authenticated;
create or replace function public.china_shop_admin_review_supplier(
 p_application_id uuid,p_decision text,p_review_notes text,p_verification_reference text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_reviewer uuid; a public.china_shop_supplier_applications%rowtype; sid uuid;
begin
 v_reviewer := auth.uid();
 if v_reviewer is null or not exists(select 1 from public.china_shop_admin_users where user_id=v_reviewer) then
  raise exception 'Not authorized for supplier review';
 end if;
 if p_decision not in ('under_review','approved','rejected') then raise exception 'Invalid decision'; end if;
 if nullif(trim(p_review_notes),'') is null then raise exception 'Review notes required'; end if;
 select * into a from public.china_shop_supplier_applications where id=p_application_id for update;
 if not found then raise exception 'Application not found'; end if;
 if a.status not in ('submitted','under_review') then raise exception 'Application already finalized'; end if;
 if p_decision='approved' then
  if nullif(trim(p_verification_reference),'') is null then raise exception 'Independent verification reference required'; end if;
  insert into public.china_shop_suppliers(display_name,origin_country,verification_status,verified_at)
  values(a.legal_business_name,'CN','verified',now()) returning id into sid;
 end if;
 update public.china_shop_supplier_applications set
 status=p_decision,review_notes=trim(p_review_notes),
 verification_reference=case when p_decision='approved' then trim(p_verification_reference) else null end,
 approved_supplier_id=sid,
 reviewed_at=case when p_decision='under_review' then null else now() end,
 reviewed_by=case when p_decision='under_review' then null else v_reviewer end
 where id=p_application_id;
 return sid;
end $$;
revoke all on function public.china_shop_admin_review_supplier(uuid,text,text,text) from public,anon;
grant execute on function public.china_shop_admin_review_supplier(uuid,text,text,text) to authenticated;
