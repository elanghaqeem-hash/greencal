/* GreenCal Cloud AI Gateway: no API keys exposed to the browser. */
const PROVIDERS = Object.freeze({
  gemini:{label:"Google Gemini",defaultModel:"gemini-2.5-flash"},
  openai:{label:"OpenAI",defaultModel:"gpt-4.1-mini"},
  openrouter:{label:"OpenRouter",defaultModel:"openai/gpt-4.1-mini"},
  groq:{label:"Groq",defaultModel:"llama-3.3-70b-versatile"}
});
const asJson=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const error=(status,code,message)=>asJson({ok:false,code,message},status);
const emails=(x)=>String(x||"").split(",").map(v=>v.trim().toLowerCase()).filter(Boolean);
function decode64(s){const v=atob(s.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(s.length/4)*4,"="));return Uint8Array.from(v,c=>c.charCodeAt(0));}
async function identity(request,env){
 if(!env.CF_ACCESS_TEAM_DOMAIN||!env.CF_ACCESS_AUD)return {error:error(503,"ACCESS_NOT_CONFIGURED","Cloudflare Access Admin/Maker belum dikonfigurasi.")};
 const token=request.headers.get("Cf-Access-Jwt-Assertion");
 if(!token)return {error:error(401,"LOGIN_REQUIRED","Login melalui Cloudflare Access diperlukan.")};
 try{
  const parts=token.split(".");
  if(parts.length!==3)throw Error("JWT format");
  const [h,p,s]=parts;
  const head=JSON.parse(new TextDecoder().decode(decode64(h)));
  const data=JSON.parse(new TextDecoder().decode(decode64(p)));
  const domain=env.CF_ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//,"").replace(/\/$/,"");
  if(!/^[a-z0-9.-]+\.cloudflareaccess\.com$/.test(domain)||head.alg!=="RS256")throw Error("Headers");
  const now=Math.floor(Date.now()/1000);
  if(data.iss!=="https://"+domain||!Array.isArray(data.aud)||!data.aud.includes(env.CF_ACCESS_AUD)||
  !(data.exp>now)||!(data.iat<=now+60)||typeof data.email!=="string")throw Error("Claims");
  const response=await fetch("https://"+domain+"/cdn-cgi/access/certs");
  if(!response.ok)throw Error("JWKS unreachable");
  const jwks=await response.json();
  const jwk=(jwks.keys||[]).find(k=>k.kid===head.kid&&k.kty==="RSA");
  if(!jwk)throw Error("No key");
  const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  if(!await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,decode64(s),new TextEncoder().encode(h+"."+p)))throw Error("Signature");
  const email=data.email.toLowerCase();
  const role=emails(env.GREENCAL_ADMIN_EMAILS).includes(email)?"Admin":emails(env.GREENCAL_MAKER_EMAILS).includes(email)?"Maker":null;
  if(!role)return {error:error(403,"ROLE_DENIED","Pengguna belum diberi peran Admin atau Maker.")};
  return {role,email};
 }catch{return {error:error(401,"INVALID_IDENTITY","Sesi login tidak valid atau kedaluwarsa.")};}
}
// AES-GCM envelope encryption for Admin-submitted API keys.
function aesKeyBytes(env){
 if(!env.GREENCAL_AI_ENCRYPTION_KEY)throw Error("Server key encryption is not configured");
 const raw=decode64(env.GREENCAL_AI_ENCRYPTION_KEY);
 if(raw.length!==32)throw Error("Invalid encryption secret");
 return raw;
}
async function encryptProviderKey(secret,env){
 const key=await crypto.subtle.importKey("raw",aesKeyBytes(env),"AES-GCM",false,["encrypt"]);
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode(secret));
 return {iv:Array.from(iv),ciphertext:Array.from(new Uint8Array(encrypted)),version:1};
}
async function decryptProviderKey(envelope,env){
 const key=await crypto.subtle.importKey("raw",aesKeyBytes(env),"AES-GCM",false,["decrypt"]);
 const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:new Uint8Array(envelope.iv)},key,new Uint8Array(envelope.ciphertext));
 return new TextDecoder().decode(plain);
}

