import { verifyPublisher } from './release_publisher_identity.mjs';
const url = Deno.env.get('SUPABASE_URL')!;
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
const audience = url+'/functions/v1/gaga-publish-release-2812';
const json = (data: unknown, status=200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control':'no-store' } });
async function admin(path: string, options: RequestInit = {}) {
  return fetch(url+path, { ...options, headers: { apikey:service, Authorization:`Bearer ${service}`, 'Content-Type':'application/json', Prefer:'return=representation', ...options.headers }, signal:AbortSignal.timeout(20000) });
}
async function login(email: string, password: string) {
  const response = await fetch(url+'/auth/v1/token?grant_type=password', { method:'POST', headers:{apikey:anon,'Content-Type':'application/json'}, body:JSON.stringify({email,password}) });
  if (!response.ok) throw new Error('QA_LOGIN_FAILED');
  return (await response.json()).access_token as string;
}
async function preflight() {
  const users: Array<{id:string,email:string,password:string,token:string}> = [];
  const chat = 'release-qa-'+crypto.randomUUID();
  const photo = crypto.randomUUID();
  const checks: Record<string,unknown> = {};
  const cleanup: string[] = [];
  let firebaseIdToken: string|undefined;
  let failure: string|undefined;
  try {
    for (let index=0;index<2;index++) {
      const email = 'gaga-release-qa-'+crypto.randomUUID()+'@example.invalid';
      const password = crypto.randomUUID()+crypto.randomUUID().slice(0,16)+'Aa1!';
      const response = await admin('/auth/v1/admin/users',{method:'POST',body:JSON.stringify({email,password,email_confirm:true,user_metadata:{name:'GaGa temporary release QA'}})});
      if (!response.ok) { const failure=await response.json().catch(()=>({}));throw new Error('QA_CREATE_USER_FAILED_'+response.status+'_'+(failure.code??failure.error_code??'')+'_'+String(failure.msg??failure.message??'').slice(0,160)); }
      const user = await response.json();
      users.push({id:user.id,email,password,token:''});
      users[index].token = await login(email,password);
      const profile = await admin('/rest/v1/users?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates'},body:JSON.stringify({id:user.id,email,name:'GaGa temporary release QA',display_name:'GaGa temporary release QA'})});
      if (!profile.ok) throw new Error('QA_PROFILE_FAILED');
    }
    const [a,b]=users;
    const friend = await admin('/rest/v1/friendships',{method:'POST',body:JSON.stringify([{user_id:a.id,friend_id:b.id},{user_id:b.id,friend_id:a.id}])});
    if (!friend.ok) throw new Error('QA_FRIENDSHIP_FAILED');
    const conversation = await admin('/rest/v1/chats',{method:'POST',body:JSON.stringify({id:chat,type:'direct',participants:[a.id,b.id],name:'GaGa temporary release QA',created_by:a.id})});
    if (!conversation.ok) throw new Error('QA_CHAT_FAILED');
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9ioAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
    const headers = (token:string) => ({apikey:anon,Authorization:`Bearer ${token}`,'X-Photo-Id':photo});
    const send = await fetch(url+'/functions/v1/view-once-photo?action=send',{method:'POST',headers:{...headers(a.token),'X-Chat-Id':chat,'Content-Type':'image/png'},body:png});
    checks.send_status=send.status;
    if (!send.ok) throw new Error('QA_SEND_FAILED');
    const retry = await fetch(url+'/functions/v1/view-once-photo?action=send',{method:'POST',headers:{...headers(a.token),'X-Chat-Id':chat,'Content-Type':'image/png'},body:png});
    checks.identical_retry=retry.status===200;
    if(!checks.identical_retry)throw new Error('QA_IDENTICAL_RETRY_FAILED');
    const changed=png.slice();changed[changed.length-1]^=1;
    const mismatch=await fetch(url+'/functions/v1/view-once-photo?action=send',{method:'POST',headers:{...headers(a.token),'X-Chat-Id':chat,'Content-Type':'image/png'},body:changed});
    checks.changed_bytes_retry_denied=mismatch.status===403;
    if(!checks.changed_bytes_retry_denied)throw new Error('QA_CHANGED_RETRY_ALLOWED');
    const sender = await fetch(url+'/functions/v1/view-once-photo?action=open',{method:'POST',headers:headers(a.token)});
    checks.sender_denied=sender.status===403;
    if(sender.status!==403) throw new Error('QA_SENDER_ALLOWED');
    const open = await fetch(url+'/functions/v1/view-once-photo?action=open',{method:'POST',headers:headers(b.token)});
    checks.open_status=open.status;
    if(!open.ok) throw new Error('QA_OPEN_FAILED');
    const bytes=new Uint8Array(await open.arrayBuffer());
    checks.exact_bytes=bytes.length===png.length&&bytes.every((v,i)=>v===png[i]);
    checks.no_store=open.headers.get('Cache-Control')?.includes('no-store')===true;
    if(!checks.exact_bytes||!checks.no_store) throw new Error('QA_RESPONSE_INCORRECT');
    const secondToken=await login(b.email,b.password);
    const repeat=await fetch(url+'/functions/v1/view-once-photo?action=open',{method:'POST',headers:headers(secondToken)});
    checks.second_session_denied=repeat.status===403;
    if(repeat.status!==403) throw new Error('QA_SECOND_OPEN_ALLOWED');
    const storage=await admin('/storage/v1/object/list/gaga-view-once',{method:'POST',body:JSON.stringify({prefix:a.id+'/',limit:100})});
    checks.consumed_bytes_removed=storage.ok&&(await storage.json()).length===0;
    if(!checks.consumed_bytes_removed) throw new Error('QA_STORAGE_NOT_REMOVED');
    const fcm=await admin('/functions/v1/send-fcm-push',{method:'POST',body:JSON.stringify({configuration_check:true,dry_run:true})});
    checks.fcm_configuration_status=fcm.status;
    checks.fcm_configuration=fcm.ok;
    const custom=await fetch(url+'/functions/v1/firebase-token',{headers:{apikey:anon,Authorization:`Bearer ${a.token}`}});
    checks.firebase_custom_token=custom.ok;
    if(custom.ok) {
      const token=await custom.json();
      const identity=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=AIzaSyDae1gz_UQ0jHMyekzLkHpBJaauha_xgQM',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:token.customToken,returnSecureToken:true})});
      checks.firebase_sign_in=identity.ok;
      if(identity.ok) {
        const data=await identity.json();firebaseIdToken=data.idToken;
        const lookup=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=AIzaSyDae1gz_UQ0jHMyekzLkHpBJaauha_xgQM',{
          method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:data.idToken})});
        const account=lookup.ok?await lookup.json():{};
        checks.firebase_identity_matches=account.users?.[0]?.localId===a.id;
      }
    }
  } catch(error) { failure=error instanceof Error?error.message:'QA_FAILED'; }
  finally {
    if(firebaseIdToken) {
      const remove=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:delete?key=AIzaSyDae1gz_UQ0jHMyekzLkHpBJaauha_xgQM',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:firebaseIdToken})});
      if(!remove.ok)cleanup.push('firebase_test_user');
    }
    if(users[0]) {
      const remove=await admin('/storage/v1/object/gaga-view-once',{method:'DELETE',body:JSON.stringify({prefixes:[users[0].id+'/'+photo]})});
      if(!remove.ok)cleanup.push('private_test_photo');
    }
    for (const path of ['/rest/v1/messages?chat_id=eq.'+chat,'/rest/v1/chats?id=eq.'+chat]) {
      if(!(await admin(path,{method:'DELETE'})).ok)cleanup.push('test_chat');
    }
    for(const user of users) {
      if(!(await admin('/auth/v1/admin/users/'+user.id,{method:'DELETE'})).ok)cleanup.push('supabase_test_user');
    }
  }
  return {checks,failure,cleanup_complete:cleanup.length===0,cleanup_errors:cleanup};
}
Deno.serve(async request=>{
  if(request.method!=='POST')return json({error:'POST_REQUIRED'},405);
  if(!await verifyPublisher(request.headers.get('X-Release-Identity'),audience,'firebase-adminsdk-fbsvc@oumagachat.iam.gserviceaccount.com','101344750542392340895'))return json({error:'UNAUTHORIZED'},401);
  if(new URL(request.url).searchParams.get('action')!=='preflight')return json({error:'INVALID_ACTION'},400);
  return json(await preflight());
});
