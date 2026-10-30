// GreenCal institutional release sign-offs. Zero defaults, no automatic bank approval.
import {ApiError} from './policy.js';
import {readJson} from './validation.js';
const functions=['risk','finance','compliance','it','independent_model_validation'];
const reviewerRole={risk:'risk_management_head',finance:'approver',compliance:'compliance_reviewer',it:'institution_administrator',independent_model_validation:'internal_auditor'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
const invalid=(s)=>{throw new ApiError(400,'RELEASE_INPUT_INVALID',s);};
const deny=()=>{throw new ApiError(403,'RELEASE_ROLE_DENIED','Peran atau assignment reviewer tidak sesuai.');};
const sha=(x,format)=>{if(typeof x!=='string'||!(format==='commit'?/^[a-f0-9]{40}$/:/^[a-f0-9]{64}$/).test(x))invalid(format+' invalid.');return x;};
const str=(x,label,min=8,max=500)=>{if(typeof x!=='string'||x.trim().length<min||x.length>max)invalid(label+' tidak valid.');return x.trim();};
const itemId=x=>{if(typeof x!=='string'||!/^[a-f0-9-]{36}$/.test(x))invalid('Candidate UUID tidak valid.');return x;};
async function status(db,tenant,id){
 const candidate=await db.prepare('SELECT id,commit_sha,build_sha256,evidence_sha256,created_by,created_at FROM gcx_release_candidates WHERE tenant_id=? AND id=?').bind(tenant,id).first();
 if(!candidate)throw new ApiError(404,'RELEASE_NOT_FOUND','Candidate rilis institusi tidak ditemukan.');
 const assignments=(await db.prepare('SELECT function,reviewer_subject,reviewer_role,approved_appointment_reference FROM gcx_release_assignments WHERE tenant_id=?').bind(tenant).all()).results;
 const reviews=(await db.prepare('SELECT function,reviewer_subject,outcome,evidence_sha256,evidence_reference,reviewed_at FROM gcx_release_reviews WHERE tenant_id=? AND candidate_id=?').bind(tenant,id).all()).results;
 const missing=functions.filter(f=>!reviews.some(r=>r.function===f&&r.outcome==='approved'));
 const rejected=reviews.filter(r=>r.outcome==='rejected').map(r=>r.function);
 const ready=missing.length===0&&rejected.length===0&&new Set(reviews.map(r=>r.reviewer_subject)).size===5;
 return {candidate,assignments,reviews,required: functions,missing,rejected,approvalStatus:ready?'attestations_complete_subject_to_bank_and_regulator_checks':'blocked',bankProductionReady:false,officialOjkApproved:false};
}
export async function handleReleaseApi(request,env,db,tenant,actor,path){
 if(env.GC_ENTERPRISE_RELEASE_ENABLED!=='true')throw new ApiError(503,'RELEASE_DISABLED','Bank release governance belum diaktifkan.');
 if(path==='/release/assignments'&&request.method==='POST'){
  if(actor.role!=='institution_administrator')deny();
  const p=await readJson(request);
  if(!functions.includes(p.function))invalid('Fungsi persetujuan tidak dikenal.');
  if(actor.subject===p.reviewerSubject)deny();
  const reviewer=await db.prepare('SELECT role FROM gcx_memberships WHERE tenant_id=? AND subject=? AND active=1').bind(tenant,p.reviewerSubject).first();
  if(!reviewer||reviewer.role!==reviewerRole[p.function])deny();
  const appointment=str(p.approvedAppointmentReference,'Surat penunjukan bank',12,320),at=new Date().toISOString();
  await db.prepare('INSERT INTO gcx_release_assignments(tenant_id,function,reviewer_subject,reviewer_role,approved_appointment_reference,appointed_by,appointed_at) VALUES(?,?,?,?,?,?,?)')
   .bind(tenant,p.function,p.reviewerSubject,reviewer.role,appointment,actor.subject,at).run();
  return json({function:p.function,reviewerRole:reviewer.role,appointed:true,approvalNotYetGranted:true},201);
 }
 if(path==='/release/candidates'&&request.method==='POST'){
  if(!['crms_project_administrator','institution_administrator'].includes(actor.role))deny();
  const p=await readJson(request),commit=sha(p.commitSha,'commit'),build=sha(p.buildSha256),evidence=sha(p.evidenceSha256),id=crypto.randomUUID(),at=new Date().toISOString();
  await db.prepare('INSERT INTO gcx_release_candidates(tenant_id,id,commit_sha,build_sha256,evidence_sha256,created_by,created_at) VALUES(?,?,?,?,?,?,?)')
   .bind(tenant,id,commit,build,evidence,actor.subject,at).run();
  return json({id,commitSha:commit,status:'under_review',bankProductionReady:false},201);
 }
 const reviewRoute=/^\/release\/candidates\/([a-f0-9-]{36})\/reviews$/.exec(path);
 if(reviewRoute&&request.method==='POST'){
  const id=itemId(reviewRoute[1]),p=await readJson(request);
  if(!functions.includes(p.function)||reviewerRole[p.function]!==actor.role)deny();
  const assignment=await db.prepare('SELECT reviewer_subject FROM gcx_release_assignments WHERE tenant_id=? AND function=?').bind(tenant,p.function).first();
  if(!assignment||assignment.reviewer_subject!==actor.subject)deny();
  await status(db,tenant,id);
  if(!['approved','rejected'].includes(p.outcome))invalid('Outcome harus approved atau rejected.');
  const digest=sha(p.evidenceSha256),reference=str(p.evidenceReference,'Referensi bukti reviewer',12,500),attestation=str(p.attestation,'Pernyataan independen reviewer',35,2000);
  const at=new Date().toISOString();
  await db.prepare('INSERT INTO gcx_release_reviews(tenant_id,candidate_id,function,reviewer_subject,outcome,evidence_sha256,evidence_reference,attestation,reviewed_at) VALUES(?,?,?,?,?,?,?,?,?)')
   .bind(tenant,id,p.function,actor.subject,p.outcome,digest,reference,attestation,at).run();
  return json({candidateId:id,function:p.function,recorded:true,gate:await status(db,tenant,id)},201);
 }
 const candidateRoute=/^\/release\/candidates\/([a-f0-9-]{36})$/.exec(path);
 if(candidateRoute&&request.method==='GET')return json(await status(db,tenant,itemId(candidateRoute[1])));
 if(path==='/release/candidates'&&request.method==='GET'){
  const items=(await db.prepare('SELECT id FROM gcx_release_candidates WHERE tenant_id=? ORDER BY created_at DESC LIMIT 50').bind(tenant).all()).results;
  const candidates=[];for(const i of items)candidates.push(await status(db,tenant,i.id));
  return json({candidates});
 }
 if(path==='/release/assignments'&&request.method==='GET'){
  const assignments=(await db.prepare('SELECT function,reviewer_subject,reviewer_role,approved_appointment_reference,appointed_at FROM gcx_release_assignments WHERE tenant_id=?').bind(tenant).all()).results;
  return json({assignments,required:functions});
 }
 throw new ApiError(404,'NOT_FOUND','Endpoint release governance tidak ditemukan.');
}