export { identity as verifyAccessIdentity };
const defaultOrder=[{provider:"gemini",model:"gemini-2.5-flash",enabled:true},{provider:"openai",model:"gpt-4.1-mini",enabled:true},{provider:"openrouter",model:"openai/gpt-4.1-mini",enabled:false},{provider:"groq",model:"llama-3.3-70b-versatile",enabled:false}];
const keyVar={gemini:"AI_KEY_GEMINI",openai:"AI_KEY_OPENAI",openrouter:"AI_KEY_OPENROUTER",groq:"AI_KEY_GROQ"};
async function loadConfig(env){return (await env.AI_CONFIG.get("ai_chain_v1",{type:"json"}))||{order:defaultOrder,updatedAt:null};}
function publicConfig(cfg,env){return {order:cfg.order.map(x=>({provider:x.provider,model:x.model,enabled:x.enabled!==false,hasKey:!!(x.sealedKey||env[keyVar[x.provider]])})),updatedAt:cfg.updatedAt||null};}
async function saveSettings(request,env,actor){
 let input;
 try{input=await request.json();}catch{return error(400,"INVALID_JSON","Konfigurasi bukan JSON valid.");}
 if(!input||!Array.isArray(input.order)||!input.order.length||input.order.length>4)return error(400,"INVALID_ORDER","Pilih 1–4 penyedia.");
 const prev=await loadConfig(env);
 const used=new Set(),order=[];
 for(const x of input.order){
  if(!x||!PROVIDERS[x.provider]||used.has(x.provider)||typeof x.model!=="string"||
  !/^[a-zA-Z0-9_.:/-]{1,100}$/.test(x.model))return error(400,"INVALID_MODEL","Model/provider tidak valid atau duplikat.");
  used.add(x.provider);
  const prior=(prev.order||[]).find(p=>p.provider===x.provider);
  let sealedKey=x.removeKey===true?null:(prior?.sealedKey||null);
  if(x.newKey!==undefined&&x.newKey!==""){
    if(typeof x.newKey!=="string"||x.newKey.length<12||x.newKey.length>350)return error(400,"INVALID_KEY","Panjang API key tidak valid.");
    if(!env.GREENCAL_AI_ENCRYPTION_KEY)return error(503,"ENCRYPTION_UNAVAILABLE","Secret enkripsi Cloudflare belum terpasang.");
    sealedKey=await encryptProviderKey(x.newKey,env);
  }
  order.push({provider:x.provider,model:x.model,enabled:x.enabled!==false,sealedKey});
 }
 const config={order,updatedAt:new Date().toISOString(),updatedBy:actor.email};
 await env.AI_CONFIG.put("ai_chain_v1",JSON.stringify(config));
 return asJson({ok:true,config:publicConfig(config,env)});
}
function validate(input){
 if(!input||!Number.isInteger(input.year)||input.year<2020||input.year>2100)throw Error("Tahun tidak valid.");
 const keys=["total","scope1","scope2","scope3","financed","osCovered","osTotal","dataQuality"];
 const result={year:input.year};
 for(const k of keys){const n=input[k];if(n!==null&&n!==undefined&&(!Number.isFinite(n)||n<0||n>1e12))throw Error("Metrik "+k+" tidak valid.");result[k]=n??null;}
 if(result.total===null||result.financed===null)throw Error("Total emisi dan pembiayaan wajib diisi.");
 return result;
}
async function invoke(x,prompt,env){
 const key=x.sealedKey?await decryptProviderKey(x.sealedKey,env):env[keyVar[x.provider]];
 if(!key)throw Error("Provider key absent");
 const headers={"Content-Type":"application/json"};
 let url,body;
 if(x.provider==="gemini"){
  url="https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(x.model)+":generateContent";
  headers["x-goog-api-key"]=key;
  body={contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:0.2,maxOutputTokens:1800}};
 }else{
  url={openai:"https://api.openai.com/v1/chat/completions",openrouter:"https://openrouter.ai/api/v1/chat/completions",groq:"https://api.groq.com/openai/v1/chat/completions"}[x.provider];
  headers.Authorization="Bearer "+key;
  body={model:x.model,messages:[{role:"system",content:"Anda peninjau ESG. Jangan mengklaim kepatuhan atau audit PASS tanpa bukti."},{role:"user",content:prompt}],temperature:0.2,max_tokens:1800};
 }
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),14000);
 try{
  const r=await fetch(url,{method:"POST",headers,body:JSON.stringify(body),signal:ctl.signal});
  if(!r.ok)throw Error("Provider HTTP "+r.status);
  const data=await r.json();
  const txt=x.provider==="gemini"?data.candidates?.[0]?.content?.parts?.map(x=>x.text||"").join("\n"):data.choices?.[0]?.message?.content;
  if(typeof txt!=="string"||txt.trim().length<30)throw Error("Respons kosong");
  return txt.trim().slice(0,15000);
 }finally{clearTimeout(timer);}
}
async function analyze(request,env){
 if(Number(request.headers.get("content-length")||0)>8192)return error(413,"INPUT_TOO_LARGE","Data terlalu besar.");
 let data;
 try{data=validate(await request.json());}catch(e){return error(400,"INVALID_INPUT",e.message);}
 const cfg=await loadConfig(env),chain=cfg.order.filter(x=>x.enabled&&(x.sealedKey||env[keyVar[x.provider]]));
 if(!chain.length)return error(503,"AI_NOT_CONFIGURED","Admin belum mengaktifkan AI API Key. Tidak ada model Cloud yang dapat dijalankan.");
 const prompt="Susun DRAF laporan analisis iklim perbankan Indonesia (bukan assurance) dari data agregat GreenCal berikut: "+
 JSON.stringify(data)+
 ". Struktur 1 Ringkasan profil emisi; 2 Hotspot Scope 1-3 dan financed emissions; 3 Analisis risiko dan gap data; 4 Rekomendasi prioritas; 5 Draf narasi laporan keberlanjutan. "+
 "Bedakan fakta dan asumsi. Jangan mengarang angka atau menyatakan audit PASS, patuh OJK, atau skor kepatuhan final. Tahun, emisi tCO2e, outstanding Rp miliar. Bahasa Indonesia profesional.";
 const failed=[];
 for(const x of chain){
  try{
   const narrative=await invoke(x,prompt,env);
   return asJson({ok:true,narrative,provider:x.provider,model:x.model,failedProviders:failed,generatedAt:new Date().toISOString(),
     caution:"Hasil AI adalah draf, perlu review dan validasi manusia sebelum pengungkapan resmi."});
  }catch(e){failed.push(x.provider);}
 }
 return asJson({ok:false,code:"ALL_PROVIDERS_FAILED",message:"Seluruh model aktif gagal. Periksa model, key, kuota, dan jaringan.",failedProviders:failed},502);
}
export default {async fetch(request,env){
 const url=new URL(request.url);
 if(!url.pathname.startsWith("/api/ai/"))return env.ASSETS.fetch(request);
 if(!["GET","POST"].includes(request.method))return error(405,"METHOD","Method tidak diizinkan.");
 if(request.method==="POST"&&request.headers.get("Origin")!==url.origin)return error(403,"ORIGIN","Origin tidak diizinkan.");
 if(!env.AI_CONFIG)return error(503,"KV_NOT_BOUND","Penyimpanan konfigurasi belum aktif.");
 const actor=await identity(request,env);
 if(actor.error)return actor.error;
 if(url.pathname==="/api/ai/status"&&request.method==="GET")
  return asJson({ok:true,role:actor.role,config:publicConfig(await loadConfig(env),env)});
 if(url.pathname==="/api/ai/settings"&&request.method==="POST"){
  if(actor.role!=="Admin")return error(403,"ADMIN_ONLY","Hanya Admin dapat mengubah prioritas AI.");
  return saveSettings(request,env,actor);
 }
 if(url.pathname==="/api/ai/analyze"&&request.method==="POST")return analyze(request,env);
 return error(404,"NOT_FOUND","API tidak tersedia.");
}};
/* Public calculator: optional AI Cloud is aggregate-only and rate-limited on D1.
 * Never expose provider keys, priority settings, or admin status.
 * The Worker verifies same-origin, Cloudflare-derived scope and per-day quotas.
 */
