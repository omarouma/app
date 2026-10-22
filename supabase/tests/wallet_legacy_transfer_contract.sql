-- Regression checks for the compatibility endpoint. No balances are moved.
begin;
do $test$
begin
  if (select prosecdef from pg_proc where oid =
      'public.wallet_transfer(uuid,uuid,numeric,text,text)'::regprocedure) then
    raise exception 'Legacy wrapper must use SECURITY INVOKER';
  end if;
  if has_function_privilege('anon',
      'public.wallet_transfer(uuid,uuid,numeric,text,text)', 'execute') then
    raise exception 'Anonymous callers must not execute legacy transfers';
  end if;
  if position('p_to_user_id => p_to' in pg_get_functiondef(
      'public.wallet_transfer(uuid,uuid,numeric,text,text)'::regprocedure)) = 0 then
    raise exception 'Legacy wrapper must delegate to canonical transfer checks';
  end if;
  begin
    perform public.wallet_transfer(p_from => null::uuid, p_to => null::uuid,
      p_amount => 1::numeric, p_currency => 'coins', p_note => 'audit');
    raise exception 'Unauthenticated transfer unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$test$;
rollback;
