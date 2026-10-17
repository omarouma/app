// Deployment supplies a generated release_config.mjs with non-secret byte/hash pins.
// Gateway JWT checks remain enabled; Google publisher identity is also required.
import { verifyPublisher } from './release_publisher_identity.mjs';
import { files, deadline, version } from './release_config.mjs';
const url=Deno.env.get('SUPABASE_URL')!;
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const audience=url+'/functions/v1/gaga-publish-release-2812';
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
async function exactBytes(stream:ReadableStream<Uint8Array>|null,expected:number){
  if(!stream)throw new Error('BODY_REQUIRED');
  const reader=stream.getReader();const chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>expected){await reader.cancel();throw new Error('FILE_LIMIT');}chunks.push(value);}}finally{reader.releaseLock();}
  if(size!==expected)throw new Error('SIZE_MISMATCH');
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}chunks.length=0;return bytes;
}
const sha=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
Deno.serve(async request=>{
  if(request.method!=='POST')return json({error:'POST_REQUIRED'},405);
  if(Date.now()>deadline)return json({error:'RELEASE_WINDOW_CLOSED'},410);
  if(!await verifyPublisher(request.headers.get('X-Release-Identity'),audience,'firebase-adminsdk-fbsvc@oumagachat.iam.gserviceaccount.com','101344750542392340895'))return json({error:'UNAUTHORIZED'},401);
  const name=new URL(request.url).searchParams.get('file')??'';
  if(!Object.hasOwn(files,name))return json({error:'FILE_NOT_ALLOWED'},403);
  const expected=files[name];
  if(!Number.isInteger(expected.size)||expected.size<=0||expected.size>52428800)return json({error:'FILE_LIMIT'},413);
  if(version!=='2.8.12')return json({error:'VERSION_NOT_ALLOWED'},403);
  if(new URL(request.url).searchParams.get('action')==='remove-staged-copy'){
    if(!name.endsWith('.apk')&&!name.endsWith('.aab'))return json({error:'ONLY_NEW_BINARY_COPIES'},403);
    const mirrorTag=(name.endsWith('.aab')?'bundle-':'android-')+version;
    const mirror=await fetch('https://github.com/omarouma/app/releases/download/'+mirrorTag+'/'+encodeURIComponent(name));
    if(!mirror.ok)return json({error:'VERIFIED_MIRROR_REQUIRED'},409);
    let bytes:Uint8Array;
    try{bytes=await exactBytes(mirror.body,expected.size);}catch{return json({error:'MIRROR_SIZE_MISMATCH'},409);}
    if(await sha(bytes)!==expected.sha256)return json({error:'MIRROR_HASH_MISMATCH'},409);
    const remove=await fetch(url+'/storage/v1/object/gaga-app-releases',{method:'DELETE',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify({prefixes:[version+'/'+name]})});
    return json({removed:remove.ok,name,verified_mirror:true},remove.ok?200:502);
  }
  if(request.headers.has('Content-Length')&&Number(request.headers.get('Content-Length'))!==expected.size)return json({error:'SIZE_MISMATCH'},400);
  if(!request.body)return json({error:'BODY_REQUIRED'},400);
  let bytes:Uint8Array;try{bytes=await exactBytes(request.body,expected.size);}catch{return json({error:'SIZE_MISMATCH'},400);}
  const hash=await sha(bytes);
  if(hash!==expected.sha256)return json({error:'HASH_MISMATCH'},400);
  const response=await fetch(url+'/storage/v1/object/gaga-app-releases/'+version+'/'+encodeURIComponent(name),{
    method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':expected.mime,'x-upsert':'false','Cache-Control':'max-age=31536000'},body:bytes});
  if(!response.ok)return json({error:'UPLOAD_FAILED',status:response.status},502);
  return json({name,bytes:bytes.length,sha256:hash});
});
