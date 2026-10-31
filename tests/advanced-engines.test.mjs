import test from 'node:test';
import assert from 'node:assert/strict';
import {enterpriseDb} from './support/enterprise-db.mjs';
import {physicalDamageModel,lifetimeCreditEcl,capitalAndProfitBridge,sourceManifest} from '../src/enterprise/quant-v2.js';
import {handleAdvancedAnalytics} from '../src/enterprise/quant-v2-api.js';
const HASH='a'.repeat(64);
const damage={assetRef:'ASSET-ANON-01',hazard:'flood',hazardIntensity:'1.5',assetValue:'1000',currency:'IDR',vulnerabilityFraction:'1',mitigationFraction:'0.25',curve:[{intensity:'0',damageFraction:'0'},{intensity:'1',damageFraction:'0.1'},{intensity:'2',damageFraction:'0.3'}],datasetSha256:HASH,curveApprovalReference:'UAT only, not bank-approved'};
const ecl={stage:2,facilityRef:'ANON-FAC-001',currency:'IDR',eir:'0.1',sourceSha256:HASH,modelApprovalReference:'SYNTHETIC UAT, not accounting approved',scenarios:[
 {key:'orderly',weight:'0.5',periods:[{year:1,conditionalPD:'0.1',lgd:'0.5',ead:'100'},{year:2,conditionalPD:'0.2',lgd:'0.5',ead:'80'}]},
 {key:'disorderly',weight:'0.5',periods:[{year:1,conditionalPD:'0.2',lgd:'0.5',ead:'100'},{year:2,conditionalPD:'0.3',lgd:'0.5',ead:'80'}]}
]};
const capital={currency:'IDR',openingCapital:'120',openingRwa:'1000',openingProfit:'20',incrementalEcl:'10',deltaNii:'0',deltaOpex:'0',rwaDelta:'100',otherCapitalDelta:'0',effectiveTaxRate:'0',financeControlReference:'SYNTHETIC GL UAT'};
test('physical damage uses bank-supplied curve interpolation and transparently mitigates losses',()=>{
 const r=physicalDamageModel(damage);
 assert.equal(r.damageRatio,'0.2');assert.equal(r.grossDamage,'200');assert.equal(r.netDamage,'150');
 assert.throws(()=>physicalDamageModel({...damage,hazardIntensity:'10'}),/ekstrapolasi/i);
 assert.throws(()=>physicalDamageModel({...damage,curve:[damage.curve[0],damage.curve[0]]}));
 assert.throws(()=>physicalDamageModel({...damage,mitigationFraction:'1.2'}));
});
test('stage 1 12-month and stage 2 lifetime ECL are conditional PD and discounted; invalid stage 3 blocked',()=>{
 const r=lifetimeCreditEcl(ecl);
 assert.equal(r.scenarios.length,2);
 assert.equal(r.scenarios[0].periods.length,2);
 assert.equal(r.scenarios[0].periods[1].marginalPD,'0.18');
 assert.ok(Number(r.expectedCreditLoss)>0);
 assert.throws(()=>lifetimeCreditEcl({...ecl,stage:1}));
 assert.throws(()=>lifetimeCreditEcl({...ecl,stage:3}));
 assert.throws(()=>lifetimeCreditEcl({...ecl,scenarios:[{...ecl.scenarios[0],weight:'0.7'},{...ecl.scenarios[1],weight:'0.2'}]}));
 const stage1={...ecl,stage:1,scenarios:ecl.scenarios.map(s=>({...s,periods:[s.periods[0]]}))};
 assert.equal(lifetimeCreditEcl(stage1).scenarios[0].periods.length,1);
});
test('capital bridge calculates changes in capital ratio and rejects impossible RWA',()=>{
 const r=capitalAndProfitBridge(capital);
 assert.equal(r.openingCar,'0.12');assert.equal(r.closingCapital,'110');assert.equal(r.closingCar,'0.1');
 assert.throws(()=>capitalAndProfitBridge({...capital,rwaDelta:'-1000'}));
 assert.equal(r.status,'management_sensitivity_only_not_regulatory_capital');
});
test('source manifest validates hashes, row counts, distinct versioned datasets and control totals',()=>{
 const sample={entries:[{sourceSystem:'CBS',dataset:'credit',asOf:'2026-09-30',sha256:HASH,rowCount:1000000,schemaVersion:'v1',controlTotal:'1000',approvalReference:'SYNTHETIC'}]};
 assert.equal(sourceManifest(sample).entries[0].rowCount,1000000);
 assert.throws(()=>sourceManifest({entries:[sample.entries[0],sample.entries[0]]}));
 assert.throws(()=>sourceManifest({entries:[{...sample.entries[0],rowCount:-1}]}));
 assert.throws(()=>sourceManifest({entries:[{...sample.entries[0],sha256:'invalid'}]}));
});
function setup(){
 const db=enterpriseDb(),sql=db.sqlite;
 for(const t of ['bank-a','bank-b'])sql.prepare('INSERT INTO gcx_institutions VALUES(?,?,?,?,?,?)').run(t,'Synthetic '+t,'BUS','IDR',1,'2026-01-01');
 for(const [id,role] of [['maker','data_maker'],['risk','risk_analyst'],['checker','checker'],['viewer','executive_viewer']])sql.prepare('INSERT INTO gcx_memberships VALUES(?,?,?,?,?)').run('bank-a',id,id+'@uat.invalid',role,1);
 sql.prepare('INSERT INTO gcx_memberships VALUES(?,?,?,?,?)').run('bank-b','other','other@uat.invalid','executive_viewer',1);
 return db;
}
async function api(db,role,path,input,tenant='bank-a',switchOn=true){
 const method=input===undefined?'GET':'POST';
 const req=new Request('https://internal.invalid/api/enterprise'+path,{method,headers:method==='POST'?{'content-type':'application/json'}:{},body:method==='POST'?JSON.stringify(input):undefined});
 const actor={subject:role,role:{maker:'data_maker',risk:'risk_analyst',viewer:'executive_viewer',checker:'checker',other:'executive_viewer'}[role]};
 const env={GC_ENTERPRISE_QUANT_ENABLED:'true',GC_ENTERPRISE_ADVANCED_ENABLED:switchOn?'true':'false'};
 const r=await handleAdvancedAnalytics(req,env,db,tenant,actor,path);return {status:r.status,data:await r.json()};
}
test('advanced output is server computed, persisted with immutable versions, isolated per tenant',async()=>{
 const db=setup();
 try{
  const fake={kind:'physical_damage',input:damage,result:{netDamage:'10000000'}};
  const made=await api(db,'risk','/analytics/advanced/runs',fake);
  assert.equal(made.status,201);assert.equal(made.data.result.netDamage,'150');
  assert.match(made.data.inputSha256,/^[a-f0-9]{64}$/);assert.equal(made.data.officialOjkSubmission,false);
  const got=await api(db,'viewer','/analytics/advanced/runs/'+made.data.id);
  assert.equal(got.data.result.netDamage,'150');
  assert.equal((await api(db,'viewer','/analytics/advanced/runs')).data.runs.length,1);
  assert.equal((await api(db,'other','/analytics/advanced/runs',undefined,'bank-b')).data.runs.length,0);
  await assert.rejects(()=>api(db,'other','/analytics/advanced/runs/'+made.data.id,undefined,'bank-b'),e=>e.code==='RUN_NOT_FOUND');
  await assert.rejects(()=>api(db,'viewer','/analytics/advanced/runs',fake),e=>e.code==='ADVANCED_ROLE_DENIED');
  await assert.rejects(()=>api(db,'risk','/analytics/advanced/runs',fake,'bank-a',false),e=>e.code==='ADVANCED_DISABLED');
  assert.throws(()=>db.sqlite.exec("UPDATE gcx_advanced_runs SET status='internal_only'"),/immutable/);
  assert.throws(()=>db.sqlite.exec('DELETE FROM gcx_advanced_runs'),/immutable/);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM gcx_events WHERE action='advanced.physical_damage'").get().n,1);
 }finally{db.sqlite.close();}
});
