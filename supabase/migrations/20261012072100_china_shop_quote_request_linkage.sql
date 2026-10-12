alter table public.china_shop_landed_quotes add column if not exists request_id uuid references public.china_shop_quote_requests(id);
create unique index if not exists china_shop_quotes_request_unique on public.china_shop_landed_quotes(request_id) where request_id is not null;
create or replace function public.china_shop_quote_request_immutable_fields() returns trigger language plpgsql set search_path = '' as $$
begin
 if new.user_id is distinct from old.user_id or new.product_id is distinct from old.product_id or new.quantity is distinct from old.quantity or new.destination_city is distinct from old.destination_city or new.notes is distinct from old.notes then
  raise exception 'Customer quote request details are immutable';
 end if;
 return new;
end $$;
drop trigger if exists china_shop_quote_request_immutable on public.china_shop_quote_requests;
create trigger china_shop_quote_request_immutable before update on public.china_shop_quote_requests for each row execute function public.china_shop_quote_request_immutable_fields();
comment on column public.china_shop_landed_quotes.request_id is 'Links authorized backend quotation to customer request; one quote per request for MVP.';
