const url = Deno.env.get("SUPABASE_URL") ?? "";
const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
Deno.serve(async request => {
  const cors = {"Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, apikey, content-type"};
  const reply = (status: number, error: string) => new Response(JSON.stringify({error}), {status, headers:{...cors,"Content-Type":"application/json"}});
  if (request.method === "OPTIONS") return new Response(null,{headers:cors});
  if (request.method !== "POST") return reply(405,"Method not allowed");
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return reply(401,"Authentication required");
  const userHeaders = {apikey:anon,Authorization:authorization,"Content-Type":"application/json"};
  try {
    // The RPC checks the live session and recent authentication on every batch.
    for (let batch=0;batch<20;batch++) {
      const list = await fetch(`${url}/rest/v1/rpc/gaga_deletion_media`, {method:"POST",headers:userHeaders,body:"{}",signal:AbortSignal.timeout(10000)});
      if (!list.ok) return reply(list.status===401||list.status===403?403:503,"Sign in again before deleting your account");
      const objects: {bucket_id:string;name:string}[] = await list.json();
      if (!objects.length) {
        const done = await fetch(`${url}/rest/v1/rpc/delete_own_account`,{method:"POST",headers:userHeaders,body:"{}",signal:AbortSignal.timeout(10000)});
        return done.ok ? new Response(null,{status:204,headers:cors}) : reply(503,"Account deletion could not finish; please retry");
      }
      const buckets = new Map<string,string[]>();
      for (const object of objects) buckets.set(object.bucket_id,[...(buckets.get(object.bucket_id)??[]),object.name]);
      for (const [bucket,prefixes] of buckets) {
        // Storage API removes both metadata and stored bytes. Never delete its SQL rows directly.
        const removed = await fetch(`${url}/storage/v1/object/${encodeURIComponent(bucket)}`, {method:"DELETE",headers:{apikey:service,Authorization:`Bearer ${service}`,"Content-Type":"application/json"},body:JSON.stringify({prefixes}),signal:AbortSignal.timeout(10000)});
        if (!removed.ok) return reply(503,"Media cleanup could not finish; your account remains available. Please retry");
      }
    }
    return reply(503,"More media needs cleanup. Please retry to continue");
  } catch { return reply(503,"Deletion service unavailable. Please retry"); }
});
