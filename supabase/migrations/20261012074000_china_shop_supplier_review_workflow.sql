alter table public.china_shop_supplier_applications
 add column if not exists approved_supplier_id uuid references public.china_shop_suppliers(id),
 add column if not exists verification_reference text;
create unique index if not exists china_shop_supplier_application_approved_supplier_unique on public.china_shop_supplier_applications(approved_supplier_id) where approved_supplier_id is not null;
create or replace function public.china_shop_review_supplier_application(
 p_application_id uuid, p_reviewer_id uuid, p_decision text,
 p_review_notes text, p_verification_reference text default null
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare a public.china_shop_supplier_applications%rowtype; sid uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
 if p_decision not in ('under_review','approved','rejected') then raise exception 'Invalid decision'; end if;
 if p_reviewer_id is null or not exists(select 1 from auth.users where id=p_reviewer_id) then raise exception 'Valid reviewer required'; end if;
 if nullif(trim(p_review_notes),'') is null then raise exception 'Review notes required'; end if;
 select * into a from public.china_shop_supplier_applications where id=p_application_id for update;
 if not found then raise exception 'Application not found'; end if;
 if a.status not in ('submitted','under_review') then raise exception 'Application already finalized'; end if;
 if p_decision='approved' then
   if nullif(trim(p_verification_reference),'') is null then raise exception 'Document verification reference required'; end if;
   insert into public.china_shop_suppliers(display_name,origin_country,verification_status,verified_at)
   values(a.legal_business_name,'CN','verified',now()) returning id into sid;
 end if;
 update public.china_shop_supplier_applications set
 status=p_decision,review_notes=trim(p_review_notes),
 verification_reference=case when p_decision='approved' then trim(p_verification_reference) else null end,
 approved_supplier_id=sid,
 reviewed_at=case when p_decision='under_review' then null else now() end,
 reviewed_by=case when p_decision='under_review' then null else p_reviewer_id end
 where id=p_application_id;
 return sid;
end $$;
revoke all on function public.china_shop_review_supplier_application(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.china_shop_review_supplier_application(uuid,uuid,text,text,text) to service_role;
comment on function public.china_shop_review_supplier_application(uuid,uuid,text,text,text) is 'Service role only. Back-office must independently verify registration documents before approving and provide evidence reference.';
