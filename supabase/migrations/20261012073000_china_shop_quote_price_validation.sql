-- Harden quote approval: require a checked catalog price, checked stock, and exact BDT product subtotal.
create or replace function public.china_shop_issue_quote(
 p_request_id uuid,
 p_source_unit_price_cny numeric,
 p_exchange_rate_bdt_per_cny numeric,
 p_product_cost_bdt numeric,
 p_international_freight_bdt numeric,
 p_customs_duty_bdt numeric,
 p_taxes_bdt numeric,
 p_local_delivery_bdt numeric,
 p_service_fee_bdt numeric,
 p_expires_at timestamptz
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare r public.china_shop_quote_requests%rowtype; new_id uuid; current_source numeric;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
 select * into r from public.china_shop_quote_requests where id=p_request_id for update;
 if not found then raise exception 'Quote request not found'; end if;
 if r.status not in ('pending','reviewing') then raise exception 'Request not eligible'; end if;
 if p_expires_at <= now() then raise exception 'Expiry must be in future'; end if;
 if p_source_unit_price_cny is null or p_exchange_rate_bdt_per_cny is null or p_product_cost_bdt is null or p_international_freight_bdt is null or p_customs_duty_bdt is null or p_taxes_bdt is null or p_local_delivery_bdt is null or p_service_fee_bdt is null then raise exception 'Missing quote component'; end if;
 if p_source_unit_price_cny < 0 or p_exchange_rate_bdt_per_cny <= 0 or p_product_cost_bdt < 0 or p_international_freight_bdt < 0 or p_customs_duty_bdt < 0 or p_taxes_bdt < 0 or p_local_delivery_bdt < 0 or p_service_fee_bdt < 0 then raise exception 'Invalid monetary component'; end if;
 select p.source_price_cny into current_source from public.china_shop_products p join public.china_shop_suppliers s on s.id=p.supplier_id
 where p.id=r.product_id and p.is_published and s.verification_status='verified' and p.available_quantity >= r.quantity and p.inventory_checked_at is not null and p.source_price_checked_at is not null;
 if not found then raise exception 'Verified price, stock, product or supplier unavailable'; end if;
 if current_source is distinct from p_source_unit_price_cny then raise exception 'Source price snapshot does not match verified catalog'; end if;
 if p_product_cost_bdt is distinct from round(p_source_unit_price_cny * r.quantity * p_exchange_rate_bdt_per_cny,2) then raise exception 'Product BDT subtotal mismatch'; end if;
 insert into public.china_shop_landed_quotes (
  request_id,user_id,product_id,quantity,source_unit_price_cny,exchange_rate_bdt_per_cny,
  product_cost_bdt,international_freight_bdt,customs_duty_bdt,taxes_bdt,local_delivery_bdt,service_fee_bdt,
  quote_status,expires_at,verified_at
 ) values (
  r.id,r.user_id,r.product_id,r.quantity,p_source_unit_price_cny,p_exchange_rate_bdt_per_cny,
  p_product_cost_bdt,p_international_freight_bdt,p_customs_duty_bdt,p_taxes_bdt,p_local_delivery_bdt,p_service_fee_bdt,
  'verified',p_expires_at,now()
 ) returning id into new_id;
 update public.china_shop_quote_requests set status='quoted',updated_at=now() where id=r.id;
 return new_id;
end $$;
revoke all on function public.china_shop_issue_quote(uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,timestamptz) from public,anon,authenticated;
grant execute on function public.china_shop_issue_quote(uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,timestamptz) to service_role;
