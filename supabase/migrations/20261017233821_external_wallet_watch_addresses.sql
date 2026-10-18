create table public.gaga_external_wallets (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id) on delete cascade,
 network text not null check(network in ('ethereum','bsc','bitcoin','ton')),
 address text not null check(length(address) between 26 and 100),
 label text not null check(length(label) between 1 and 40), created_at timestamptz not null default now(),
 last_requested_at timestamptz, unique(user_id,network,address));
alter table public.gaga_external_wallets enable row level security;
revoke all on public.gaga_external_wallets from anon,authenticated;
grant select,delete on public.gaga_external_wallets to authenticated;
create policy external_wallet_read on public.gaga_external_wallets for select to authenticated using(user_id=(select auth.uid()) and (select gaga_private.session_active()));
create policy external_wallet_delete on public.gaga_external_wallets for delete to authenticated using(user_id=(select auth.uid()) and (select gaga_private.session_active()));
create function public.gaga_add_external_wallet(p_network text,p_address text,p_label text) returns public.gaga_external_wallets
language plpgsql security definer set search_path='' as $$
declare v_address text; v_result public.gaga_external_wallets;
begin
 if auth.uid() is null or not gaga_private.session_active() then raise exception 'Active session required' using errcode='42501'; end if;
 if p_network is null or p_network not in ('ethereum','bsc','bitcoin','ton') then raise exception 'Unsupported network'; end if;
 v_address:=trim(p_address);
 if p_network in ('ethereum','bsc') then v_address:=lower(v_address); end if;
 if v_address is null or not (case when p_network in ('ethereum','bsc') then v_address ~ '^0x[0-9a-f]{40}$' and v_address <> '0x0000000000000000000000000000000000000000'
 when p_network='bitcoin' then v_address ~ '^bc1[qp][023456789acdefghjklmnpqrstuvwxyz]{11,87}$'
 else v_address ~ '^[EU]Q[A-Za-z0-9_-]{46}$' end) then raise exception 'Address format does not match network'; end if;
 if length(trim(coalesce(p_label,''))) not between 1 and 40 then raise exception 'Wallet label must be 1-40 characters'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into v_result from public.gaga_external_wallets where user_id=auth.uid() and network=p_network and address=v_address;
 if found then return v_result; end if;
 if (select count(*) from public.gaga_external_wallets where user_id=auth.uid())>=10 then raise exception 'Maximum 10 watched addresses'; end if;
 insert into public.gaga_external_wallets(user_id,network,address,label) values(auth.uid(),p_network,v_address,trim(p_label)) returning * into v_result;
 return v_result;
end $$;
revoke all on function public.gaga_add_external_wallet(text,text,text) from public,anon;
grant execute on function public.gaga_add_external_wallet(text,text,text) to authenticated;
create function public.gaga_claim_wallet_refresh(p_id uuid) returns public.gaga_external_wallets
language plpgsql security definer set search_path='' as $$
declare v_row public.gaga_external_wallets;
begin
 if auth.uid() is null or not gaga_private.session_active() then raise exception 'Active session required' using errcode='42501'; end if;
 update public.gaga_external_wallets set last_requested_at=now() where id=p_id and user_id=auth.uid()
 and (last_requested_at is null or last_requested_at<now()-interval '30 seconds') returning * into v_row;
 if not found then raise exception 'Wallet unavailable or refresh too soon' using errcode='42501'; end if;
 return v_row;
end $$;
revoke all on function public.gaga_claim_wallet_refresh(uuid) from public,anon;
grant execute on function public.gaga_claim_wallet_refresh(uuid) to authenticated;
comment on table public.gaga_external_wallets is 'Private watch addresses. No ownership proof, spending authority or custodial deposit allocation.';

