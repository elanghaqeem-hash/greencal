import {ApiError} from './policy.js';
const decode = s => Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'=')),c=>c.charCodeAt(0));
export async function verifyEnterpriseIdentity(request,env){
 const domain=String(env.GC_ENTERPRISE_ACCESS_DOMAIN||'');
 const aud=env.GC_ENTERPRISE_ACCESS_AUD;
 if(!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain)||!aud)throw new ApiError(503,'ENTERPRISE_IDENTITY_NOT_CONFIGURED','Identitas enterprise belum dikonfigurasi.');
 const token=request.headers.get('Cf-Access-Jwt-Assertion')||'';
 if(!token)throw new ApiError(401,'LOGIN_REQUIRED','Masuk melalui identitas institusi.');
 if(token.length>16000)throw new ApiError(401,'INVALID_IDENTITY','Sesi tidak valid.');
 try{
  const parts=token.split('.');if(parts.length!==3)throw Error();
  const [h,p,s]=parts,head=JSON.parse(new TextDecoder().decode(decode(h))),claims=JSON.parse(new TextDecoder().decode(decode(p)));
  const now=Math.floor(Date.now()/1000);
  if(head.alg!=='RS256'||typeof head.kid!=='string'||claims.iss!=='https://'+domain||!Array.isArray(claims.aud)||!claims.aud.includes(aud)||
   !Number.isFinite(claims.exp)||claims.exp<=now||!Number.isFinite(claims.iat)||claims.iat>now+30||
   (claims.nbf!==undefined&&(!Number.isFinite(claims.nbf)||claims.nbf>now))||
   typeof claims.sub!=='string'||claims.sub.length<1||claims.sub.length>255||typeof claims.email!=='string'||claims.email.length>254||!claims.email.includes('@'))throw Error();
  const r=await fetch('https://'+domain+'/cdn-cgi/access/certs',{signal:AbortSignal.timeout(5000),redirect:'error'});
  if(!r.ok)throw Error();
  const jwks=await r.json(),jwk=(jwks.keys||[]).find(k=>k.kid===head.kid&&k.kty==='RSA');
  if(!jwk)throw Error();
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(s),new TextEncoder().encode(h+'.'+p)))throw Error();
  return {subject:claims.sub,email:claims.email.toLowerCase()};
 }catch{throw new ApiError(401,'INVALID_IDENTITY','Identitas institusi tidak valid atau kedaluwarsa.');}
}
