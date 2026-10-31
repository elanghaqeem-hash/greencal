import {ApiError,KINDS,DOMAIN_KINDS,permissions,canCreate,transition} from './policy.js';
import {verifyEnterpriseIdentity} from './identity.js';
import {handleQuantApi} from './quant-api.js';
import {handleReleaseApi} from './release-api.js';
import {handleBook6Api} from './book6-api.js';
import {handleDiscoveryApi} from './discovery-api.js';
import {handleSourceRegistry} from './source-registry.js';
import {readJson,validatePayload,calculateEmission,text} from './validation.js';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
const conflict=()=>{throw new ApiError(409,'REVISION_CONFLICT','Data berubah. Muat ulang data sebelum menyimpan.');};
const unpack=r=>r?{...r,payload:JSON.parse(r.payload)}:null;
const idPattern=/^[a-zA-Z0-9_-]{1,80}$/;
const tableFor=kind=>DOMAIN_KINDS.includes(kind)?'gcx_domain_records':'gcx_records';
const versionsFor=kind=>DOMAIN_KINDS.includes(kind)?'gcx_domain_versions':'gcx_record_versions';
export async function handleEnterpriseApi(request,env){
 try{
  if(env.GC_ENTERPRISE_ENABLED!=='true'||!env.ENTERPRISE_DB)throw new ApiError(503,'ENTERPRISE_NOT_ENABLED','Workspace enterprise belum diaktifkan; kalkulator publik tetap tersedia.');
  const url=new URL(request.url),method=request.method;
  if(!['GET','POST','PATCH'].includes(method))throw new ApiError(405,'METHOD_NOT_ALLOWED','Metode tidak diizinkan.');
  if(method!=='GET'&&(request.headers.get('origin')!==url.origin||!['same-origin','none'].includes(request.headers.get('sec-fetch-site')||'same-origin')))throw new ApiError(403,'ORIGIN_DENIED','Permintaan lintas situs ditolak.');
  const identity=await verifyEnterpriseIdentity(request,env),db=env.ENTERPRISE_DB;
  if(url.pathname==='/api/enterprise/session'&&method==='GET'){
   const tenants=await db.prepare('SELECT m.tenant_id,m.role,i.name,i.institution_type,i.currency FROM gcx_memberships m JOIN gcx_institutions i ON i.id=m.tenant_id WHERE m.subject=? AND m.email=? COLLATE NOCASE AND m.active=1 AND i.active=1 ORDER BY i.name').bind(identity.subject,identity.email).all();
   return json({user:identity,tenants:tenants.results.map(t=>({...t,permissions:permissions(t.role)})),release:'enterprise-domain-registers-v2'});
  }
  const tenant=request.headers.get('x-greencal-tenant')||'';
  if(!idPattern.test(tenant))throw new ApiError(400,'TENANT_REQUIRED','Pilih institusi.');
  const member=await db.prepare('SELECT m.role,i.name,i.institution_type,i.currency FROM gcx_memberships m JOIN gcx_institutions i ON i.id=m.tenant_id WHERE m.tenant_id=? AND m.subject=? AND m.email=? COLLATE NOCASE AND m.active=1 AND i.active=1').bind(tenant,identity.subject,identity.email).first();
  if(!member)throw new ApiError(403,'TENANT_DENIED','Tidak memiliki akses ke institusi ini.');
  const actor={...identity,role:member.role},path=url.pathname.replace('/api/enterprise','');
  const getRecord=async id=>{
   let row=await db.prepare('SELECT * FROM gcx_records WHERE tenant_id=? AND id=?').bind(tenant,id).first();
   if(!row)row=await db.prepare('SELECT * FROM gcx_domain_records WHERE tenant_id=? AND id=?').bind(tenant,id).first();
   if(!row||(actor.role==='external_auditor'&&row.status!=='approved'))throw new ApiError(404,'NOT_FOUND','Record tidak ditemukan.');return row;
  };
  async function preparedPayload(kind,payload){
   let p=validatePayload(kind,payload);
   if(kind==='emission')p=calculateEmission(p,await getRecord(p.factorId));
   if(kind==='physical'||kind==='transition'){
    const portfolio=await getRecord(p.portfolioId),scenario=await getRecord(p.scenarioId);
    if(portfolio.kind!=='portfolio'||portfolio.status!=='approved'||scenario.kind!=='scenario'||scenario.status!=='approved')throw new ApiError(400,'REFERENCE_NOT_APPROVED','Portofolio dan skenario harus disetujui secara terpisah terlebih dahulu.');
    const exposure=JSON.parse(portfolio.payload),source=JSON.parse(scenario.payload);
    p.portfolioSnapshot={id:portfolio.id,revision:portfolio.revision,facilityRef:exposure.facilityRef,asOf:exposure.asOf,currency:exposure.currency,ead:exposure.ead};
    p.scenarioSnapshot={id:scenario.id,revision:scenario.revision,framework:source.framework,vintage:source.vintage,horizonYear:source.horizonYear,sourceVersion:source.sourceVersion};
   }
   if(kind==='requirement'){
    const document=await getRecord(p.documentId);
    if(document.kind!=='regulatory_document'||document.status!=='approved')throw new ApiError(400,'DOCUMENT_NOT_APPROVED','Pilih dokumen sumber yang sudah direview dan disetujui.');
    if(p.page>JSON.parse(document.payload).pageCount)throw new ApiError(400,'INVALID_PAGE','Halaman melebihi dokumen sumber.');
    p.documentRevision=document.revision;p.documentHash=JSON.parse(document.payload).sha256;
   }
   return p;
  }
  if(path.startsWith('/discovery/'))return handleDiscoveryApi(request,env,db,tenant,actor,path);
  if(path.startsWith('/book6/'))return handleBook6Api(request,env,db,tenant,actor,path);
  if(path.startsWith('/source-registry'))return handleSourceRegistry(request,env,db,tenant,actor,path);
  if(path.startsWith('/release/'))return handleReleaseApi(request,env,db,tenant,actor,path);
  if(path.startsWith('/analytics/'))return handleQuantApi(request,env,db,tenant,actor,path);
  if(path==='/institution'&&method==='GET')return json({id:tenant,...member,permissions:permissions(actor.role)});
  if(path==='/summary'&&method==='GET'){
   const visibility=actor.role==='external_auditor'?" AND status='approved'":'';
   const rows=await db.prepare('SELECT kind,status,COUNT(*) AS count FROM gcx_records WHERE tenant_id=?'+visibility+' GROUP BY kind,status').bind(tenant).all();
   const domain=await db.prepare('SELECT kind,status,COUNT(*) AS count FROM gcx_domain_records WHERE tenant_id=?'+visibility+' GROUP BY kind,status').bind(tenant).all();
   return json({counts:[...rows.results,...domain.results],regulatoryAcceptance:'not_validated',scope:'Approved portfolio/scenario governance and qualitative climate screening; financial loss models and official OJK reporting are not released.'});
  }
  if(path==='/audit'&&method==='GET'){
   if(!permissions(actor.role).audit)throw new ApiError(403,'ROLE_DENIED','Peran tidak dapat membaca audit institusi.');
   const before=Number(url.searchParams.get('before')||Number.MAX_SAFE_INTEGER);
   if(!Number.isSafeInteger(before)||before<1)throw new ApiError(400,'INVALID_CURSOR','Cursor tidak valid.');
   const events=await db.prepare('SELECT id,actor,action,target,occurred_at FROM gcx_events WHERE tenant_id=? AND id<? ORDER BY id DESC LIMIT 100').bind(tenant,before).all();
   return json({events:events.results,next:events.results.length===100?events.results.at(-1).id:null});
  }
  if(path==='/references'&&method==='GET'){
   const kind=url.searchParams.get('kind');
   if(!['portfolio','scenario'].includes(kind))throw new ApiError(400,'INVALID_KIND','Referensi hanya untuk portofolio atau skenario.');
   const q=(url.searchParams.get('q')||'').trim();
   if(q.length>100)throw new ApiError(400,'INVALID_QUERY','Pencarian terlalu panjang.');
   const escaped=q.replace(/[\\%_]/g,c=>'\\'+c);
   const rows=await db.prepare("SELECT id,title,revision FROM gcx_domain_records WHERE tenant_id=? AND kind=? AND status='approved' AND title LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT 100").bind(tenant,kind,'%'+escaped+'%').all();
   return json({records:rows.results,limit:100});
  }
  if(path==='/records'&&method==='GET'){
   const kind=url.searchParams.get('kind');if(!KINDS.includes(kind))throw new ApiError(400,'INVALID_KIND','Pilih jenis register.');
   const page=Number(url.searchParams.get('page')||1);if(!Number.isInteger(page)||page<1||page>10000)throw new ApiError(400,'INVALID_PAGE','Halaman tidak valid.');
   const rows=await db.prepare('SELECT * FROM '+tableFor(kind)+' WHERE tenant_id=? AND kind=? AND (?<>\'external_auditor\' OR status=\'approved\') ORDER BY updated_at DESC,id LIMIT 51 OFFSET ?').bind(tenant,kind,actor.role,(page-1)*50).all();
   return json({records:rows.results.slice(0,50).map(unpack),hasMore:rows.results.length>50,page});
  }
  if(path==='/records'&&method==='POST'){
   const body=await readJson(request),kind=body.kind;
   if(!canCreate(actor.role,kind))throw new ApiError(403,'ROLE_DENIED','Peran tidak dapat membuat register ini.');
   const title=text(body.title,'Judul',200),payload=await preparedPayload(kind,body.payload);
   const id=crypto.randomUUID(),now=new Date().toISOString();
   await db.prepare('INSERT INTO '+tableFor(kind)+'(tenant_id,id,kind,title,payload,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(tenant,id,kind,title,JSON.stringify(payload),actor.subject,actor.subject,now,now).run();
   return json({record:unpack(await getRecord(id))},201);
  }
  const match=/^\/records\/([a-zA-Z0-9_-]{1,80})(?:\/(workflow|history|export))?$/.exec(path);
  if(match){
   const [,id,action]=match,row=await getRecord(id);
   if(!action&&method==='GET')return json({record:unpack(row)});
   if(action==='history'&&method==='GET'){
    const versions=await db.prepare('SELECT revision,status,actor,checked_by,approved_by,reason,occurred_at FROM '+versionsFor(row.kind)+' WHERE tenant_id=? AND record_id=? ORDER BY revision DESC LIMIT 100').bind(tenant,id).all();
    return json({versions:versions.results});
   }
   if(action==='export'&&method==='GET'){
    if(row.status!=='approved')throw new ApiError(409,'NOT_APPROVED','Ekspor snapshot hanya untuk record disetujui.');
    const versions=await db.prepare('SELECT * FROM '+versionsFor(row.kind)+' WHERE tenant_id=? AND record_id=? ORDER BY revision').bind(tenant,id).all();
    const data=JSON.stringify({schema:'greencal-evidence-v1',tenantId:tenant,record:unpack(row),history:versions.results.map(unpack),regulatoryReport:false});
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data));
    return json({snapshot:JSON.parse(data),sha256:Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join(''),disclaimer:'Internal evidence export; not an official OJK working paper or submission.'});
   }
   if((!action&&method==='PATCH')||(action==='workflow'&&method==='POST')){
    const body=await readJson(request);
    if(!Number.isInteger(body.revision)||body.revision!==row.revision)conflict();
    let status=row.status,payload=row.payload,title=row.title,checked=row.checked_by,approved=row.approved_by,reason='';
    if(action){
     reason=typeof body.reason==='string'?body.reason.trim().slice(0,2000):'';
     const next=transition(row,body.action,actor,reason);status=next.status;checked=next.checked_by;approved=next.approved_by;
     // Validate the stored input again before submit/check/approve; never trust browser outputs.
     if(['submit','check','approve'].includes(body.action)){
      const original=JSON.parse(row.payload),validated=await preparedPayload(row.kind,original);
      if(row.kind==='emission'&&JSON.stringify(original.calculation)!==JSON.stringify(validated.calculation))throw new ApiError(409,'CALCULATION_CHANGED','Faktor atau hasil berubah; perbarui draf dan hitung ulang.');
     }
    }else{
     if(!['draft','rejected'].includes(row.status)||row.created_by!==actor.subject||!canCreate(actor.role,row.kind))throw new ApiError(403,'EDIT_DENIED','Hanya pembuat dapat mengedit draf atau revisi yang ditolak.');
     payload=JSON.stringify(await preparedPayload(row.kind,body.payload));title=text(body.title,'Judul',200);status='draft';checked=null;approved=null;
    }
    const result=await db.prepare('UPDATE '+tableFor(row.kind)+' SET title=?,payload=?,status=?,revision=revision+1,updated_by=?,checked_by=?,approved_by=?,reason=?,updated_at=? WHERE tenant_id=? AND id=? AND revision=? RETURNING id').bind(title,payload,status,actor.subject,checked,approved,reason,new Date().toISOString(),tenant,id,row.revision).first();
    if(!result)conflict();return json({record:unpack(await getRecord(id))});
   }
  }
  throw new ApiError(404,'NOT_FOUND','Endpoint tidak ditemukan.');
 }catch(e){
  if(e instanceof ApiError)return json({ok:false,code:e.code,message:e.message},e.status);
  console.error('GreenCal enterprise request failed');return json({ok:false,code:'ENTERPRISE_UNAVAILABLE',message:'Layanan enterprise tidak tersedia. Hubungi administrator.'},503);
 }
}
