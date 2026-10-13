create or replace function public.china_shop_admin_create_product(
 p_supplier_id uuid,p_title text,p_category text,p_description text,
 p_source_price_cny numeric,p_available_quantity integer,p_origin_city text,
 p_supplier_sku text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
 if auth.uid() is null or not exists(select 1 from public.china_shop_admin_users where user_id=auth.uid()) then
  raise exception 'Not authorized to create products';
 end if;
 if not exists(select 1 from public.china_shop_suppliers where id=p_supplier_id and verification_status='verified') then
  raise exception 'Supplier must be verified';
 end if;
 if length(trim(coalesce(p_title,''))) not between 3 and 180
  or length(trim(coalesce(p_category,''))) not between 2 and 80
  or length(trim(coalesce(p_origin_city,''))) not between 2 and 120
  or p_source_price_cny is null or p_source_price_cny<=0
  or p_available_quantity is null or p_available_quantity<0 then
  raise exception 'Invalid product details';
 end if;
 insert into public.china_shop_products(
  supplier_id,title,category,description,source_price_cny,available_quantity,origin_city,supplier_sku,
  is_published,source_price_checked_at,inventory_checked_at
 ) values (
  p_supplier_id,trim(p_title),trim(p_category),nullif(trim(p_description),''),
  p_source_price_cny,p_available_quantity,trim(p_origin_city),nullif(trim(p_supplier_sku),''),
  false,null,null
 ) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.china_shop_admin_create_product(uuid,text,text,text,numeric,integer,text,text) from public,anon;
grant execute on function public.china_shop_admin_create_product(uuid,text,text,text,numeric,integer,text,text) to authenticated;
comment on function public.china_shop_admin_create_product(uuid,text,text,text,numeric,integer,text,text) is 'Admin-only draft product creation. Price and inventory timestamps remain unverified until independent checks; draft is never auto-published.';
