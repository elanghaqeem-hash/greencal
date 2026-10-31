// Protected, tenant-isolated internal OJK Buku 6 drafts. No official OJK submission.
import {ApiError} from './policy.js';
import {book6Catalog,book6Preview,validateBook6Draft} from './book6.js';
const out=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const idPattern=/^[a-zA-Z0-9_-]{1,80}$/;
const editors=new Set(['data_maker','risk_analyst','climate_model_analyst','crms_project_administrator','compliance_reviewer']);
const sha=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),n=>n.toString(16).padStart(2,'0')).join('');
const notFound=()=>{throw new ApiError(404,'BOOK6_NOT_FOUND','Kertas kerja tidak ditemukan.');};
const readDocument=async request=>{
 if((request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()!=='application/json')throw new ApiError(415,'BOOK6_CONTENT_TYPE','Gunakan application/json.');
 const reader=request.body?.getReader();if(!reader)throw new ApiError(400,'BOOK6_EMPTY','Body kosong.');
 const decoder=new TextDecoder();let data='',size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
  if(size>1800000){await reader.cancel();throw new ApiError(413,'BOOK6_TOO_LARGE','Kertas kerja maksimum 1,8 MB.');}
  data+=decoder.decode(value,{stream:true});
 }
 data+=decoder.decode();
 try{const parsed=JSON.parse(data);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('type');return parsed;}
 catch{throw new ApiError(400,'BOOK6_BAD_JSON','Body JSON tidak valid.');}
};
export async function handleBook6Api(request,env,db,tenant,actor,path){
 if(actor.role==='external_auditor')throw new ApiError(403,'BOOK6_EXTERNAL_DENIED','Kertas kerja draf tidak dapat dibaca auditor eksternal.');
 if(env.GC_ENTERPRISE_BOOK6_ENABLED!=='true')throw new ApiError(503,'BOOK6_DISABLED','Kertas Kerja Buku 6 belum diaktifkan untuk institusi.');
 const method=request.method,url=new URL(request.url);
 if(path==='/book6/catalog'&&method==='GET')return out(book6Catalog());
 if(path==='/book6/workpapers'&&method==='GET'){
  const rows=await db.prepare('SELECT id,reporting_year,bank_code,revision,updated_at,created_by,status FROM gcx_book6_workpapers WHERE tenant_id=? ORDER BY updated_at DESC LIMIT 100').bind(tenant).all();
  return out({items:rows.results,officialSubmission:false});
 }
 if(path==='/book6/workpapers'&&method==='POST'){
  if(!editors.has(actor.role))throw new ApiError(403,'BOOK6_ROLE_DENIED','Role tidak dapat membuat kertas kerja.');
  const doc=validateBook6Draft(await readDocument(request)),id=crypto.randomUUID(),now=new Date().toISOString();
  await db.prepare('INSERT INTO gcx_book6_workpapers(tenant_id,id,reporting_year,bank_code,payload_json,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
   .bind(tenant,id,doc.reportingYear,doc.bank.code,JSON.stringify(doc),actor.subject,actor.subject,now,now).run();
  return out({id,revision:1,status:'draft',preview:book6Preview(doc),officialSubmission:false},201);
 }
 const match=/^\/book6\/workpapers\/([a-zA-Z0-9_-]{1,80})(?:\/(export))?$/.exec(path);
 if(!match)notFound();
 const id=match[1],action=match[2]||null;
 if(!idPattern.test(id))notFound();
 const row=await db.prepare('SELECT id,reporting_year,revision,payload_json,status,created_by,updated_by,created_at,updated_at FROM gcx_book6_workpapers WHERE tenant_id=? AND id=?').bind(tenant,id).first();
 if(!row)notFound();
 if(!action&&method==='GET'){
  const doc=JSON.parse(row.payload_json);return out({id,revision:row.revision,status:row.status,document:doc,preview:book6Preview(doc),officialSubmission:false});
 }
 if(action==='export'&&method==='GET'){
  const doc=JSON.parse(row.payload_json),preview=book6Preview(doc);
  const snapshot={schema:'greencal-book6-internal-evidence-v1',book6Version:'2026',tenantId:tenant,workpaperId:id,revision:row.revision,status:row.status,document:doc,preview,regulatoryReport:false,officialWorkbookParity:'unverified'};
  const json=JSON.stringify(snapshot);
  return out({snapshot,sha256:await sha(json),disclaimer:'Bukti kerja internal JSON saja. Bukan berkas Excel resmi OJK; bukan bukti penerimaan regulator.'});
 }
 if(!action&&method==='PATCH'){
  if(!editors.has(actor.role))throw new ApiError(403,'BOOK6_ROLE_DENIED','Role tidak dapat memperbarui kertas kerja.');
  const body=await readDocument(request);
  if(!Number.isInteger(body.revision)||body.revision!==row.revision)throw new ApiError(409,'BOOK6_REVISION_CONFLICT','Kertas kerja sudah diperbarui. Muat ulang sebelum menyimpan.');
  if(actor.subject!==row.created_by&&!['crms_project_administrator','compliance_reviewer'].includes(actor.role))
   throw new ApiError(403,'BOOK6_OWNER_DENIED','Hanya pembuat atau pengelola CRMS resmi institusi boleh mengedit.');
  if(row.status!=='draft')throw new ApiError(409,'BOOK6_IMMUTABLE','Hanya draf yang boleh diedit.');
  const doc=validateBook6Draft(body.document),now=new Date().toISOString();
  const update=await db.prepare('UPDATE gcx_book6_workpapers SET reporting_year=?,bank_code=?,payload_json=?,revision=revision+1,updated_by=?,updated_at=? WHERE tenant_id=? AND id=? AND revision=? AND status=\'draft\'')
   .bind(doc.reportingYear,doc.bank.code,JSON.stringify(doc),actor.subject,now,tenant,id,row.revision).run();
  if(update.meta?.changes!==1)throw new ApiError(409,'BOOK6_REVISION_CONFLICT','Revisi bertabrakan.');
  return out({id,revision:row.revision+1,status:'draft',preview:book6Preview(doc),officialSubmission:false});
 }
 throw new ApiError(405,'BOOK6_METHOD_DENIED','Metode tidak tersedia.');
}
