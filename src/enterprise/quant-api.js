import {ApiError} from './policy.js';
import {readJson} from './validation.js';
import {reconcilePortfolio,interpolateScenario,physicalOverlay,creditTransmission,standardizedApproach,reconcileOjkDraft} from './quant.js';
// Access identity, role and tenant membership have already been checked by handleEnterpriseApi.
const json=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const deny=()=>{throw new ApiError(403,'QUANT_ROLE_DENIED','Role tidak dapat melakukan operasi ini.');};
const roles=['institution_administrator','crms_project_administrator','data_maker','risk_analyst','climate_model_analyst','checker','approver','risk_management_head','compliance_reviewer','internal_auditor','sharia_governance_reviewer','executive_viewer'];
const writers={ngfs_interpolation:['climate_model_analyst'],geospatial_overlay:['risk_analyst','climate_model_analyst'],credit_transmission:['risk_analyst','climate_model_analyst'],book7_standardized:['climate_model_analyst'],ojk_reconciliation:['compliance_reviewer']};
const funcs={ngfs_interpolation:interpolateScenario,geospatial_overlay:physicalOverlay,credit_transmission:creditTransmission,book7_standardized:standardizedApproach};
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),x=>x.toString(16).padStart(2,'0')).join('');
function scaled(v){const [a,b='']=v.split('.');return BigInt(a)*1000000n+BigInt(b.padEnd(6,'0'));}
function format(n){return (n/1000000n).toString()+(n%1000000n?'.'+(n%1000000n).toString().padStart(6,'0').replace(/0+$/,''):'');}
async function batchReport(db,tenant,id){
 if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(id))throw new ApiError(400,'BAD_BATCH','Invalid batch ID.');
 const batch=await db.prepare('SELECT * FROM gcx_portfolio_batches WHERE tenant_id=? AND id=?').bind(tenant,id).first();
 if(!batch)throw new ApiError(404,'BATCH_NOT_FOUND','Batch tidak ditemukan.');
 const rows=(await db.prepare('SELECT data_json,result_json FROM gcx_portfolio_positions WHERE tenant_id=? AND batch_id=? ORDER BY facility_ref LIMIT 101').bind(tenant,id).all()).results;
 if(rows.length!==batch.gl_control_count||rows.length>100)throw new ApiError(409,'BATCH_INCOMPLETE','Posisi tidak lengkap.');
 const items=rows.map(x=>{const p=JSON.parse(x.data_json),r=JSON.parse(x.result_json);return {facilityRef:p.facilityRef,outstanding:p.outstanding,financed:format(['scope1','scope2','scope3'].reduce((sum,k)=>sum+(r.financedTco2e[k]===null?0n:scaled(r.financedTco2e[k])),0n))};});
 const report=reconcileOjkDraft({glControlTotal:batch.gl_control_total,items});
 return {batchId:id,asOf:batch.as_of,currency:batch.currency,sourceSha256:batch.source_sha256,sourceSystem:batch.source_system,controlReference:batch.gl_reference,reportedDataQuality:'declared_control_not_independently_verified',...report,book6Status:'draft_not_official_template'};
}
export async function handleQuantApi(request,env,db,tenant,actor,path){
 if(env.GC_ENTERPRISE_QUANT_ENABLED!=='true')throw new ApiError(503,'QUANT_DISABLED','Engine kuantitatif belum diaktifkan untuk lingkungan ini.');
 if(!roles.includes(actor.role))deny();
 if(path==='/analytics/import'&&request.method==='POST'){
  if(actor.role!=='data_maker')deny();
  const batch=reconcilePortfolio(await readJson(request)),id=crypto.randomUUID(),m=batch.metadata,now=new Date().toISOString();
  if(typeof db.batch!=='function')throw new ApiError(503,'TRANSACTION_REQUIRED','Database memerlukan D1 batch atomic.');
  const stmts=[db.prepare('INSERT INTO gcx_portfolio_batches(tenant_id,id,as_of,currency,source_sha256,source_system,gl_reference,gl_control_total,gl_control_count,owner_subject,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(tenant,id,m.asOf,m.currency,m.sourceSha256,m.sourceSystem,m.controlReference,m.glControlTotal,m.glControlCount,actor.subject,now)];
  for(let i=0;i<batch.exposures.length;i++)stmts.push(db.prepare('INSERT INTO gcx_portfolio_positions(tenant_id,batch_id,facility_ref,data_json,result_json) VALUES(?,?,?,?,?)').bind(tenant,id,batch.exposures[i].facilityRef,JSON.stringify(batch.exposures[i]),JSON.stringify(batch.results[i])));
  await db.batch(stmts);
  return json({id,metadata:m,count:batch.exposures.length,reconciliation:'pass_against_declared_GL',status:'internal_only'},201);
 }
 if(path==='/analytics/batches'&&request.method==='GET'){
  const rows=await db.prepare('SELECT id,as_of,currency,source_sha256,gl_reference,gl_control_total,gl_control_count,status FROM gcx_portfolio_batches WHERE tenant_id=? ORDER BY created_at DESC LIMIT 50').bind(tenant).all();
  return json({batches:rows.results,officialSubmission:false});
 }
 const bm=/^\/analytics\/batches\/([a-zA-Z0-9_-]{1,80})$/.exec(path);
 if(bm&&request.method==='GET')return json({reportPreview:await batchReport(db,tenant,bm[1])});
 if(path==='/analytics/runs'&&request.method==='POST'){
  const body=await readJson(request),kind=body.kind;
  if(!Object.hasOwn(writers,kind)||!writers[kind].includes(actor.role))deny();
  const result=kind==='ojk_reconciliation'?await batchReport(db,tenant,body.input?.batchId):funcs[kind](body.input);
  const id=crypto.randomUUID(),hash=await digest({kind,input:body.input,result}),now=new Date().toISOString();
  await db.prepare('INSERT INTO gcx_analytic_runs(tenant_id,id,kind,request_json,result_json,source_sha256,actor,occurred_at) VALUES(?,?,?,?,?,?,?,?)').bind(tenant,id,kind,JSON.stringify(body.input),JSON.stringify(result),hash,actor.subject,now).run();
  return json({id,kind,result,sha256:hash,createdAt:now,status:'internal_only'},201);
 }
 if(path==='/analytics/runs'&&request.method==='GET'){
  const kind=new URL(request.url).searchParams.get('kind');if(kind&&!Object.hasOwn(writers,kind))throw new ApiError(400,'INVALID_KIND','Jenis analitik tidak dikenal.');
  const rows=await db.prepare('SELECT id,kind,source_sha256,actor,occurred_at,status FROM gcx_analytic_runs WHERE tenant_id=? AND (? IS NULL OR kind=?) ORDER BY occurred_at DESC LIMIT 100').bind(tenant,kind,kind).all();
  return json({runs:rows.results,officialSubmission:false});
 }
 const rm=/^\/analytics\/runs\/([a-zA-Z0-9_-]{1,80})$/.exec(path);
 if(rm&&request.method==='GET'){
  const row=await db.prepare('SELECT id,kind,result_json,source_sha256,actor,occurred_at,status FROM gcx_analytic_runs WHERE tenant_id=? AND id=?').bind(tenant,rm[1]).first();
  if(!row)throw new ApiError(404,'RUN_NOT_FOUND','Perhitungan tidak ditemukan.');
  return json({id:row.id,kind:row.kind,result:JSON.parse(row.result_json),sha256:row.source_sha256,actor:row.actor,createdAt:row.occurred_at,status:row.status,officialSubmission:false});
 }
 throw new ApiError(404,'NOT_FOUND','Endpoint analitik tidak ditemukan.');
}
