import {getPostgres} from '../src/vercel/postgres.js';
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
export async function handler(req,res){
 const path=resolveApiPath(req.query);
 if(!path)return send(res,404,{ok:false,code:'NOT_FOUND',message:'Endpoint tidak tersedia.'});
 if(path==='/api/health'&&req.method==='GET'){
  const postgres=!!(process.env.DATABASE_URL_POOLED||process.env.GREENCAL_POSTGRES_URL||process.env.DATABASE_URL);
  const sso=!!(process.env.GC_ENTERPRISE_ACCESS_DOMAIN&&process.env.GC_ENTERPRISE_ACCESS_AUD);
  const enabled=process.env.GC_ENTERPRISE_ENABLED==='true';
  return send(res,200,{ok:true,platform:'vercel',release:'controlled',
   frontend:'deployed',postgresConfigured:postgres,institutionSSOConfigured:sso,
   enterpriseEnabled:enabled&&postgres&&sso,bankProductionReady:false,
   regulatoryReportingApproved:false});
 }
 if(path==='/api/ai/status'&&req.method==='GET'){
  return send(res,200,{ok:true,role:'public',publicCloudEnabled:false,
   remainingPolicy:{perNetworkDay:0,globalDay:0},
   message:'AI Cloud Vercel belum diaktifkan; gunakan analisis lokal.'});
 }
 if(path.startsWith('/api/enterprise/')){
  if(process.env.GC_ENTERPRISE_ENABLED!=='true')
   return blocked(res,'ENTERPRISE_NOT_ENABLED','Workspace institusi belum diaktifkan oleh bank.');
  if(!process.env.GC_ENTERPRISE_ACCESS_DOMAIN||!process.env.GC_ENTERPRISE_ACCESS_AUD)
   return blocked(res,'ENTERPRISE_IDENTITY_NOT_CONFIGURED','SSO institusi belum tersedia.');
  if(!(process.env.DATABASE_URL_POOLED||process.env.GREENCAL_POSTGRES_URL||process.env.DATABASE_URL))
   return blocked(res,'ENTERPRISE_DB_NOT_CONFIGURED','Database institusi belum tersedia.');
  if(!req.headers['cf-access-jwt-assertion'])
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
   const env={GC_ENTERPRISE_ENABLED:'true',ENTERPRISE_DB:db,
      GC_ENTERPRISE_ACCESS_DOMAIN:process.env.GC_ENTERPRISE_ACCESS_DOMAIN,
      GC_ENTERPRISE_ACCESS_AUD:process.env.GC_ENTERPRISE_ACCESS_AUD};
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
