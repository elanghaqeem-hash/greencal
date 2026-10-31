// Books 1/2/4 regulated sandbox API. Identity, role and tenant membership are checked by handleEnterpriseApi.
import {ApiError} from './policy.js';
import {readJson} from './validation.js';
import {DOCUMENTS,PATHS,REPORTED_PATHS,PILLARS,TRANSMISSION_RISKS,
 book4Validate,book4Deviation,book4Quarterly,book2CarbonCost,book1GovernanceCoverage} from './books124.js';
const json=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const WRITERS=['crms_project_administrator','data_maker','risk_analyst','climate_model_analyst','compliance_reviewer','risk_management_head'];
export async function handleBooks124Api(request,env,db,tenant,actor,path){
 if(path==='/books124/catalog'&&request.method==='GET'){
  return json({documents:DOCUMENTS,paths:PATHS,reportablePaths:REPORTED_PATHS,pillars:PILLARS,transmissionRisks:TRANSMISSION_RISKS,
   horizon:{from:2025,to:2050},status:'source_metadata_checked_models_not_bank_validated',
   officialSubmission:false});
 }
 if(path!=='/books124/validate'||request.method!=='POST')throw new ApiError(404,'NOT_FOUND','Operasi Books 1/2/4 tidak tersedia.');
 if(env.GC_ENTERPRISE_BOOK124_ENABLED!=='true')throw new ApiError(503,'BOOK124_DISABLED','Validasi Books 1/2/4 belum diaktifkan untuk institusi.');
 if(!WRITERS.includes(actor.role))throw new ApiError(403,'BOOK124_ROLE_DENIED','Peran ini tidak dapat menjalankan validasi data iklim.');
 const body=await readJson(request),kind=body.kind,p=body.payload;
 const f={book4_validate:book4Validate,book4_deviation:book4Deviation,book4_quarterly:book4Quarterly,
   book2_carbon_cost:book2CarbonCost,book1_governance:book1GovernanceCoverage}[kind];
 if(!f)throw new ApiError(400,'BOOK124_UNKNOWN_OPERATION','Operasi validasi tidak dikenali.');
 // No database writes, no storage and no default/synthetic macroeconomic values.
 const result=f(p);
 return json({kind,result,tenantId:tenant,evaluation:'internal_sandbox_not_ojk_report',stored:false});
}
