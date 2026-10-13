create or replace function public.china_shop_admin_list_supplier_applications(p_limit integer default 50)
returns table (
 id uuid, legal_business_name text, contact_name text, contact_email text,
 business_city text, registration_number text, status text, submitted_at timestamptz
) language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.china_shop_admin_users a where a.user_id=auth.uid()) then
  raise exception 'Not authorized for supplier review';
 end if;
 return query select s.id,s.legal_business_name,s.contact_name,s.contact_email,s.business_city,s.registration_number,s.status,s.submitted_at
 from public.china_shop_supplier_applications s
 where s.status in ('submitted','under_review')
 order by s.submitted_at asc limit least(greatest(p_limit,1),100);
end $$;
revoke all on function public.china_shop_admin_list_supplier_applications(integer) from public,anon;
grant execute on function public.china_shop_admin_list_supplier_applications(integer) to authenticated;
