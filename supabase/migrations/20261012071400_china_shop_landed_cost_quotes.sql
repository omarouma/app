-- Server-authored China Direct landed-cost quotations. Client read-only.
create table if not exists public.china_shop_landed_quotes (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 product_id uuid not null references public.china_shop_products(id),
 quantity integer not null check(quantity between 1 and 99),
 source_unit_price_cny numeric(14,2) not null check(source_unit_price_cny>=0),
 exchange_rate_bdt_per_cny numeric(16,6) not null check(exchange_rate_bdt_per_cny>0),
 product_cost_bdt numeric(14,2) not null check(product_cost_bdt>=0),
 international_freight_bdt numeric(14,2) not null check(international_freight_bdt>=0),
 customs_duty_bdt numeric(14,2) not null check(customs_duty_bdt>=0),
 taxes_bdt numeric(14,2) not null check(taxes_bdt>=0),
 local_delivery_bdt numeric(14,2) not null check(local_delivery_bdt>=0),
 service_fee_bdt numeric(14,2) not null check(service_fee_bdt>=0),
 total_bdt numeric(14,2) generated always as (product_cost_bdt + international_freight_bdt + customs_duty_bdt + taxes_bdt + local_delivery_bdt + service_fee_bdt) stored,
 quote_status text not null default 'draft' check(quote_status in ('draft','verified','expired','cancelled')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 verified_at timestamptz,
 check (expires_at > created_at)
);
create index if not exists china_shop_landed_quotes_user_idx on public.china_shop_landed_quotes(user_id,created_at desc);
alter table public.china_shop_landed_quotes enable row level security;
create policy china_shop_quotes_owner_read on public.china_shop_landed_quotes for select to authenticated using(user_id=(select auth.uid()));
grant select on public.china_shop_landed_quotes to authenticated;
comment on table public.china_shop_landed_quotes is 'Server-authored BDT landed-cost quotes. Clients have read-only access to own quotes; checkout not enabled.';
