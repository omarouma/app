import { snapshot } from './chain.mjs';
const url = Deno.env.get('SUPABASE_URL')!;
const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
Deno.serve(async (req: Request) => {
 if (req.method !== 'POST') return json({error:'POST_REQUIRED'},405);
 const authorization = req.headers.get('Authorization') ?? '';
 if (!/^Bearer [A-Za-z0-9._~-]{20,}$/.test(authorization)) return json({error:'AUTH_REQUIRED'},401);
 try {
  const id = new URL(req.url).searchParams.get('id');
  if (!id || !/^[a-f0-9-]{36}$/i.test(id)) return json({error:'INVALID_ID'},400);
  const claim = await fetch(`${url}/rest/v1/rpc/gaga_claim_wallet_refresh`,{method:'POST',headers:{apikey:anon,Authorization:authorization,'Content-Type':'application/json'},body:JSON.stringify({p_id:id}),signal:AbortSignal.timeout(8000)});
  if (!claim.ok) return json({error:'WALLET_UNAVAILABLE_OR_REFRESH_LIMIT',retry_after_seconds:30},claim.status===401?401:429);
  const row = await claim.json();
  const data = await snapshot(row.network,row.address);
  return json({...data,id:row.id,network:row.network,address:row.address,checked_at:new Date().toISOString()});
 } catch { return json({error:'CHAIN_DATA_UNAVAILABLE'},502); }
});
