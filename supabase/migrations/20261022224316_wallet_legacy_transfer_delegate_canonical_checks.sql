-- Keep the historical JSON API but route all transfers through the canonical checks.
create or replace function public.wallet_transfer(
  p_from uuid, p_to uuid, p_amount numeric,
  p_currency text default 'coins', p_note text default null
) returns jsonb language plpgsql security invoker
set search_path = ''
as $function$
declare
  moved boolean;
begin
  if auth.uid() is null or auth.uid() <> p_from then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  moved := public.wallet_transfer(
    p_to_user_id => p_to,
    p_amount => p_amount,
    p_currency => p_currency,
    p_description => coalesce(p_note, ''),
    p_idempotency_key => null::text
  );
  if not moved then
    raise exception 'insufficient_balance';
  end if;
  return jsonb_build_object('success', true, 'error', null);
end;
$function$;
revoke all on function public.wallet_transfer(uuid, uuid, numeric, text, text) from public, anon;
grant execute on function public.wallet_transfer(uuid, uuid, numeric, text, text) to authenticated;
