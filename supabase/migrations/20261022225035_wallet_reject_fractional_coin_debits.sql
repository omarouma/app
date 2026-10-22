-- Coin balances are integer units. Reject fractions before PostgreSQL can round them.
do $migration$
declare
  signature text;
  definition text;
  replacement text;
begin
  foreach signature in array array[
    'public.wallet_transfer(uuid,numeric,text,text,text)',
    'public.wallet_spend_coins(uuid,numeric,text)'
  ] loop
    definition := pg_get_functiondef(signature::regprocedure);
    if position('if p_amount is null or p_amount <= 0 then' in definition) = 0 then
      raise exception 'Unexpected amount validation in %; review before migrating', signature;
    end if;
    if signature = 'public.wallet_transfer(uuid,numeric,text,text,text)' then
      replacement := 'if p_amount is null or p_amount <= 0 or p_amount::text in (''NaN'',''Infinity'',''-Infinity'') or (v_cur = ''coins'' and p_amount <> trunc(p_amount)) then';
    else
      replacement := 'if p_amount is null or p_amount <= 0 or p_amount::text in (''NaN'',''Infinity'',''-Infinity'') or p_amount <> trunc(p_amount) then';
    end if;
    execute replace(definition, 'if p_amount is null or p_amount <= 0 then', replacement);
  end loop;
end;
$migration$;
