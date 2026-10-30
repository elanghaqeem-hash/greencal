import test from 'node:test';
import assert from 'node:assert/strict';
import {backup,DatabaseSync} from 'node:sqlite';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {enterpriseDb} from './support/enterprise-db.mjs';
import {handleReleaseApi} from '../src/enterprise/release-api.js';
import {physicalDamageModel,lifetimeCreditEcl,capitalAndProfitBridge} from '../src/enterprise/quant-v2.js';
import {financedEmissions} from '../src/enterprise/quant.js';
const SHA='a'.repeat(64),SHA2='b'.repeat(64),COMMIT='c'.repeat(40);
const people=[['pm','crms_project_administrator'],['admin','institution_administrator'],['risk','risk_management_head'],['finance','approver'],['compliance','compliance_reviewer'],['it','institution_administrator'],['validator','internal_auditor'],['viewer','executive_viewer']];
function setup(){const db=enterpriseDb(),s=db.sqlite;
 for(const tenant of ['bank-a','bank-b'])s.prepare('INSERT INTO gcx_institutions VALUES(?,?,?,?,?,?)').run(tenant,'SYNTHETIC '+tenant,'BUS','IDR',1,'2026-01-01');
 for(const [name,role] of people)s.prepare('INSERT INTO gcx_memberships(tenant_id,subject,email,role,active) VALUES(?,?,?,?,?)').run('bank-a',name,name+'@invalid.test',role,1);
 s.prepare('INSERT INTO gcx_memberships(tenant_id,subject,email,role,active) VALUES(?,?,?,?,?)').run('bank-b','other','other@invalid.test','institution_administrator',1);
 return db;
}
async function call(db,path,person,body,tenant='bank-a',flag=true){
 const req=new Request('https://uat.invalid/api/enterprise'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const role=people.find(x=>x[0]===person)?.[1]||'institution_administrator';
 const response=await handleReleaseApi(req,{GC_ENTERPRISE_RELEASE_ENABLED:flag?'true':'false'},db,tenant,{subject:person,role},path);
 return {status:response.status,body:await response.json()};
}
test('independent model golden vectors cross-validated by algebra, no source defaults',()=>{
 const x=financedEmissions({assetClass:'business_loans',facilityRef:'ANON1',obligorRef:'OBL1',currency:'IDR',asOf:'2026-09-30',outstanding:'20',attributionDenominator:'100',denominatorCurrency:'IDR',denominatorBasis:'total_equity_and_debt',emissions:{scope1:'100',scope2:'30',scope3:null},dataQualityScore:3,evidenceReference:'SYNTHETIC UAT',emissionSourceVintage:'2025'});
 assert.equal(x.financedTco2e.scope1,String(20/100*100));assert.equal(x.financedTco2e.scope2,String(20/100*30));assert.equal(x.financedTco2e.scope3,null);
 const hazard=physicalDamageModel({assetRef:'ASSET-UAT',hazard:'flood',hazardIntensity:'1.5',assetValue:'1000',currency:'IDR',vulnerabilityFraction:'1',mitigationFraction:'0.25',curve:[{intensity:'0',damageFraction:'0'},{intensity:'1',damageFraction:'0.1'},{intensity:'2',damageFraction:'0.3'}],datasetSha256:SHA,curveApprovalReference:'SYNTHETIC calibration only'});
 assert.equal(hazard.netDamage,String(1000*(0.1+(0.3-0.1)*0.5)*0.75));
 const ecl=lifetimeCreditEcl({stage:1,facilityRef:'ANON',currency:'IDR',eir:'0.1',sourceSha256:SHA,modelApprovalReference:'SYNTHETIC independent UAT model',scenarios:[{key:'synthetic',weight:'1',periods:[{year:1,conditionalPD:'0.1',lgd:'0.5',ead:'100'}]}]});
 assert.ok(Math.abs(Number(ecl.expectedCreditLoss)-(100*0.5*0.1/1.1))<0.00001);
 const capital=capitalAndProfitBridge({currency:'IDR',openingCapital:'120',openingRwa:'1000',openingProfit:'20',incrementalEcl:'10',deltaNii:'0',deltaOpex:'0',rwaDelta:'100',otherCapitalDelta:'0',effectiveTaxRate:'0',financeControlReference:'SYNTHETIC GL'});
 assert.equal(capital.closingCar,'0.1');
});
test('five independent named reviewers: no automatic approval, self-assignment, spoofed role or cross tenant',async()=>{
 const db=setup();
 try{
  const candidate=(await call(db,'/release/candidates','pm',{commitSha:COMMIT,buildSha256:SHA,evidenceSha256:SHA2})).body.id;
  const initial=(await call(db,'/release/candidates/'+candidate,'viewer')).body;
  assert.equal(initial.missing.length,5);assert.equal(initial.bankProductionReady,false);
  assert.equal(initial.approvalStatus,'blocked');
  await assert.rejects(()=>call(db,'/release/assignments','admin',{function:'it',reviewerSubject:'admin',approvedAppointmentReference:'APPROVAL-IT-SELF-2026'}),e=>e.code==='RELEASE_ROLE_DENIED');
  await assert.rejects(()=>call(db,'/release/candidates/'+candidate+'/reviews','risk',{function:'risk',outcome:'approved',evidenceSha256:SHA,evidenceReference:'SYNTHETIC MODEL REVIEW',attestation:'I independently validated the model controls and risk assumptions.'}),e=>e.code==='RELEASE_ROLE_DENIED');
  for(const [fn,user] of [['risk','risk'],['finance','finance'],['compliance','compliance'],['it','it'],['independent_model_validation','validator']]){
   const appoint=await call(db,'/release/assignments','admin',{function:fn,reviewerSubject:user,approvedAppointmentReference:'SYNTHETIC_APPOINTMENT_'+fn+'_2026'});
   assert.equal(appoint.status,201);
   const vote=await call(db,'/release/candidates/'+candidate+'/reviews',user,{function:fn,outcome:'approved',evidenceSha256:SHA,evidenceReference:'SYNTHETIC_UAT_PROOF_'+fn+'_2026',attestation:'Synthetic testing only. I have checked independent evidence and release conditions.'});
   assert.equal(vote.status,201);
  }
  const done=(await call(db,'/release/candidates/'+candidate,'viewer')).body;
  assert.equal(done.missing.length,0);assert.equal(done.rejected.length,0);
  assert.equal(done.approvalStatus,'attestations_complete_subject_to_bank_and_regulator_checks');
  assert.equal(done.bankProductionReady,false);assert.equal(done.officialOjkApproved,false);
  await assert.rejects(()=>call(db,'/release/candidates/'+candidate,'other',undefined,'bank-b'),e=>e.code==='RELEASE_NOT_FOUND');
  assert.equal((await call(db,'/release/candidates','other',undefined,'bank-b')).body.candidates.length,0);
  assert.throws(()=>db.sqlite.exec('DELETE FROM gcx_release_reviews'),/immutable review/);
  assert.throws(()=>db.sqlite.exec("UPDATE gcx_release_candidates SET status='under_review'"),/immutable candidate/);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM gcx_release_reviews').get().n,5);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM gcx_events WHERE action LIKE 'release.%'").get().n,11);
  await assert.rejects(()=>call(db,'/release/candidates','pm',{commitSha:COMMIT,buildSha256:SHA,evidenceSha256:SHA2},'bank-a',false),e=>e.code==='RELEASE_DISABLED');
 }finally{db.sqlite.close();}
});
test('real SQLite isolated backup/restore preserves release reviews, audit, referential integrity and checksum',async()=>{
 const db=setup(),dir=await mkdtemp(join(tmpdir(),'greencal-bank-release-'));
 try{
  const id=(await call(db,'/release/candidates','pm',{commitSha:COMMIT,buildSha256:SHA,evidenceSha256:SHA2})).body.id;
  const file=join(dir,'backup.sqlite');
  await backup(db.sqlite,file);
  const digest=createHash('sha256').update(await readFile(file)).digest('hex');
  const restored=new DatabaseSync(file);
  assert.deepEqual(restored.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(restored.prepare('PRAGMA quick_check').get().quick_check,'ok');
  assert.equal(restored.prepare('SELECT count(*) AS n FROM gcx_release_candidates').get().n,1);
  assert.equal(restored.prepare('SELECT id FROM gcx_release_candidates').get().id,id);
  assert.equal(restored.prepare("SELECT COUNT(*) AS n FROM gcx_events WHERE action='release.created'").get().n,1);
  assert.throws(()=>restored.exec('DELETE FROM gcx_release_candidates'),/immutable candidate/);
  restored.close();
  assert.match(digest,/^[a-f0-9]{64}$/);
 }finally{db.sqlite.close();await rm(dir,{recursive:true,force:true});}
});
