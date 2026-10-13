create or replace function public.china_shop_admin_publish_product(
 p_product_id uuid,p_publish boolean
) returns boolean language plpgsql security definer set search_path = '' as $$
declare p public.china_shop_products%rowtype;
begin
 if auth.uid() is null or not exists(select 1 from public.china_shop_admin_users where user_id=auth.uid()) then
  raise exception 'Not authorized for product publishing';
 end if;
 select * into p from public.china_shop_products where id=p_product_id for update;
 if not found then raise exception 'Product not found'; end if;
 if p_publish then
  if not exists(select 1 from public.china_shop_suppliers s where s.id=p.supplier_id and s.verification_status='verified') then
   raise exception 'Supplier is not verified';
  end if;
  if p.source_price_checked_at is null or p.inventory_checked_at is null
   or p.available_quantity is null or p.available_quantity<=0
   or p.source_price_cny<=0 then
   raise exception 'Product price and available inventory must be verified';
  end if;
  if p.source_price_checked_at < now()-interval '30 days'
   or p.inventory_checked_at < now()-interval '7 days' then
   raise exception 'Product price or inventory verification is stale';
  end if;
 end if;
 update public.china_shop_products set is_published=p_publish,updated_at=now() where id=p_product_id;
 return p_publish;
end $$;
revoke all on function public.china_shop_admin_publish_product(uuid,boolean) from public,anon;
grant execute on function public.china_shop_admin_publish_product(uuid,boolean) to authenticated;
