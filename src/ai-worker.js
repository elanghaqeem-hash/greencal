/* GreenCal AI Gateway — Maker-only authenticated access.
   API credential is held exclusively in Cloudflare Workers encrypted secrets.
   No application user may change the key; expiry is checked for every request.
*/
import { temporaryAiState } from "./temporary-ai.js";

const PROVIDERS=Object.freeze({
  gemini:{label:"Google Gemini"},
  openai:{label:"OpenAI"},
  openrouter:{label:"OpenRouter"},
  groq:{label:"Groq"}
});
const asJson=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
const error=(status,code,message)=>asJson({ok:false,code,message},status);
const emails=(x)=>String(x||"").split(",").map(v=>v.trim().toLowerCase()).filter(Boolean);
function decode64(s){const v=atob(s.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(s.length/4)*4,"="));return Uint8Array.from(v,c=>c.charCodeAt(0));}
async function identity(request,env){
 if(!env.CF_ACCESS_TEAM_DOMAIN||!env.CF_ACCESS_AUD)return {error:error(503,"ACCESS_NOT_CONFIGURED","Cloudflare Access GreenCal belum dikonfigurasi.")};
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
  const role=emails(env.GREENCAL_MAKER_EMAILS).includes(email)?"Maker":null;
  if(!role)return {error:error(403,"ROLE_DENIED","Akun ini bukan pengguna Maker GreenCal yang terdaftar.")};
  return {role,email};
 }catch{return {error:error(401,"INVALID_IDENTITY","Sesi login tidak valid atau kedaluwarsa.")};}
}

export { identity as verifyAccessIdentity };

function validate(input){
 if(!input||!Number.isInteger(input.year)||input.year<2020||input.year>2100)throw Error("Tahun tidak valid.");
 const keys=["total","scope1","scope2","scope3","financed","osCovered","osTotal","dataQuality"];
 const result={year:input.year};
 for(const k of keys){const n=input[k];if(n!==null&&n!==undefined&&(!Number.isFinite(n)||n<0||n>1e12))throw Error("Metrik "+k+" tidak valid.");result[k]=n??null;}
 if(result.total===null||result.financed===null)throw Error("Total emisi dan pembiayaan wajib diisi.");
 return result;
}
async function invoke(x,prompt,env){
 const key=env.GREENCAL_TEMP_AI_KEY;
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
 const access=temporaryAiState(env);
 if(access.expired)return error(410,"AI_EXPIRED","Masa berlaku API AI GreenCal berakhir pada Kamis, 22 Oktober 2026 pukul 23.59 WIB.");
 if(!access.configured)return error(503,"AI_NOT_CONFIGURED","API Key AI sementara belum dipasang pada Cloudflare Worker. Kalkulator emisi tetap tersedia.");
 if(Number(request.headers.get("content-length")||0)>8192)return error(413,"INPUT_TOO_LARGE","Data terlalu besar.");
 let data;
 try{data=validate(await request.json());}catch(e){return error(400,"INVALID_INPUT",e.message);}
 const prompt="Susun DRAF laporan analisis iklim perbankan Indonesia (bukan assurance) dari data agregat GreenCal berikut: "+
 JSON.stringify(data)+
 ". Struktur 1 Ringkasan profil emisi; 2 Hotspot Scope 1-3 dan financed emissions; 3 Analisis risiko dan gap data; 4 Rekomendasi prioritas; 5 Draf narasi laporan keberlanjutan. "+
 "Bedakan fakta dan asumsi. Jangan mengarang angka atau menyatakan audit PASS, patuh OJK, atau skor kepatuhan final. Tahun, emisi tCO2e, outstanding Rp miliar. Bahasa Indonesia profesional.";
 try {
  const narrative=await invoke({provider:access.provider,model:access.model},prompt,env);
  return asJson({ok:true,narrative,provider:access.provider,model:access.model,
   expiresAt:access.expiresAt,generatedAt:new Date().toISOString(),
   caution:"Hasil AI adalah draf, perlu review dan validasi manusia sebelum pengungkapan resmi."});
 }catch(e){
  console.error("GreenCal AI provider request failed", {provider:access.provider,message:String(e.message||e)});
  return error(502,"AI_PROVIDER_FAILED","Model AI sementara gagal merespons. Periksa key, model, kuota, dan jaringan pada Cloudflare Worker.");
 }
}

export async function handleAiApi(request,env,user){
 const url=new URL(request.url);
 if(user?.role!=="maker")return error(403,"MAKER_ONLY","Hanya Maker aktif yang dapat menggunakan AI GreenCal.");
 if(url.pathname==="/api/ai/status"&&request.method==="GET"){
  const a=temporaryAiState(env);
  return asJson({ok:true,mode:a.mode,role:"Maker",expiresAt:a.expiresAt,expired:a.expired,configured:a.configured,
   config:{order:a.provider?[{provider:a.provider,model:a.model,enabled:a.active,hasKey:a.configured}]:[],expiresAt:a.expiresAt,expired:a.expired}});
 }
 if(url.pathname==="/api/ai/settings")return error(403,"AI_SETTINGS_LOCKED","API Key dikelola sebagai secret Cloudflare; pengaturan melalui browser dinonaktifkan.");
 if(url.pathname==="/api/ai/analyze"&&request.method==="POST")return analyze(request,env);
 return error(404,"NOT_FOUND","Endpoint tidak tersedia.");
}
