import {createHmac} from 'node:crypto';
import {isIP} from 'node:net';
import {getPostgres,getPublicPostgres} from '../src/vercel/postgres.js';
import {handleVercelPublicAi} from '../src/vercel/public-ai.js';
import {bankOidcConfig} from '../src/vercel/oidc.js';
import {handleEnterpriseApi} from '../src/enterprise/api.js';

const NO_STORE={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const send=(res,status,body)=>{
 for(const [k,v] of Object.entries(NO_STORE))res.setHeader(k,v);
 res.setHeader('Content-Type','application/json; charset=utf-8');
 return res.status(status).json(body);
};
const blocked=(res,code,message)=>send(res,503,{ok:false,code,message});
export function resolveApiPath(query){
 const raw=query?.path;
 const path=Array.isArray(raw)?raw.join('/'):String(raw||'');
 if(!/^[a-zA-Z0-9/_-]{1,200}$/.test(path)||path.includes('//')||path.split('/').includes('..'))return null;
 return '/api/'+path.replace(/^\/+/,'');
}
export function publicNetworkScope(req,secret){
 // Accept only the Vercel-managed forwarding header, never the generic client-supplied fallback.
 const raw=req.headers?.['x-vercel-forwarded-for'];
 const ip=(typeof raw==='string'?raw.split(',')[0].trim():'');
 if(typeof secret!=='string'||secret.length<32||!isIP(ip))return null;
 return createHmac('sha256',secret).update('greencal:vercel:v1:'+ip).digest('hex');
}
export async function handler(req,res){
 const path=resolveApiPath(req.query);
 if(!path)return send(res,404,{ok:false,code:'NOT_FOUND',message:'Endpoint tidak tersedia.'});
 if(path==='/api/client-scope'&&req.method==='GET'){
  const scope=publicNetworkScope(req,process.env.IP_SCOPE_SECRET);
  return scope?send(res,200,{scope}):
   blocked(res,'NETWORK_SCOPE_UNAVAILABLE','Identitas jaringan tidak tersedia; penyimpanan dinonaktifkan.');
 }
 if(path==='/api/health'&&req.method==='GET'){
  const postgres=!!(process.env.DATABASE_URL_POOLED||process.env.GREENCAL_POSTGRES_URL||process.env.DATABASE_URL);
  const sso=process.env.GC_ENTERPRISE_IDENTITY_MODE==='oidc'?
   !!bankOidcConfig(process.env):
   !!(process.env.GC_ENTERPRISE_ACCESS_DOMAIN&&process.env.GC_ENTERPRISE_ACCESS_AUD);
  const enabled=process.env.GC_ENTERPRISE_ENABLED==='true';
  return send(res,200,{ok:true,platform:'vercel',release:'controlled',
   frontend:'deployed',postgresConfigured:postgres,institutionSSOConfigured:sso,
   enterpriseEnabled:enabled&&postgres&&sso,bankProductionReady:false,
   regulatoryReportingApproved:false,
   book7CatalogIncluded:true,book7ParametersPdfRounded:true,
   modulesConfigured:{book6:process.env.GC_ENTERPRISE_BOOK6_ENABLED==='true',book7:process.env.GC_ENTERPRISE_BOOK7_ENABLED==='true',quantitative:process.env.GC_ENTERPRISE_QUANT_ENABLED==='true',advanced:process.env.GC_ENTERPRISE_ADVANCED_ENABLED==='true',sourceReview:process.env.GC_ENTERPRISE_SOURCE_REVIEW_ENABLED==='true',releaseApproval:process.env.GC_ENTERPRISE_RELEASE_ENABLED==='true'}});
 }
 // Public AI has its own PostgreSQL quota database; never reuse bank data storage.
 if(path==='/api/ai/status'||path==='/api/ai/analyze'){
  if((path==='/api/ai/status'&&req.method!=='GET')||
     (path==='/api/ai/analyze'&&req.method!=='POST'))
   return send(res,405,{ok:false,code:'METHOD_NOT_ALLOWED',message:'Metode tidak diizinkan.'});
  try{
   const host=String(req.headers?.host||'');
   if(!/^[a-z0-9.-]+(?::[0-9]{2,5})?$/i.test(host))throw Error('INVALID_HOST');
   const headers=new Headers();
   for(const [key,value] of Object.entries(req.headers||{})){
    if(typeof value==='string')headers.set(key,value);
   }
   const payload=req.method==='POST'?
    (typeof req.body==='string'?req.body:JSON.stringify(req.body??{})):undefined;
   if(payload&&Buffer.byteLength(payload,'utf8')>8192)
    return send(res,413,{ok:false,code:'INPUT_TOO_LARGE',message:'Data agregat terlalu besar.'});
   const request=new Request('https://'+host+path,{method:req.method,headers,body:payload});
   let db=null;
   if(process.env.GREENCAL_PUBLIC_AI_ENABLED==='true'){
    db=await getPublicPostgres();
    if(db&&req.method==='GET'){
     try{
      const table=await db.prepare("SELECT to_regclass('gc_public_ai_quota') AS name").first();
      if(!table?.name)db=null;
     }catch{db=null;}
    }
   }
   const result=await handleVercelPublicAi(request,process.env,db,
      publicNetworkScope(req,process.env.IP_SCOPE_SECRET));
   for(const [key,value] of result.headers){
    if(['content-type','cache-control','x-content-type-options'].includes(key))res.setHeader(key,value);
   }
   return res.status(result.status).send(await result.text());
  }catch{
   return blocked(res,'PUBLIC_AI_BACKEND_UNAVAILABLE','Layanan AI belum siap. Gunakan analisis lokal.');
  }
 }
 if(path.startsWith('/api/enterprise/')){
  if(process.env.GC_ENTERPRISE_ENABLED!=='true')
   return blocked(res,'ENTERPRISE_NOT_ENABLED','Workspace institusi belum diaktifkan oleh bank.');
  const oidc=process.env.GC_ENTERPRISE_IDENTITY_MODE==='oidc';
  if(oidc?!bankOidcConfig(process.env):
     !process.env.GC_ENTERPRISE_ACCESS_DOMAIN||!process.env.GC_ENTERPRISE_ACCESS_AUD)
   return blocked(res,'ENTERPRISE_IDENTITY_NOT_CONFIGURED','SSO institusi belum tersedia.');
  if(!(process.env.DATABASE_URL_POOLED||process.env.GREENCAL_POSTGRES_URL||process.env.DATABASE_URL))
   return blocked(res,'ENTERPRISE_DB_NOT_CONFIGURED','Database institusi belum tersedia.');
  if(!(oidc?req.headers.authorization:req.headers['cf-access-jwt-assertion']))
   return send(res,401,{ok:false,code:'LOGIN_REQUIRED',message:'Sesi SSO institusi diperlukan.'});
  try{
   // A request-supplied header is NOT trusted. The shared implementation
   // verifies RSA signatures, issuer, audience, expiry and tenant membership.
   const db=await getPostgres();
   const host=String(req.headers.host||'');
   if(!/^[a-z0-9.-]+(?::[0-9]{2,5})?$/i.test(host))throw Error('INVALID_HOST');
   const headers=new Headers();
   for(const [key,value] of Object.entries(req.headers)){
    if(typeof value==='string')headers.set(key,value);
   }
   const isBody=!['GET','HEAD'].includes(req.method);
   const payload=isBody?(typeof req.body==='string'?req.body:JSON.stringify(req.body??{})):undefined;
   const request=new Request('https://'+host+path,{method:req.method,headers,body:payload});
   // Explicit allowlist; do not forward unreviewed process.env or service secrets.
   // All guarded modules remain OFF unless the institution configures each flag.
   const env={GC_ENTERPRISE_ENABLED:'true',ENTERPRISE_DB:db,
      GC_ENTERPRISE_ACCESS_DOMAIN:process.env.GC_ENTERPRISE_ACCESS_DOMAIN,
      GC_ENTERPRISE_ACCESS_AUD:process.env.GC_ENTERPRISE_ACCESS_AUD,
      GC_ENTERPRISE_IDENTITY_MODE:oidc?'oidc':'cloudflare',
      GC_ENTERPRISE_OIDC_ISSUER:oidc?process.env.GC_ENTERPRISE_OIDC_ISSUER:undefined,
      GC_ENTERPRISE_OIDC_JWKS_URL:oidc?process.env.GC_ENTERPRISE_OIDC_JWKS_URL:undefined,
      GC_ENTERPRISE_OIDC_AUD:oidc?process.env.GC_ENTERPRISE_OIDC_AUD:undefined,
      GC_ENTERPRISE_QUANT_ENABLED:process.env.GC_ENTERPRISE_QUANT_ENABLED==='true'?'true':'false',
      GC_ENTERPRISE_BOOK7_ENABLED:process.env.GC_ENTERPRISE_BOOK7_ENABLED==='true'?'true':'false',
      GC_ENTERPRISE_BOOK6_ENABLED:process.env.GC_ENTERPRISE_BOOK6_ENABLED==='true'?'true':'false',
      GC_ENTERPRISE_ADVANCED_ENABLED:process.env.GC_ENTERPRISE_ADVANCED_ENABLED==='true'?'true':'false',
      GC_ENTERPRISE_SOURCE_REVIEW_ENABLED:process.env.GC_ENTERPRISE_SOURCE_REVIEW_ENABLED==='true'?'true':'false',
      GC_ENTERPRISE_RELEASE_ENABLED:process.env.GC_ENTERPRISE_RELEASE_ENABLED==='true'?'true':'false',
      GC_ENTERPRISE_REQUIRE_SOURCE_MANIFEST:process.env.GC_ENTERPRISE_REQUIRE_SOURCE_MANIFEST==='true'?'true':'false'};
   const response=await handleEnterpriseApi(request,env);
   for(const [key,value] of response.headers){
    if(['content-type','cache-control','x-content-type-options','referrer-policy'].includes(key))res.setHeader(key,value);
   }
   return res.status(response.status).send(await response.text());
  }catch(e){
   console.error('GreenCal Vercel enterprise backend error',e?.code||e?.name||'unknown');
   return blocked(res,'ENTERPRISE_BACKEND_UNAVAILABLE','Layanan data institusi belum tersedia.');
  }
 }
 if(path.startsWith('/api/'))return blocked(res,'CLOUDFLARE_API_NOT_MIGRATED',
  'Endpoint menunggu migrasi database, autentikasi, dan validasi produksi ke Vercel.');
 return send(res,404,{ok:false,code:'NOT_FOUND',message:'Endpoint tidak tersedia.'});
}
export default handler;
