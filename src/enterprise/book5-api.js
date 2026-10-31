// Enterprise Buku 5 read-only risk screening; OJK data must be loaded and independently reviewed.
import {ApiError} from './policy.js';
import {readJson} from './validation.js';
import {BOOK5_HAZARDS,BOOK5_ASSET_LINES,BOOK5_SCENARIOS,BOOK5_YEARS,
 book5Selection,book5Evaluate,book5ConservativeDistrictMax} from './book5.js';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(v);
const scoreRow=x=>({year:Number(x.year),scores:Object.fromEntries(BOOK5_HAZARDS.map(k=>[k,x[k]]))});
export async function handleBook5Api(request,env,db,tenant,actor,path){
 if(path==='/book5/catalog'&&request.method==='GET'){
  let datasets=[],datasetReadiness='available';
  try{
   const r=await db.prepare('SELECT id,version,sha256,status,created_at FROM gcx_book5_datasets WHERE tenant_id=? ORDER BY created_at DESC LIMIT 30').bind(tenant).all();
   datasets=r.results;
  }catch{datasetReadiness='migration_or_database_unavailable';}
  return json({title:'OJK 2026 Buku 5 — Data Risiko Fisik',hazards:BOOK5_HAZARDS,assetLines:BOOK5_ASSET_LINES,
   scenarios:BOOK5_SCENARIOS,years:BOOK5_YEARS,scoreRange:[0,100],
   interpretation:'0 valid; combined score is source-published; 50 has overlapping categories in PDF and must be reviewed',
   datasets,datasetReadiness,officialSubmission:false});
 }
 if(path==='/book5/locations'&&request.method==='GET'){
  if(env.GC_ENTERPRISE_BOOK5_ENABLED!=='true')throw new ApiError(503,'BOOK5_DISABLED','Aktivasi Buku 5 institusi belum tersedia.');
  const url=new URL(request.url),datasetId=url.searchParams.get('datasetId'),q=(url.searchParams.get('q')||'').trim();
  if(!id(datasetId)||q.length>80)throw new ApiError(400,'BOOK5_BAD_QUERY','ID dataset atau pencarian tidak valid.');
  const source=await db.prepare("SELECT id FROM gcx_book5_datasets WHERE tenant_id=? AND id=? AND status='validated'").bind(tenant,datasetId).first();
  if(!source)throw new ApiError(409,'BOOK5_SOURCE_NOT_VALIDATED','Dataset belum diverifikasi untuk institusi ini.');
  const pattern='%'+q.replace(/[\\%_]/g,c=>'\\'+c)+'%';
  const result=await db.prepare("SELECT DISTINCT province,regency,district FROM gcx_book5_scores WHERE tenant_id=? AND dataset_id=? AND (province LIKE ? ESCAPE '\\' OR regency LIKE ? ESCAPE '\\' OR district LIKE ? ESCAPE '\\') ORDER BY province,regency,district LIMIT 60").bind(tenant,datasetId,pattern,pattern,pattern).all();
  return json({regions:result.results,limit:60});
 }
 if(path!=='/book5/screen'||request.method!=='POST')throw new ApiError(404,'BOOK5_NOT_FOUND','Endpoint Buku 5 tidak ditemukan.');
 if(env.GC_ENTERPRISE_BOOK5_ENABLED!=='true')throw new ApiError(503,'BOOK5_DISABLED','Buku 5 belum diaktifkan untuk institusi.');
 if(!['data_maker','risk_analyst','climate_model_analyst','risk_management_head'].includes(actor.role))
  throw new ApiError(403,'BOOK5_ROLE_DENIED','Peran ini tidak berwenang menjalankan analisis risiko fisik.');
 const selection=book5Selection(await readJson(request));
 const source=await db.prepare('SELECT id,sha256,version,status,latest_data_confirmed FROM gcx_book5_datasets WHERE tenant_id=? AND id=?').bind(tenant,selection.datasetId).first();
 if(!source||source.status!=='validated')throw new ApiError(409,'BOOK5_SOURCE_NOT_VALIDATED','Dataset fisik resmi harus dimuat dan lulus verifikasi independen.');
 const lower=2020+Math.floor((selection.year-2020)/10)*10;
 const upper=selection.year===lower?lower:lower+10;
 let rows;
 if(selection.locationMethod==='exact_district'){
  rows=(await db.prepare('SELECT year,flood,sea_level_rise,wildfire,heat_stress,water_stress,storm,combined FROM gcx_book5_scores WHERE tenant_id=? AND dataset_id=? AND province=? AND regency=? AND district=? AND asset_line=? AND scenario=? AND year IN (?,?) ORDER BY year').bind(tenant,selection.datasetId,selection.province,selection.regency,selection.district,selection.assetLine,selection.scenario,lower,upper).all()).results.map(scoreRow);
 }else{
  const raw=(await db.prepare('SELECT year,flood,sea_level_rise,wildfire,heat_stress,water_stress,storm,combined FROM gcx_book5_scores WHERE tenant_id=? AND dataset_id=? AND province=? AND regency=? AND asset_line=? AND scenario=? AND year IN (?,?) LIMIT 5000').bind(tenant,selection.datasetId,selection.province,selection.regency,selection.assetLine,selection.scenario,lower,upper).all()).results;
  if(raw.length===5000)throw new ApiError(409,'BOOK5_TOO_MANY_REGIONS','Fallback terlalu besar; tentukan kecamatan.');
  rows=book5ConservativeDistrictMax(raw.map(scoreRow));
 }
 const result=book5Evaluate(selection,rows,{sha256:source.sha256,version:source.version,
  status:source.status,latestDataConfirmed:source.latest_data_confirmed===1||source.latest_data_confirmed===true});
 return json({tenantId:tenant,result,stored:false,officialSubmission:false});
}
