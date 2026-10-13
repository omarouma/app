create table if not exists public.china_shop_supplier_applications (
 id uuid primary key default gen_random_uuid(),
 applicant_user_id uuid not null references auth.users(id) on delete cascade,
 legal_business_name text not null check(length(trim(legal_business_name)) between 2 and 160),
 contact_name text not null check(length(trim(contact_name)) between 2 and 120),
 contact_email text not null check(length(trim(contact_email)) between 5 and 254),
 country_code char(2) not null default 'CN' check(country_code='CN'),
 business_city text not null check(length(trim(business_city)) between 2 and 120),
 registration_number text not null check(length(trim(registration_number)) between 3 and 120),
 business_website text check(business_website is null or length(business_website)<=500),
 status text not null default 'submitted' check(status in ('submitted','under_review','approved','rejected','withdrawn')),
 submitted_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id),
 review_notes text,
 constraint supplier_application_review_integrity check (
 (status in ('submitted','under_review','withdrawn') and reviewed_at is null and reviewed_by is null)
 or (status in ('approved','rejected') and reviewed_at is not null and reviewed_by is not null)
 )
);
create index if not exists china_shop_supplier_applications_owner_idx on public.china_shop_supplier_applications(applicant_user_id,submitted_at desc);
alter table public.china_shop_supplier_applications enable row level security;
create policy china_shop_supplier_applications_owner_read on public.china_shop_supplier_applications for select to authenticated using(applicant_user_id=(select auth.uid()));
create policy china_shop_supplier_applications_owner_submit on public.china_shop_supplier_applications for insert to authenticated with check (
 applicant_user_id=(select auth.uid()) and status='submitted' and reviewed_at is null and reviewed_by is null and review_notes is null
);
grant select,insert on public.china_shop_supplier_applications to authenticated;
comment on table public.china_shop_supplier_applications is 'Supplier applications only, not verified suppliers. Approval is reserved for authorized back-office review.';
