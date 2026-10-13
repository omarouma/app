create table if not exists public.china_shop_product_verification_events(
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references public.china_shop_products(id),
 reviewer_id uuid not null references auth.users(id),
 price_cny numeric not null,
 available_quantity integer not null,
 price_evidence text not null,
 inventory_evidence text not null,
 created_at timestamptz not null default now()
);
alter table public.china_shop_product_verification_events enable row level security;
revoke all on public.china_shop_product_verification_events from anon,authenticated;
create or replace function public.china_shop_admin_verify_product(
 p_product_id uuid,p_price_cny numeric,p_stock integer,p_price_evidence text,p_inventory_evidence text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare p public.china_shop_products%rowtype;
begin
 if auth.uid() is null or not exists(select 1 from public.china_shop_admin_users where user_id=auth.uid()) then
  raise exception 'Not authorized for product verification';
 end if;
 if p_price_cny is null or p_price_cny<=0 or p_stock is null or p_stock<0
  or length(trim(coalesce(p_price_evidence,'')))<8
  or length(trim(coalesce(p_inventory_evidence,'')))<8 then
  raise exception 'Valid price, stock and independent evidence references required';
 end if;
 select * into p from public.china_shop_products where id=p_product_id for update;
 if not found then raise exception 'Product not found'; end if;
 if not exists(select 1 from public.china_shop_suppliers s where s.id=p.supplier_id and s.verification_status='verified') then
  raise exception 'Supplier is not verified';
 end if;
 update public.china_shop_products set source_price_cny=p_price_cny,available_quantity=p_stock,
 source_price_checked_at=now(),inventory_checked_at=now(),is_published=false,updated_at=now()
 where id=p_product_id;
 insert into public.china_shop_product_verification_events(product_id,reviewer_id,price_cny,available_quantity,price_evidence,inventory_evidence)
 values(p_product_id,auth.uid(),p_price_cny,p_stock,trim(p_price_evidence),trim(p_inventory_evidence));
 return true;
end $$;
revoke all on function public.china_shop_admin_verify_product(uuid,numeric,integer,text,text) from public,anon;
grant execute on function public.china_shop_admin_verify_product(uuid,numeric,integer,text,text) to authenticated;
