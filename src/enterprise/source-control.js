// Source-level bank GL reconciliation for multi-batch portfolio imports.
import {ApiError} from './policy.js';
import {readJson} from './validation.js';
const bad=(message,code='SOURCE_INPUT_INVALID')=>{throw new ApiError(400,code,message);};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const number=v=>{if(typeof v!=='string'||!/^(?:0|[1-9]\d{0,14})(?:\.\d{1,6})?$/.test(v))bad('Control total harus desimal.');const [a,b='']=v.split('.');return BigInt(a)*1000000n+BigInt(b.padEnd(6,'0'));};
const format=n=>String(n/1000000n)+(n%1000000n?'.'+String(n%1000000n).padStart(6,'0').replace(/0+$/,''):'');
const text=(s,key,max=160)=>{if(typeof s!=='string'||!s.trim()||s.length>max)bad(key+' diperlukan.');return s.trim();};
const stamp=s=>{if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s)||Number.isNaN(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)bad('Tanggal posisi harus ISO.');return s;};
export async function sourceStatus(db,tenant,hash){
 if(typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash))bad('SHA-256 sumber tidak valid.');
 const source=await db.prepare('SELECT * FROM gcx_portfolio_sources WHERE tenant_id=? AND source_sha256=?').bind(tenant,hash).first();
 if(!source)throw new ApiError(404,'SOURCE_NOT_FOUND','Kontrol sumber tidak ditemukan.');
 const rows=(await db.prepare('SELECT gl_control_total,gl_control_count,currency,as_of,source_system FROM gcx_portfolio_batches WHERE tenant_id=? AND source_sha256=? ORDER BY id LIMIT 1001').bind(tenant,hash).all()).results;
 if(rows.length>1000)bad('Lebih dari 1000 batch per berkas tidak didukung.', 'SOURCE_TOO_LARGE');
 let total=0n,count=0;for(const row of rows){
  if(row.currency!==source.currency||row.as_of!==source.as_of||row.source_system!==source.source_system)bad('Dimensi batch berbeda dari manifest.','SOURCE_DIMENSION_MISMATCH');
  total+=number(row.gl_control_total);count+=row.gl_control_count;
 }
 const matched=total===number(source.expected_total)&&count===source.expected_count;
 return {sourceSha256:hash,asOf:source.as_of,currency:source.currency,sourceSystem:source.source_system,controlReference:source.control_reference,expectedTotal:source.expected_total,expectedCount:source.expected_count,actualTotal:format(total),actualCount:count,completed:matched,sourceBatchCount:rows.length,status:matched?'reconciled_to_declared_GL':'incomplete_or_mismatched',officialSubmission:false};
}
async function reportingPreview(db,tenant,hash){
 const source=await sourceStatus(db,tenant,hash);
 if(!source.completed)throw new ApiError(409,'SOURCE_NOT_RECONCILED','Seluruh batch harus cocok dengan control total GL.');
 if(source.expectedCount>10000)throw new ApiError(422,'REPORT_BATCH_REQUIRED','Di atas 10.000 fasilitas perlu pipeline agregasi terkontrol.');
 const rows=(await db.prepare('SELECT p.data_json,p.result_json FROM gcx_portfolio_positions p JOIN gcx_portfolio_batches b ON b.tenant_id=p.tenant_id AND b.id=p.batch_id WHERE b.tenant_id=? AND b.source_sha256=? ORDER BY p.facility_ref LIMIT 10001').bind(tenant,hash).all()).results;
 if(rows.length!==source.expectedCount)throw new ApiError(409,'SOURCE_ROWS_MISMATCH','Record fisik berbeda dari metadata GL.');
 const groups=new Map(),totalScope={scope1:0n,scope2:0n,scope3:0n},coverage={scope1:{available:0,missing:0},scope2:{available:0,missing:0},scope3:{available:0,missing:0}};
 let total=0n;const seen=new Set();
 for(const item of rows){
  const p=JSON.parse(item.data_json),r=JSON.parse(item.result_json);
  if(seen.has(p.facilityRef))throw new ApiError(409,'SOURCE_DUPLICATE','Fasilitas duplikat.');seen.add(p.facilityRef);
  const exposure=number(p.outstanding);total+=exposure;
  const g=groups.get(p.assetClass)||{assetClass:p.assetClass,count:0,outstanding:0n,scope1:0n,scope2:0n,scope3:0n,missingScope3:0,quality:{'1':0,'2':0,'3':0,'4':0,'5':0}};
  g.count++;g.outstanding+=exposure;g.quality[String(p.dataQualityScore)]++;
  for(const k of ['scope1','scope2','scope3']){
   const value=r.financedTco2e[k];
   if(value===null){coverage[k].missing++;if(k==='scope3')g.missingScope3++;}
   else{const n=number(value);coverage[k].available++;g[k]+=n;totalScope[k]+=n;}
  }
  groups.set(p.assetClass,g);
 }
 if(format(total)!==source.expectedTotal)throw new ApiError(409,'SOURCE_GL_MISMATCH','Posisi berbeda dari GL.');
 return {source,byAssetClass:[...groups.values()].sort((a,b)=>a.assetClass.localeCompare(b.assetClass)).map(x=>({...x,outstanding:format(x.outstanding),scope1:format(x.scope1),scope2:format(x.scope2),scope3:format(x.scope3)})),totals:{outstanding:format(total),financedTco2e:Object.fromEntries(Object.entries(totalScope).map(([k,v])=>[k,format(v)])),coverage},method:'PCAF-internal-summary-with-GL-control-v1',disclosure:'Missing scopes excluded, not treated as zero; GL and hash are declared, not independently CBS-verified.',officialOjkSubmission:false};
}
export async function handleSourceControls(request,db,tenant,actor,path){
 if(path==='/analytics/sources'&&request.method==='POST'){
  if(actor.role!=='data_maker')throw new ApiError(403,'ROLE_DENIED','Hanya data maker dapat mendaftarkan kontrol sumber.');
  const body=await readJson(request);
  if(typeof body.sourceSha256!=='string'||!/^[a-f0-9]{64}$/.test(body.sourceSha256))bad('Hash sumber tidak valid.');
  const asOf=stamp(body.asOf),currency=text(body.currency,'Currency',3);
  if(!/^[A-Z]{3}$/.test(currency))bad('Kode mata uang tidak valid.');
  const controlTotal=format(number(body.glControlTotal));
  const controlCount=body.glControlCount;if(!Number.isSafeInteger(controlCount)||controlCount<1||controlCount>100000000)bad('Row count tidak valid.');
  const sourceSystem=text(body.sourceSystem,'Source System'),controlReference=text(body.controlReference,'GL Control Reference',240);
  const at=new Date().toISOString();
  // Duplicate source registration raises a DB constraint; immutable by design.
  await db.prepare('INSERT INTO gcx_portfolio_sources(tenant_id,source_sha256,as_of,currency,source_system,control_reference,expected_total,expected_count,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .bind(tenant,body.sourceSha256,asOf,currency,sourceSystem,controlReference,controlTotal,controlCount,actor.subject,at).run();
  return json({sourceSha256:body.sourceSha256,expectedTotal:controlTotal,expectedCount:controlCount,status:'awaiting_batched_import'},201);
 }
 if(path==='/analytics/sources'&&request.method==='GET'){
  const rows=(await db.prepare('SELECT source_sha256 FROM gcx_portfolio_sources WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100').bind(tenant).all()).results;
  const sources=[];for(const row of rows)sources.push(await sourceStatus(db,tenant,row.source_sha256));return json({sources});
 }
 const preview=/^\/analytics\/sources\/([a-f0-9]{64})\/report$/.exec(path);
 if(preview&&request.method==='GET')return json(await reportingPreview(db,tenant,preview[1]));
 const match=/^\/analytics\/sources\/([a-f0-9]{64})$/.exec(path);
 if(match&&request.method==='GET')return json(await sourceStatus(db,tenant,match[1]));
 throw new ApiError(404,'NOT_FOUND','Endpoint source control tidak ditemukan.');
}
