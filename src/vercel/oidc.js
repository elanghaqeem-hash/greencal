// Bank-provided OIDC JWT verification for native Vercel runtime.
// Does not trust Vercel collaborator SSO, unsigned role claims, or browser-supplied email.
import {ApiError} from '../enterprise/policy.js';
const invalid=()=>{throw new ApiError(401,'INVALID_IDENTITY','Identitas institusi tidak valid atau kedaluwarsa.');};
const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'=')),c=>c.charCodeAt(0));
export function bankOidcConfig(env){
 const issuer=String(env.GC_ENTERPRISE_OIDC_ISSUER||'');
 const jwks=String(env.GC_ENTERPRISE_OIDC_JWKS_URL||'');
 const audience=String(env.GC_ENTERPRISE_OIDC_AUD||'');
 try{
  const a=new URL(issuer),b=new URL(jwks);
  // Pin the issuer and key set to a single bank-approved HTTPS origin; prevent SSRF.
  if(a.protocol!=='https:'||b.protocol!=='https:'||a.origin!==b.origin||
     a.username||a.password||b.username||b.password||a.port||b.port||
     !a.hostname.includes('.')||a.hostname.endsWith('.local')||a.hostname.endsWith('.internal')||
     a.search||a.hash||b.search||b.hash||audience.length<3||audience.length>256)return null;
  if(issuer.endsWith('/'))return null;
  if(b.pathname==='/'||b.pathname.length>300)return null;
  return {issuer,audience,jwksUrl:b.href};
 }catch{return null;}
}
export async function verifyBankOidcIdentity(request,env){
 const cfg=bankOidcConfig(env);
 if(!cfg)throw new ApiError(503,'ENTERPRISE_IDENTITY_NOT_CONFIGURED','OIDC institusi belum dikonfigurasi.');
 const auth=request.headers.get('authorization')||'';
 if(!auth)throw new ApiError(401,'LOGIN_REQUIRED','Masuk melalui identitas institusi.');
 if(auth.length>16100||!/^Bearer [A-Za-z0-9_.-]{50,16000}$/.test(auth))invalid();
 try{
  const token=auth.slice(7),parts=token.split('.');
  if(parts.length!==3)invalid();
  const [h,p,s]=parts,head=JSON.parse(new TextDecoder().decode(decode(h))),
    claims=JSON.parse(new TextDecoder().decode(decode(p)));
  const now=Math.floor(Date.now()/1000);
  const audiences=typeof claims.aud==='string'?[claims.aud]:claims.aud;
  if(head.alg!=='RS256'||typeof head.kid!=='string'||!/^[-_a-zA-Z0-9.]{1,128}$/.test(head.kid)||
     !Array.isArray(audiences)||!audiences.includes(cfg.audience)||claims.iss!==cfg.issuer||
     !Number.isInteger(claims.exp)||claims.exp<=now||claims.exp>now+3600||
     !Number.isInteger(claims.iat)||claims.iat>now+30||claims.iat<now-3600||
     (claims.nbf!==undefined&&(!Number.isInteger(claims.nbf)||claims.nbf>now))||
     typeof claims.sub!=='string'||claims.sub.length<1||claims.sub.length>255||
     typeof claims.email!=='string'||claims.email.length>254||
     !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email)||
     claims.email_verified!==true)invalid();
  const r=await fetch(cfg.jwksUrl,{signal:AbortSignal.timeout(5000),redirect:'error',
   headers:{Accept:'application/json'}});
  if(!r.ok||Number(r.headers.get('content-length')||0)>65536)invalid();
  const jwksText=await r.text();if(jwksText.length>65536)invalid();
  const jwks=JSON.parse(jwksText);
  const jwk=(jwks.keys||[]).find(k=>k.kid===head.kid&&k.kty==='RSA'&&
   (!k.alg||k.alg==='RS256')&&(!k.use||k.use==='sig')&&k.key_ops?.includes('verify')!==false);
  if(!jwk)invalid();
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(s),new TextEncoder().encode(h+'.'+p)))invalid();
  return {subject:claims.sub,email:claims.email.toLowerCase()};
 }catch(e){
  if(e instanceof ApiError)throw e;
  return invalid();
 }
}
