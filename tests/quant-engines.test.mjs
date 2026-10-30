import test from 'node:test';
import assert from 'node:assert/strict';
import {enterpriseDb} from './support/enterprise-db.mjs';
import {financedEmissions,reconcilePortfolio,interpolateScenario,physicalOverlay,creditTransmission,standardizedApproach,reconcileOjkDraft} from '../src/enterprise/quant.js';
import {handleQuantApi} from '../src/enterprise/quant-api.js';
const U='2026-09-30',hash='a'.repeat(64);
const position=(facilityRef='FAC-01')=>({facilityRef,obligorRef:'OBL-01',assetClass:'business_loans',currency:'IDR',asOf:U,
 outstanding:'20',attributionDenominator:'100',denominatorBasis:'total_equity_and_debt',
 emissions:{scope1:'100',scope2:'30',scope3:null},dataQualityScore:3,
 evidenceReference:'Synthetic fixture only',emissionSourceVintage:'2025'});
const batch=()=>({asOf:U,currency:'IDR',sourceSha256:hash,sourceSystem:'SYNTHETIC_TEST_CBS',glControlTotal:'40',glControlCount:2,controlReference:'SYNTHETIC_GL_TEST',exposures:[position('FAC-01'),position('FAC-02')]});
function fixture(){
 const db=enterpriseDb(),s=db.sqlite;s.prepare('INSERT INTO gcx_institutions VALUES(?,?,?,?,?,?)').run('bank-a','Synthetic Bank A','BUS','IDR',1,'2026-01-01');
 s.prepare('INSERT INTO gcx_institutions VALUES(?,?,?,?,?,?)').run('bank-b','Synthetic Bank B','BUS','IDR',1,'2026-01-01');
 for(const [id,role] of [['maker','data_maker'],['model','climate_model_analyst'],['risk','risk_analyst'],['compliance','compliance_reviewer'],['viewer','executive_viewer']])
 s.prepare('INSERT INTO gcx_memberships VALUES(?,?,?,?,?)').run('bank-a',id,id+'@example.invalid',role,1);
 s.prepare('INSERT INTO gcx_memberships VALUES(?,?,?,?,?)').run('bank-b','other','other@example.invalid','data_maker',1);
 return db;
}
async function request(db,role,path,body,tenant='bank-a'){
 const req=new Request('https://uat.invalid/api/enterprise'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const r=await handleQuantApi(req,{GC_ENTERPRISE_QUANT_ENABLED:'true'},db,tenant,{subject:role,role:role==='maker'?'data_maker':role==='model'?'climate_model_analyst':role==='risk'?'risk_analyst':role==='compliance'?'compliance_reviewer':'executive_viewer'});
 return {status:r.status,body:await r.json()};
}
test('PCAF shares and scopes: no null-to-zero or fabricated denominators',()=>{
 const x=financedEmissions(position());assert.equal(x.attributionFactor,'0.2');
 assert.deepEqual(x.financedTco2e,{scope1:'20',scope2:'6',scope3:null});
 assert.deepEqual(x.excludedScopes,['scope3']);
 for(const change of [{attributionDenominator:'0'},{attributionDenominator:'10'},{assetClass:'mortgages'},{dataQualityScore:6}])assert.throws(()=>financedEmissions({...position(),...change}));
});
test('Portfolio source/GL reconciliation rejects mismatches and duplicate facilities',()=>{
 assert.equal(reconcilePortfolio(batch()).reconciliation,'pass');
 assert.throws(()=>reconcilePortfolio({...batch(),glControlTotal:'39'}),e=>e.code==='RECONCILIATION_FAILED');
 assert.throws(()=>reconcilePortfolio({...batch(),glControlCount:3}),e=>e.code==='RECONCILIATION_FAILED');
 assert.throws(()=>reconcilePortfolio({...batch(),exposures:[position(),position()]}));
});
test('NGFS interpolates only within provided versioned time series; no invented values',()=>{
 const x={scenario:'Net Zero 2050',model:'REMIND',region:'Indonesia',variable:'Carbon Price',unit:'USD/tCO2',vintage:'synthetic-uat',sourceSha256:hash,points:[{year:2030,value:'10'},{year:2040,value:'30'}],year:2035};
 assert.equal(interpolateScenario(x).value,'20');
 assert.equal(interpolateScenario({...x,year:2030}).interpolation,'observed_scenario_point');
 assert.throws(()=>interpolateScenario({...x,year:2050}));
 assert.throws(()=>interpolateScenario({...x,points:[x.points[0],x.points[0]]}));
});
test('Geospatial WGS84 screening with polygon and hole avoids invented losses',()=>{
 const outer=[[0,0],[5,0],[5,5],[0,5],[0,0]],hole=[[1,1],[2,1],[2,2],[1,2],[1,1]];
 const x={facilityRef:'FAC-01',coordinates:[3,3],hazard:{type:'Polygon',coordinates:[outer,hole]},hazardScore:4,hazardName:'flood',dataset:'SYNTHETIC HAZARD',datasetVersion:'v1',datasetSha256:hash};
 assert.equal(physicalOverlay(x).insideHazard,true);
 assert.equal(physicalOverlay({...x,coordinates:[1.5,1.5]}).insideHazard,false);
 assert.equal(physicalOverlay(x).financialLoss,null);
});
test('PD/LGD/EAD transmission is a transparent sensitivity, not PSAK71',()=>{
 const x={basePD:'0.02',baseLGD:'0.5',baseEAD:'100',pdDelta:'0.01',lgdDelta:'0',eadDelta:'0',deltaNetIncome:'0',deltaOperatingCost:'0',currency:'IDR',modelReference:'SYNTHETIC bank calibration test',scenarioReference:'SYNTHETIC'};
 const r=creditTransmission(x);
 assert.equal(r.baseECL,'1');assert.equal(r.stressedECL,'1.5');assert.equal(r.incrementalECL,'0.5');assert.equal(r.netProfitImpact,'-0.5');
 assert.throws(()=>creditTransmission({...x,pdDelta:'1'}));
});
test('Buku 7 configurable mapping is explicitly non-regulatory; OJK report reconciles',()=>{
 const x=standardizedApproach({components:[{factor:'SYNTHETIC',exposure:'100',weight:'0.2',reference:'INTERNAL_TEST_ONLY'}]});
 assert.equal(x.totalWeightedExposure,'20');assert.match(x.status,/draft_only/);
 assert.equal(reconcileOjkDraft({glControlTotal:'40',items:[{facilityRef:'FAC-01',outstanding:'20',financed:'20'},{facilityRef:'FAC-02',outstanding:'20',financed:'6'}]}).financedTco2e,'26');
 assert.throws(()=>reconcileOjkDraft({glControlTotal:'20',items:[{facilityRef:'FAC-01',outstanding:'10',financed:'3'}]}));
});
test('D1 import is tenant-isolated, immutable and GL-linked, unauthorized roles denied',async()=>{
 const db=fixture();
 try{
  const write=await request(db,'maker','/analytics/import',batch());
  assert.equal(write.status,201);assert.equal(write.body.count,2);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM gcx_portfolio_positions').get().n,2);
  const report=await request(db,'viewer','/analytics/batches/'+write.body.id);
  assert.equal(report.status,200);assert.equal(report.body.reportPreview.totalOutstanding,'40');
  assert.equal(report.body.reportPreview.financedTco2e,'52');
  await assert.rejects(()=>request(db,'viewer','/analytics/import',batch()),e=>e.code==='QUANT_ROLE_DENIED');
  await assert.rejects(()=>request(db,'maker','/analytics/import',batch()));
  const other=await request(db,'viewer','/analytics/batches/'+write.body.id,undefined,'bank-b');
  assert.equal(other.status,404);
  assert.throws(()=>db.sqlite.exec('DELETE FROM gcx_portfolio_batches'),/immutable/);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM gcx_events WHERE action='quant.portfolio_import'").get().n,1);
 }finally{db.sqlite.close();}
});
test('Analytic run stores deterministic hash, tenant and actor without official OJK claims',async()=>{
 const db=fixture();
 try{
  const input={basePD:'0.02',baseLGD:'0.5',baseEAD:'100',pdDelta:'0',lgdDelta:'0',eadDelta:'0',deltaNetIncome:'0',deltaOperatingCost:'0',currency:'IDR',modelReference:'Synthetic test',scenarioReference:'Synthetic'};
  const run=await request(db,'risk','/analytics/runs',{kind:'credit_transmission',input});
  assert.equal(run.status,201);assert.match(run.body.sha256,/^[a-f0-9]{64}$/);
  assert.equal((await request(db,'viewer','/analytics/runs/'+run.body.id)).body.officialSubmission,false);
  await assert.rejects(()=>request(db,'viewer','/analytics/runs',{kind:'credit_transmission',input}));
  assert.throws(()=>db.sqlite.exec('UPDATE gcx_analytic_runs SET status=\'internal_only\''),/immutable/);
 }finally{db.sqlite.close();}
});
