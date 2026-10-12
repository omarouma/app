-- China Direct product media and inventory (applied to GaGa Supabase project).
alter table public.china_shop_products add column if not exists image_urls text[] not null default '{}';
alter table public.china_shop_products add column if not exists supplier_sku text;
alter table public.china_shop_products add column if not exists available_quantity integer check (available_quantity is null or available_quantity >= 0);
alter table public.china_shop_products add column if not exists inventory_checked_at timestamptz;
alter table public.china_shop_products add column if not exists origin_city text;
create index if not exists china_shop_products_supplier_idx on public.china_shop_products(supplier_id);
comment on column public.china_shop_products.available_quantity is 'Supplier-confirmed stock; NULL means unknown and must not be shown as in stock.';
comment on column public.china_shop_products.image_urls is 'Product image URLs supplied by authorized server-side product administration; not user-writable.';
