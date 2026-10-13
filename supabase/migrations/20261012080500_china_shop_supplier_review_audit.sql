create table if not exists public.china_shop_supplier_review_events (
 id uuid primary key default gen_random_uuid(),
 application_id uuid not null references public.china_shop_supplier_applications(id) on delete restrict,
 reviewer_id uuid references auth.users(id),
 from_status text not null,
 to_status text not null,
 review_notes text not null,
 verification_reference text,
 created_at timestamptz not null default now()
);
create index if not exists china_shop_supplier_review_events_application_idx on public.china_shop_supplier_review_events(application_id,created_at desc);
alter table public.china_shop_supplier_review_events enable row level security;
revoke all on public.china_shop_supplier_review_events from anon,authenticated;
create or replace function public.china_shop_log_supplier_review() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.status is distinct from old.status and new.status in ('under_review','approved','rejected') then
  if new.status in ('approved','rejected') and (new.reviewed_by is null or nullif(trim(new.review_notes),'') is null) then
   raise exception 'Reviewer and notes required';
  end if;
  insert into public.china_shop_supplier_review_events(application_id,reviewer_id,from_status,to_status,review_notes,verification_reference)
  values(new.id,new.reviewed_by,old.status,new.status,coalesce(new.review_notes,'Review started'),new.verification_reference);
 end if;
 return new;
end $$;
drop trigger if exists china_shop_supplier_review_audit on public.china_shop_supplier_applications;
create trigger china_shop_supplier_review_audit after update of status on public.china_shop_supplier_applications
 for each row execute function public.china_shop_log_supplier_review();
revoke all on function public.china_shop_log_supplier_review() from public,anon,authenticated;