export async function handlePublicAiApi(request,env,scope){
  const url=new URL(request.url);
  if(url.pathname==="/api/ai/status"&&request.method==="GET"){
    let ready=false;
    if(env.GREENCAL_PUBLIC_AI_ENABLED==="true"&&env.AI_CONFIG&&env.DB&&scope){
      const cfg=await loadConfig(env);
      ready=(cfg.order||[]).some(x=>x.enabled&&(x.sealedKey||env[keyVar[x.provider]]));
    }
    return asJson({ok:true,role:"public",publicCloudEnabled:ready,
      remainingPolicy:{perNetworkDay:3,globalDay:50},
      message:ready?"AI Cloud tersedia untuk data agregat dengan batas harian.":"Analisa lokal tetap tersedia; AI Cloud belum diaktifkan."});
  }
  if(url.pathname!=="/api/ai/analyze"||request.method!=="POST")return error(404,"NOT_FOUND","Endpoint tidak tersedia.");
  if(env.GREENCAL_PUBLIC_AI_ENABLED!=="true")return error(403,"AI_PUBLIC_DISABLED","AI Cloud publik belum diaktifkan; gunakan Analisa Lokal.");
  if(!scope||!env.DB||!env.AI_CONFIG)return error(503,"AI_UNAVAILABLE","Identitas jaringan atau layanan AI tidak tersedia.");
  if(request.headers.get("Origin")!==url.origin || !["same-origin","none"].includes(request.headers.get("Sec-Fetch-Site")||"same-origin"))
    return error(403,"ORIGIN","Permintaan lintas situs tidak diizinkan.");
  if((request.headers.get("Content-Type")||"").split(";")[0].trim().toLowerCase()!=="application/json")
    return error(415,"CONTENT_TYPE","Gunakan Content-Type application/json.");
  if(Number(request.headers.get("Content-Length")||0)>8192)return error(413,"INPUT_TOO_LARGE","Data agregat terlalu besar.");
  // Verify input before spending quota; never pass arbitrary user text to providers.
  let payload;
  try{payload=validate(await request.clone().json());}catch(e){return error(400,"INVALID_INPUT",e.message);}
  if(!payload || payload.total===null)return error(400,"INVALID_INPUT","Data agregat tidak valid.");
  const {consumePublicAiQuota}=await import("./public-ai.js");
  let quota;
  try{quota=await consumePublicAiQuota(env.DB,scope);}catch(e){
    console.error("GreenCal public AI quota unavailable");
    return error(503,"QUOTA_UNAVAILABLE","Batas penggunaan AI tidak dapat diverifikasi.");
  }
  if(!quota.ok)return error(429,quota.code,"Kuota AI Cloud harian sudah tercapai. Gunakan Analisa Lokal.");
  return analyze(request,env);
}

/* GreenCal D1 IAM bridge: server-verified role for existing AI Gateway. */
export async function handleAiApi(request,env,actor){
 const url=new URL(request.url);
 if(!env.AI_CONFIG)return error(503,"KV_NOT_BOUND","Konfigurasi AI tidak terhubung.");
 if(!["GET","POST"].includes(request.method))return error(405,"METHOD","Method tidak didukung.");
 const role=actor.role==="admin"?"Admin":"Maker";
 if(url.pathname==="/api/ai/status"&&request.method==="GET")return asJson({ok:true,role,config:publicConfig(await loadConfig(env),env)});
 if(url.pathname==="/api/ai/settings"&&request.method==="POST"){
 if(role!=="Admin")return error(403,"ADMIN_ONLY","Hanya Admin yang dapat mengubah konfigurasi AI.");
 return saveSettings(request,env,{email:actor.email,role});
 }
 if(url.pathname==="/api/ai/analyze"&&request.method==="POST")return analyze(request,env);
 return error(404,"NOT_FOUND","Endpoint AI tidak tersedia.");
}
