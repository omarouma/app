-- GaGa China Direct: initial catalog and cart schema.
-- Safe, additive migration. Does not enable payments or supplier ordering.
create table if not exists public.china_shop_suppliers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  origin_country text not null default 'CN' check (origin_country = 'CN'),
  verification_status text not null default 'unverified' check (verification_status in ('unverified','under_review','verified','suspended')),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.china_shop_products (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.china_shop_suppliers(id),
  title text not null check (length(title) between 3 and 200),
  category text not null,
  description text,
  source_price_cny numeric(14,2) not null check (source_price_cny >= 0),
  source_price_checked_at timestamptz,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists china_shop_products_category_idx on public.china_shop_products(category) where is_published = true;
create table if not exists public.china_shop_cart_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.china_shop_products(id) on delete cascade,
  quantity integer not null check (quantity between 1 and 99),
  updated_at timestamptz not null default now(),
  primary key (user_id,product_id)
);
alter table public.china_shop_suppliers enable row level security;
alter table public.china_shop_products enable row level security;
alter table public.china_shop_cart_items enable row level security;
drop policy if exists china_shop_public_verified_suppliers on public.china_shop_suppliers;
create policy china_shop_public_verified_suppliers on public.china_shop_suppliers
for select to authenticated using (verification_status = 'verified');
drop policy if exists china_shop_public_products on public.china_shop_products;
create policy china_shop_public_products on public.china_shop_products
for select to authenticated using (
  is_published and exists (
    select 1 from public.china_shop_suppliers s
    where s.id = supplier_id and s.verification_status = 'verified'
  )
);
drop policy if exists china_shop_own_cart_select on public.china_shop_cart_items;
create policy china_shop_own_cart_select on public.china_shop_cart_items
for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists china_shop_own_cart_insert on public.china_shop_cart_items;
create policy china_shop_own_cart_insert on public.china_shop_cart_items
for insert to authenticated with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.china_shop_products p join public.china_shop_suppliers s on s.id = p.supplier_id
    where p.id = product_id and p.is_published and s.verification_status = 'verified'
  )
);
drop policy if exists china_shop_own_cart_update on public.china_shop_cart_items;
create policy china_shop_own_cart_update on public.china_shop_cart_items
for update to authenticated using (user_id = (select auth.uid())) with check (\n  user_id = (select auth.uid())\n  and exists (\n    select 1 from public.china_shop_products p join public.china_shop_suppliers s on s.id = p.supplier_id\n    where p.id = product_id and p.is_published and s.verification_status = 'verified'\n  )\n);
drop policy if exists china_shop_own_cart_delete on public.china_shop_cart_items;
create policy china_shop_own_cart_delete on public.china_shop_cart_items
for delete to authenticated using (user_id = (select auth.uid()));
-- Supplier/product writes intentionally remain restricted to privileged server operations.
-- No FX rates, customs estimates, payment requests or fabricated order states are stored here.
