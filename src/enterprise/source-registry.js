// Immutable, tenant-isolated bank data and climate dataset provenance.
// HTTP paths share Access JWT, membership and same-origin checks with parent API.
import {ApiError} from './policy.js';
import {readJson} from './validation.js';
const modes=['cbs','gl','ckpn','ngfs_iamc','hazard_geojson'];
const reviewerRoles={data_quality:'checker',model_validation:'climate_model_analyst',authorization:'approver'};
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const invalid=(m)=>{throw new ApiError(400,'SOURCE_INVALID',m);};
const forbidden=()=>{throw new ApiError(403,'SOURCE_ROLE_DENIED','Reviewer atau maker tidak diizinkan.');};
const hash=(v)=>{if(typeof v!=='string'||!/^[a-f0-9]{64}$/i.test(v))invalid('SHA-256 sumber/hasil verifikasi tidak valid.');return v.toLowerCase();};
const phrase=(v,k,max=300)=>{if(typeof v!=='string'||v.trim().length<5||v.length>max)invalid(k+' wajib diisi.');return v.trim();};
const timestamp=(v)=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)invalid('Tanggal posisi tidak valid.');return v;};
function sourceUrl(v,type){
 let u;try{u=new URL(v);}catch{invalid('URL sumber tidak valid.');}
 if(u.protocol!=='https:'||u.username||u.password||u.hash||u.port&&u.port!=='443')invalid('Sumber harus HTTPS tanpa kredensial.');
 const host=u.hostname;
 const list=type==='ngfs_iamc'?['www.ngfs.net','ngfs.net','data.ene.iiasa.ac.at','www.iiasa.ac.at']:type==='hazard_geojson'?['gis.bnpb.go.id','inarisk.bnpb.go.id','gis.bmkg.go.id','www.bmkg.go.id']:null;
 if(list&&!list.includes(host))invalid('Dataset iklim harus pada situs sumber resmi.');
 // Banks use private approved host names; actual connection occurs from authorized bank agent, never this Worker.
 if(!list&&(host==='localhost'||/^\d+\.\d+\.\d+\.\d+$/.test(host)))invalid('Gunakan FQDN bank yang disetujui.');
 return u.href;
}
async function detail(db,tenant,id){
 if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))invalid('ID sumber tidak valid.');
 const source=await db.prepare('SELECT * FROM gcx_verified_source_candidates WHERE tenant_id=? AND id=?').bind(tenant,id).first();
 if(!source)throw new ApiError(404,'SOURCE_NOT_FOUND','Sumber institusi tidak ditemukan.');
 const reviews=(await db.prepare('SELECT reviewer_function,reviewer_subject,reviewer_role,outcome,evidence_reference,evidence_sha256,reviewed_at FROM gcx_source_attestations WHERE tenant_id=? AND source_id=? ORDER BY reviewer_function').bind(tenant,id).all()).results;
 const missing=Object.keys(reviewerRoles).filter(k=>!reviews.some(x=>x.reviewer_function===k&&x.outcome==='approved'));
 const rejected=reviews.filter(x=>x.outcome==='rejected').map(x=>x.reviewer_function);
 return {source,reviews,missing,rejected,attestationsComplete:missing.length===0&&rejected.length===0,
  dataValidatedForBankProduction:false,sourceApproval:'bank_original_bytes_and_license_still_require_independent_validation',reportingReady:false};
}
export async function handleSourceRegistry(request,env,db,tenant,actor,path){
 if(env.GC_ENTERPRISE_SOURCE_REVIEW_ENABLED!=='true')throw new ApiError(503,'SOURCE_REGISTRY_DISABLED','Registri dataset belum diaktifkan untuk institusi.');
 if(path==='/source-registry'&&request.method==='POST'){
  if(!['data_maker','climate_model_analyst'].includes(actor.role))forbidden();
  const x=await readJson(request);
  if(!modes.includes(x.sourceKind)||x.sourceKind==='ngfs_iamc'&&actor.role!=='climate_model_analyst'||x.sourceKind==='hazard_geojson'&&actor.role!=='climate_model_analyst'||['cbs','gl','ckpn'].includes(x.sourceKind)&&actor.role!=='data_maker')forbidden();
  const fileSha=hash(x.fileSha256),verification=hash(x.verificationArtifactSha256),source=phrase(x.sourceSystem,'Nama sistem sumber',120),url=sourceUrl(x.sourceUrl,x.sourceKind);
  const date=timestamp(x.asOf),version=phrase(x.version,'Versi',100),license=phrase(x.licenseReference,'Hak pakai dan lisensi',500);
  const id=crypto.randomUUID(),now=new Date().toISOString();
  await db.prepare('INSERT INTO gcx_verified_source_candidates(tenant_id,id,source_kind,source_system,source_url,file_sha256,verification_artifact_sha256,as_of,version,license_reference,submitted_by,submitted_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(tenant,id,x.sourceKind,source,url,fileSha,verification,date,version,license,actor.subject,now).run();
  return json({id,sourceKind:x.sourceKind,fileSha256:fileSha,status:'pending_evidence_review',dataValidatedForBankProduction:false},201);
 }
 if(path==='/source-registry'&&request.method==='GET'){
  const list=(await db.prepare('SELECT id FROM gcx_verified_source_candidates WHERE tenant_id=? ORDER BY submitted_at DESC LIMIT 100').bind(tenant).all()).results;
  const results=[];for(const r of list)results.push(await detail(db,tenant,r.id));return json({results});
 }
 const review=/^\/source-registry\/([a-f0-9-]{36})\/reviews$/.exec(path);
 if(review&&request.method==='POST'){
  const x=await readJson(request),role=reviewerRoles[x.function];
  if(!role||actor.role!==role)forbidden();
  const existing=await detail(db,tenant,review[1]);
  if(existing.source.submitted_by===actor.subject)forbidden();
  if(!['approved','rejected'].includes(x.outcome))invalid('Keputusan wajib approved atau rejected.');
  if(x.outcome==='approved'&&hash(x.confirmedFileSha256)!==existing.source.file_sha256)invalid('Reviewer harus mengonfirmasi hash lengkap asli.');
  const digest=hash(x.evidenceSha256),reference=phrase(x.evidenceReference,'Bukti reviewer',500),attestation=phrase(x.attestation,'Attestation',2000);
  if(attestation.length<35)invalid('Attestation minimum 35 karakter.');
  const at=new Date().toISOString();
  await db.prepare('INSERT INTO gcx_source_attestations(tenant_id,source_id,reviewer_function,reviewer_subject,reviewer_role,outcome,evidence_reference,evidence_sha256,attestation,reviewed_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
   .bind(tenant,review[1],x.function,actor.subject,actor.role,x.outcome,reference,digest,attestation,at).run();
  return json(await detail(db,tenant,review[1]),201);
 }
 const one=/^\/source-registry\/([a-f0-9-]{36})$/.exec(path);
 if(one&&request.method==='GET')return json(await detail(db,tenant,one[1]));
 throw new ApiError(404,'NOT_FOUND','Endpoint dataset registry tidak dikenal.');
}
