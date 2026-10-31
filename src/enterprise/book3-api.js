// Tenant-guarded OJK Buku 3 simulation: no bank-data persistence, source claims or regulatory submission.
import {ApiError} from './policy.js';
import {readJson} from './validation.js';
import {BOOK3_ASSETS,book3Debtor,book3Financed,book3CarbonCost,book3Activity} from './book3.js';
const fns=Object.freeze({debtor:book3Debtor,financed:book3Financed,carbon_cost:book3CarbonCost,activity:book3Activity});
const writers=new Set(['data_maker','risk_analyst','climate_model_analyst','compliance_reviewer','crms_project_administrator','risk_management_head']);
const json=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
export async function handleBook3Api(request,env,db,tenant,actor,path){
 if(path==='/book3/catalog'&&request.method==='GET')return json({book:3,title:'Metode Penghitungan Emisi',pdfPages:50,
  methods:Object.keys(fns),assetDenominators:BOOK3_ASSETS,ojkTiers:[1,2,3,4],pcafScoreOptional:true,
  mainFinancedScopes:['scope1','scope2'],supplementaryScope:'scope3',carbonCostScope:'scope1',
  sourceStatus:'user_uploaded_pdf_reviewed_official_workbook_not_imported',officialSubmission:false});
 if(path!=='/book3/validate'||request.method!=='POST')throw new ApiError(404,'BOOK3_NOT_FOUND','Proses Buku 3 tidak tersedia.');
 if(env.GC_ENTERPRISE_BOOK3_ENABLED!=='true')throw new ApiError(503,'BOOK3_DISABLED','Buku 3 belum diaktifkan untuk institusi ini.');
 if(!writers.has(actor.role))throw new ApiError(403,'BOOK3_ROLE_DENIED','Peran tidak memiliki hak menjalankan perhitungan Buku 3.');
 const data=await readJson(request);
 if(!Object.hasOwn(fns,data.kind))throw new ApiError(400,'BOOK3_UNKNOWN_KIND','Metode Buku 3 tidak dikenal.');
 const result=fns[data.kind](data.payload);
 return json({kind:data.kind,result,tenantId:tenant,stored:false,officialSubmission:false,
  validation:'internal_methodology_sandbox_not_bank_model_or_regulator_approval'});
}
