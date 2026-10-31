// Strictly synthetic Vercel Preview authentication for Bank Sawan training.
// Selecting a persona is NOT genuine bank SSO, IdP enrollment, or a bank authorization.
// Works ONLY on the exact protected Preview branch, never Production or Cloudflare.
import {ApiError} from '../enterprise/policy.js';
export const SAWAN_DEMO_BRANCH='feat/bank-sawan-demo-20261031';
export const SAWAN_DEMO_TENANT='bank-sawan-demo';
export const SAWAN_DEMO_COOKIE='gc_sawan_sim';
const encoder=new TextEncoder();
export const SAWAN_DEMO_PERSONAS=Object.freeze({
 maker:{subject:'sawan-maker',email:'sawan-maker@example.invalid',role:'data_maker',label:'Maker — Data & Buku 6'},
 checker:{subject:'sawan-checker',email:'sawan-checker@example.invalid',role:'checker',label:'Checker — Pemeriksaan'},
 approver:{subject:'sawan-approver',email:'sawan-approver@example.invalid',role:'approver',label:'Approver — Persetujuan'},
 risk:{subject:'sawan-risk',email:'sawan-risk@example.invalid',role:'risk_analyst',label:'Risk Analyst — Readiness & Buku 7'},
 model:{subject:'sawan-model',email:'sawan-model@example.invalid',role:'climate_model_analyst',label:'Climate Model Analyst — Buku 7'},
 compliance:{subject:'sawan-compliance',email:'sawan-compliance@example.invalid',role:'compliance_reviewer',label:'Compliance Reviewer — Review'}
});
export function sawanDemoGate(env={}){
 return env.VERCEL_ENV==='preview' &&
  env.VERCEL_GIT_COMMIT_REF===SAWAN_DEMO_BRANCH &&
  env.GC_SAWAN_DEMO_ENABLED==='true' &&
  env.GC_ENTERPRISE_IDENTITY_MODE==='sawan-demo' &&
  typeof env.GC_SAWAN_DEMO_SECRET==='string' &&
  /^[A-Za-z0-9_-]{48,256}$/.test(env.GC_SAWAN_DEMO_SECRET);
}
const base64url=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const decode64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'=')),x=>x.charCodeAt(0));
const key=async secret=>crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
export async function createSawanDemoToken(persona,env,nowMs=Date.now()){
 if(!sawanDemoGate(env)||!Object.hasOwn(SAWAN_DEMO_PERSONAS,persona))throw new ApiError(403,'DEMO_NOT_ALLOWED','Demo tidak tersedia.');
 const exp=Math.floor(nowMs/1000)+3600;
 const data={p:persona,iat:Math.floor(nowMs/1000),exp,nonce:crypto.randomUUID()};
 const body=base64url(encoder.encode(JSON.stringify(data)));
 const signed=new Uint8Array(await crypto.subtle.sign('HMAC',await key(env.GC_SAWAN_DEMO_SECRET),encoder.encode(body)));
 return body+'.'+base64url(signed);
}
export async function verifySawanDemoIdentity(request,env,nowMs=Date.now()){
 if(!sawanDemoGate(env)||env.GC_ENTERPRISE_DEMO_MODE!=='true')
  throw new ApiError(503,'DEMO_DISABLED','Simulasi Bank Sawan belum diaktifkan.');
 const cookies=request.headers.get('cookie')||'';
 const token=cookies.split(';').map(x=>x.trim()).find(x=>x.startsWith(SAWAN_DEMO_COOKIE+'='))?.slice(SAWAN_DEMO_COOKIE.length+1);
 if(!token||token.length>1500)throw new ApiError(401,'LOGIN_REQUIRED','Pilih peran simulasi Bank Sawan.');
 try{
  const parts=token.split('.');
  if(parts.length!==2||!/^[A-Za-z0-9_-]{20,1200}$/.test(parts[0])||!/^[A-Za-z0-9_-]{43}$/.test(parts[1]))throw Error('token');
  const ok=await crypto.subtle.verify('HMAC',await key(env.GC_SAWAN_DEMO_SECRET),decode64(parts[1]),encoder.encode(parts[0]));
  if(!ok)throw Error('signature');
  const v=JSON.parse(new TextDecoder().decode(decode64(parts[0]))),now=Math.floor(nowMs/1000);
  if(!v||!Object.hasOwn(SAWAN_DEMO_PERSONAS,v.p)||!Number.isInteger(v.exp)||!Number.isInteger(v.iat)||
    v.exp<=now||v.exp>now+3600||v.iat>now+30||v.iat<now-3600||v.exp-v.iat!==3600||
    typeof v.nonce!=='string'||!/^[-0-9a-f]{36}$/.test(v.nonce))throw Error('expiry');
  const p=SAWAN_DEMO_PERSONAS[v.p];
  return {subject:p.subject,email:p.email};
 }catch{throw new ApiError(401,'INVALID_DEMO_SESSION','Sesi simulasi berakhir; pilih kembali peran.');}
}
export const demoCookie=token=>SAWAN_DEMO_COOKIE+'='+token+'; Path=/api/enterprise; HttpOnly; Secure; SameSite=Strict; Max-Age=3600';
export const clearDemoCookie=()=>SAWAN_DEMO_COOKIE+'=; Path=/api/enterprise; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
