create table if not exists public.china_shop_quote_requests (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 product_id uuid not null references public.china_shop_products(id),
 quantity integer not null check (quantity between 1 and 99),
 destination_city text not null check (length(trim(destination_city)) between 2 and 120),
 notes text check (notes is null or length(notes)<=1000),
 status text not null default 'pending' check (status in ('pending','reviewing','quoted','declined','cancelled')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists china_shop_quote_requests_owner_idx on public.china_shop_quote_requests(user_id,created_at desc);
alter table public.china_shop_quote_requests enable row level security;
create policy china_shop_quote_requests_read_own on public.china_shop_quote_requests for select to authenticated using(user_id=(select auth.uid()));
create policy china_shop_quote_requests_create_own on public.china_shop_quote_requests for insert to authenticated with check (
 user_id=(select auth.uid()) and status='pending' and
 exists(select 1 from public.china_shop_products p join public.china_shop_suppliers s on s.id=p.supplier_id
 where p.id=product_id and p.is_published=true and s.verification_status='verified' and p.available_quantity>=quantity and p.inventory_checked_at is not null)
);
grant select,insert on public.china_shop_quote_requests to authenticated;
comment on table public.china_shop_quote_requests is 'Customer quote requests only. Status and pricing can be changed only by authorized server-side administration.';
