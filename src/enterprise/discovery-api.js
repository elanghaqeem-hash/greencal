// Tenant-isolated, versioned discovery readiness assessment API.
// Bank-sensitive answers never use localStorage, the public DB or public AI.
import {ApiError} from './policy.js';
import {DIMENSIONS,TOPICS,QUESTIONS,GROUP_NAMES,INVENTORY,QUALITY_TESTS,SOLUTIONS,analyzeReadiness} from './discovery.js';

const writers=new Set(['institution_administrator','crms_project_administrator','risk_analyst','climate_model_analyst','data_maker','compliance_reviewer']);
const checkers=new Set(['checker','compliance_reviewer','sharia_governance_reviewer']);
const approvers=new Set(['approver','risk_management_head']);
const limitedReaders=new Set(['external_auditor','executive_viewer']);
const send=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
const reject=(status,code,message)=>{throw new ApiError(status,code,message);};
const own=Object.prototype.hasOwnProperty;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const string=(value,label,max=1000)=>{
 if(value===undefined||value===null)return '';
 if(typeof value!=='string'||value.length>max)reject(400,'READINESS_INPUT_INVALID',label+' harus berupa teks maksimum '+max+' karakter.');
 return value.trim();
};
const groups={
 dimensions:{ids:DIMENSIONS.map(d=>d.id),score:true},
 topics:{ids:TOPICS.map(t=>t.id),score:true},
 answers:{ids:QUESTIONS.map(q=>q.id),statuses:['unknown','yes','partial','no','na']},
 inventory:{ids:INVENTORY.map(i=>i.id),statuses:['unknown','available','partial','unavailable','na']},
 quality:{ids:QUALITY_TESTS.map(q=>q.id),statuses:['untested','pass','partial','fail','na']}
};
function validatePayload(input){
 if(!object(input))reject(400,'READINESS_INPUT_INVALID','Isian assessment tidak valid.');
 for(const name of Object.keys(input))if(!['scope','asOf','interviewer','notes',...Object.keys(groups)].includes(name))reject(400,'READINESS_UNKNOWN_FIELD','Field tidak dikenal: '+name);
 const p={
  scope:string(input.scope,'Lingkup',500),
  asOf:string(input.asOf,'Tanggal posisi',10),
  interviewer:string(input.interviewer,'Asesor',120),
  notes:string(input.notes,'Catatan umum',3000),
  dimensions:{},topics:{},answers:{},inventory:{},quality:{}
 };
 if(p.asOf&&!/^\d{4}-\d{2}-\d{2}$/.test(p.asOf))reject(400,'READINESS_DATE_INVALID','Gunakan tanggal YYYY-MM-DD.');
 for(const [section,cfg] of Object.entries(groups)){
  const data=input[section]??{};
  if(!object(data))reject(400,'READINESS_INPUT_INVALID',section+' harus objek.');
  const ids=new Set(cfg.ids);
  for(const [id,item] of Object.entries(data)){
   if(!ids.has(id)||!object(item))reject(400,'READINESS_ITEM_INVALID','ID assessment tidak dikenal: '+id);
   const a={};
   const common=['evidenceRef','gap','owner','followUp','notes','blocker'];
   const fields=section==='dimensions'?['score',...common,'dueDate']:section==='topics'?['score','completenessPct',...common]:section==='answers'?['status','answer',...common]:section==='inventory'?['status','coveragePct','sourceSystem',...common]:['status','actual','nextAction',...common];
   for(const k of Object.keys(item))if(!fields.includes(k))reject(400,'READINESS_UNKNOWN_FIELD','Field tidak dikenal: '+section+'.'+id+'.'+k);
   for(const k of common)if(k!=='blocker')a[k]=string(item[k],k,k==='gap'||k==='followUp'?1500:500);
   if(item.blocker!==undefined&&typeof item.blocker!=='boolean')reject(400,'READINESS_BLOCKER_INVALID','Blocker harus benar/salah.');
   a.blocker=item.blocker===true;
   if(cfg.score){
    if(item.score===undefined||item.score===null||item.score==='')a.score=null;
    else if(Number.isInteger(item.score)&&item.score>=1&&item.score<=4)a.score=item.score;
    else reject(400,'READINESS_SCORE_INVALID','Skor harus bilangan bulat 1–4 atau kosong.');
    if(a.score>=3&&!a.evidenceRef)reject(400,'READINESS_EVIDENCE_REQUIRED','Skor 3–4 membutuhkan referensi bukti: '+id);
   }
   if(cfg.statuses){
    const status=item.status??cfg.statuses[0];
    if(!cfg.statuses.includes(status))reject(400,'READINESS_STATUS_INVALID','Status tidak valid: '+id);
    a.status=status;
   }
   if(section==='answers')a.answer=string(item.answer,'Jawaban',2000);
   if(section==='inventory'){a.sourceSystem=string(item.sourceSystem,'Sistem sumber',250);a.coveragePct=percentage(item.coveragePct,id);}
   if(section==='quality'){a.actual=string(item.actual,'Hasil aktual',800);a.nextAction=string(item.nextAction,'Tindak lanjut',800);}
   if(section==='topics')a.completenessPct=percentage(item.completenessPct,id);
   if(section==='dimensions')a.dueDate=string(item.dueDate,'Target tanggal',10);
   p[section][id]=a;
  }
 }
 if(JSON.stringify(p).length>200000)reject(413,'READINESS_TOO_LARGE','Assessment maksimum 200 KB.');
 return p;
}
function percentage(value,id){
 if(value===undefined||value===null||value==='')return null;
 if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>100)reject(400,'READINESS_PERCENT_INVALID','Persentase harus 0–100: '+id);
 return value;
}
async function read(request){
 if((request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()!=='application/json')reject(415,'READINESS_CONTENT_TYPE','Gunakan JSON.');
 if(Number(request.headers.get('content-length')||0)>240000)reject(413,'READINESS_TOO_LARGE','Permintaan terlalu besar.');
 if(!request.body)reject(400,'READINESS_EMPTY','Isian kosong.');
 let size=0,source='',decoder=new TextDecoder();const reader=request.body.getReader();
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>240000){await reader.cancel();reject(413,'READINESS_TOO_LARGE','Permintaan terlalu besar.');}source+=decoder.decode(value,{stream:true});}
 source+=decoder.decode();try{const b=JSON.parse(source);if(!object(b))throw Error('type');return b;}catch{reject(400,'READINESS_JSON_INVALID','JSON tidak valid.');}
}
const assessRow=row=>({...row,payload:JSON.parse(row.payload),analysis:analyzeReadiness(JSON.parse(row.payload))});
async function find(db,tenant,id,role){
 const row=await db.prepare('SELECT * FROM gcx_readiness_assessments WHERE tenant_id=? AND id=?').bind(tenant,id).first();
 if(!row||(limitedReaders.has(role)&&row.status!=='approved'))reject(404,'READINESS_NOT_FOUND','Assessment tidak ditemukan.');
 return row;
}
function workflow(row,action,actor,reason,payload){
 const owner=row.created_by===actor.subject;
 if(action==='submit'&&owner&&writers.has(actor.role)&&['draft','rejected'].includes(row.status)){
  const a=analyzeReadiness(payload);
  if(a.headline.coveragePct!==100||a.topics.coveragePct!==100)reject(400,'READINESS_INCOMPLETE','Nilai seluruh 6 dimensi dan 12 topik sebelum mengajukan assessment.');
  return {status:'submitted',checked_by:null,approved_by:null};
 }
 if(action==='check'&&row.status==='submitted'&&!owner&&checkers.has(actor.role))return {status:'checked',checked_by:actor.subject,approved_by:null};
 if(action==='approve'&&row.status==='checked'&&!owner&&row.checked_by!==actor.subject&&approvers.has(actor.role))return {status:'approved',checked_by:row.checked_by,approved_by:actor.subject};
 if(action==='reject'&&['submitted','checked'].includes(row.status)&&!owner&&(checkers.has(actor.role)||approvers.has(actor.role))&&reason)return {status:'rejected',checked_by:null,approved_by:null};
 reject(403,'READINESS_WORKFLOW_DENIED','Peran, status, SoD atau alasan belum memenuhi syarat.');
}
async function sha256(s){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');}
export async function handleDiscoveryApi(request,_env,db,tenant,actor,path){
 const method=request.method,url=new URL(request.url);
 if(path==='/discovery/catalog'&&method==='GET')return send({methodology:'internal_crst_readiness_2026_10_31_v1',dimensions:DIMENSIONS,topics:TOPICS,questionnaire:QUESTIONS,groups:GROUP_NAMES,inventory:INVENTORY,qualityTests:QUALITY_TESTS,solutions:SOLUTIONS,thresholds:[1.75,2.5,3.5],scale:'1 Initial / 2 Developing / 3 Established / 4 Advanced'});
 if(path==='/discovery/assessments'&&method==='GET'){
  const page=Number(url.searchParams.get('page')||1);
  if(!Number.isInteger(page)||page<1||page>10000)reject(400,'READINESS_PAGE_INVALID','Halaman tidak valid.');
  const extra=limitedReaders.has(actor.role)?" AND status='approved'":'';
  const rows=await db.prepare('SELECT * FROM gcx_readiness_assessments WHERE tenant_id=?'+extra+' ORDER BY updated_at DESC,id LIMIT 21 OFFSET ?').bind(tenant,(page-1)*20).all();
  return send({records:rows.results.slice(0,20).map(r=>({id:r.id,title:r.title,status:r.status,revision:r.revision,created_by:r.created_by,checked_by:r.checked_by,updated_at:r.updated_at,analysis:analyzeReadiness(JSON.parse(r.payload))})),hasMore:rows.results.length>20,page});
 }
 if(path==='/discovery/assessments'&&method==='POST'){
  if(!writers.has(actor.role))reject(403,'READINESS_ROLE_DENIED','Peran tidak boleh menyusun assessment.');
  const b=await read(request),title=string(b.title,'Judul',200),payload=validatePayload(b.payload);
  if(title.length<3)reject(400,'READINESS_TITLE_REQUIRED','Judul minimal 3 karakter.');
  const id=crypto.randomUUID(),now=new Date().toISOString();
  await db.prepare('INSERT INTO gcx_readiness_assessments(tenant_id,id,title,payload,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(tenant,id,title,JSON.stringify(payload),actor.subject,actor.subject,now,now).run();
  return send({assessment:assessRow(await find(db,tenant,id,actor.role))},201);
 }
 const m=/^\/discovery\/assessments\/([a-zA-Z0-9-]{1,80})(?:\/(workflow|history|export))?$/.exec(path);
 if(!m)reject(404,'READINESS_NOT_FOUND','Endpoint tidak ditemukan.');
 const [,id,action]=m,row=await find(db,tenant,id,actor.role);
 if(!action&&method==='GET')return send({assessment:assessRow(row)});
 if(action==='history'&&method==='GET'){
  const versions=await db.prepare('SELECT revision,status,actor,checked_by,approved_by,reason,occurred_at FROM gcx_readiness_versions WHERE tenant_id=? AND assessment_id=? ORDER BY revision DESC LIMIT 100').bind(tenant,id).all();
  return send({versions:versions.results});
 }
 if(action==='export'&&method==='GET'){
  if(row.status!=='approved')reject(409,'READINESS_NOT_APPROVED','Ekspor final hanya tersedia untuk hasil assessment disetujui.');
  const versions=await db.prepare('SELECT * FROM gcx_readiness_versions WHERE tenant_id=? AND assessment_id=? ORDER BY revision').bind(tenant,id).all();
  const result={schema:'greencal-readiness-v1',institutionId:tenant,assessment:assessRow(row),versions:versions.results,regulatorySubmission:false,bankProductionReady:false};
  return send({snapshot:result,sha256:await sha256(JSON.stringify(result)),disclaimer:'Asesmen internal yang disetujui reviewer; bukan bukti kepatuhan OJK atau persetujuan go-live bank.'});
 }
 if((!action&&method==='PATCH')||(action==='workflow'&&method==='POST')){
  const b=await read(request);
  if(!Number.isInteger(b.revision)||b.revision!==row.revision)reject(409,'READINESS_REVISION_CONFLICT','Revisi berubah; muat ulang sebelum menyimpan.');
  let status=row.status,title=row.title,payload=JSON.parse(row.payload),checked=row.checked_by,approved=row.approved_by,reason='';
  if(!action){
   if(row.created_by!==actor.subject||!writers.has(actor.role)||!['draft','rejected'].includes(row.status))reject(403,'READINESS_EDIT_DENIED','Hanya pembuat dapat mengubah draf atau revisi yang ditolak.');
   title=string(b.title,'Judul',200);if(title.length<3)reject(400,'READINESS_TITLE_REQUIRED','Judul minimal 3 karakter.');
   payload=validatePayload(b.payload);status='draft';checked=null;approved=null;
  }else{
   reason=string(b.reason,'Alasan',1200);
   const next=workflow(row,b.action,actor,reason,payload);
   status=next.status;checked=next.checked_by;approved=next.approved_by;
  }
  const now=new Date().toISOString();
  const updated=await db.prepare('UPDATE gcx_readiness_assessments SET title=?,payload=?,status=?,revision=revision+1,updated_by=?,checked_by=?,approved_by=?,reason=?,updated_at=? WHERE tenant_id=? AND id=? AND revision=? RETURNING id').bind(title,JSON.stringify(payload),status,actor.subject,checked,approved,reason,now,tenant,id,row.revision).first();
  if(!updated)reject(409,'READINESS_REVISION_CONFLICT','Revisi berubah; muat ulang.');
  return send({assessment:assessRow(await find(db,tenant,id,actor.role))});
 }
 reject(405,'READINESS_METHOD_DENIED','Metode tidak diizinkan.');
}
