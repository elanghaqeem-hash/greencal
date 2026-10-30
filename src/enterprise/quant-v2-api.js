import {ApiError} from './policy.js';
import {readJson} from './validation.js';
import {physicalDamageModel,lifetimeCreditEcl,capitalAndProfitBridge,sourceManifest} from './quant-v2.js';
const kindFns={physical_damage:physicalDamageModel,lifetime_ecl:lifetimeCreditEcl,capital_bridge:capitalAndProfitBridge,source_manifest:sourceManifest};
const roles={physical_damage:['risk_analyst','climate_model_analyst'],lifetime_ecl:['risk_analyst','climate_model_analyst'],capital_bridge:['risk_analyst'],source_manifest:['data_maker']};
const readers=new Set(['institution_administrator','crms_project_administrator','data_maker','risk_analyst','climate_model_analyst','checker','approver','risk_management_head','compliance_reviewer','internal_auditor','external_auditor','sharia_governance_reviewer','executive_viewer']);
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const forbidden=()=>{throw new ApiError(403,'ADVANCED_ROLE_DENIED','Tidak diizinkan untuk role ini.');};
const checksum=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data)))),x=>x.toString(16).padStart(2,'0')).join('');
export async function handleAdvancedAnalytics(request,env,db,tenant,actor,path){
 if(env.GC_ENTERPRISE_QUANT_ENABLED!=='true'||env.GC_ENTERPRISE_ADVANCED_ENABLED!=='true')throw new ApiError(503,'ADVANCED_DISABLED','Analitik lanjutan belum aktif di institusi ini.');
 if(!readers.has(actor.role))forbidden();
 const method=request.method;
 if(path==='/analytics/advanced/runs'&&method==='POST'){
  const data=await readJson(request);
  if(!Object.hasOwn(kindFns,data.kind)||!roles[data.kind].includes(actor.role))forbidden();
  // Never trust submitted result/claimed approvals; results are computed server-side.
  const result=kindFns[data.kind](data.input);
  const inputHash=await checksum(data.input),outputHash=await checksum(result);
  const id=crypto.randomUUID(),now=new Date().toISOString();
  await db.prepare('INSERT INTO gcx_advanced_runs(tenant_id,id,kind,input_json,output_json,input_sha256,output_sha256,actor,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
   .bind(tenant,id,data.kind,JSON.stringify(data.input),JSON.stringify(result),inputHash,outputHash,actor.subject,now).run();
  return json({id,kind:data.kind,result,inputSha256:inputHash,outputSha256:outputHash,status:'internal_only',officialOjkSubmission:false},201);
 }
 if(path==='/analytics/advanced/runs'&&method==='GET'){
  const rows=await db.prepare('SELECT id,kind,input_sha256,output_sha256,actor,created_at,status FROM gcx_advanced_runs WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100').bind(tenant).all();
  return json({runs:rows.results,officialOjkSubmission:false});
 }
 const match=/^\/analytics\/advanced\/runs\/([a-f0-9-]{36})$/.exec(path);
 if(match&&method==='GET'){
  const r=await db.prepare('SELECT id,kind,output_json,input_sha256,output_sha256,actor,created_at,status FROM gcx_advanced_runs WHERE tenant_id=? AND id=?').bind(tenant,match[1]).first();
  if(!r)throw new ApiError(404,'RUN_NOT_FOUND','Perhitungan institusi tidak ditemukan.');
  return json({id:r.id,kind:r.kind,result:JSON.parse(r.output_json),inputSha256:r.input_sha256,outputSha256:r.output_sha256,status:r.status,actor:r.actor,createdAt:r.created_at,officialOjkSubmission:false});
 }
 throw new ApiError(404,'NOT_FOUND','Endpoint analitik tidak ditemukan.');
}
