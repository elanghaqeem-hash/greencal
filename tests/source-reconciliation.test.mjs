import test from 'node:test';
import assert from 'node:assert/strict';
import {enterpriseDb} from './support/enterprise-db.mjs';
import {handleQuantApi} from '../src/enterprise/quant-api.js';
import {convertCsvToBatches} from '../scripts/portfolio-cbs-adapter.mjs';
const sha='b'.repeat(64),base='https://bank-uat.invalid';
const position=(facilityRef)=>({facilityRef,obligorRef:'OBL-01',assetClass:'business_loans',currency:'IDR',asOf:'2026-09-30',outstanding:'20',attributionDenominator:'100',denominatorCurrency:'IDR',denominatorBasis:'total_equity_and_debt',emissions:{scope1:'100',scope2:null,scope3:null},dataQualityScore:3,evidenceReference:'SYNTHETIC TEST',emissionSourceVintage:'2025'});
function dbFixture(){const db=enterpriseDb(),s=db.sqlite;s.prepare('INSERT INTO gcx_institutions VALUES(?,?,?,?,?,?)').run('bank-a','TEST BANK','BUS','IDR',1,'2026-01-01');s.prepare('INSERT INTO gcx_institutions VALUES(?,?,?,?,?,?)').run('bank-b','OTHER BANK','BUS','IDR',1,'2026-01-01');s.prepare('INSERT INTO gcx_memberships VALUES(?,?,?,?,?)').run('bank-a','maker','maker@uat.invalid','data_maker',1);s.prepare('INSERT INTO gcx_memberships VALUES(?,?,?,?,?)').run('bank-b','other','other@uat.invalid','data_maker',1);return db;}
async function run(db,path,body,tenant='bank-a',actor='maker'){
 const req=new Request(base+'/api/enterprise'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const res=await handleQuantApi(req,{GC_ENTERPRISE_QUANT_ENABLED:'true',GC_ENTERPRISE_REQUIRE_SOURCE_MANIFEST:'true'},db,tenant,{subject:actor,role:'data_maker'},path);
 return {status:res.status,body:await res.json()};
}
function batch(ref,id){return {asOf:'2026-09-30',currency:'IDR',sourceSha256:sha,sourceSystem:'SYNTHETIC_CBS',glControlTotal:'20',glControlCount:1,controlReference:'SYNTHETIC-GL-B'+id,exposures:[position(ref)]};}
test('source-level reconciliation requires registered parent, both batches and no facility duplication',async()=>{
 const db=dbFixture();
 try{
  await assert.rejects(()=>run(db,'/analytics/import',batch('FAC-01',1)),e=>e.code==='SOURCE_REQUIRED');
  const source={asOf:'2026-09-30',currency:'IDR',sourceSha256:sha,sourceSystem:'SYNTHETIC_CBS',glControlTotal:'40',glControlCount:2,controlReference:'SYNTHETIC-GL'};
  assert.equal((await run(db,'/analytics/sources',source)).status,201);
  assert.equal((await run(db,'/analytics/sources/'+sha)).body.status,'incomplete_or_mismatched');
  assert.equal((await run(db,'/analytics/import',batch('FAC-01',1))).status,201);
  assert.equal((await run(db,'/analytics/sources/'+sha)).body.actualTotal,'20');
  await assert.rejects(()=>run(db,'/analytics/import',batch('FAC-01',2)),/duplicate facility across source batches/);
  assert.equal((await run(db,'/analytics/import',batch('FAC-02',2))).status,201);
  const status=(await run(db,'/analytics/sources/'+sha)).body;
  assert.equal(status.completed,true);assert.equal(status.actualCount,2);assert.equal(status.actualTotal,'40');
  const report=(await run(db,'/analytics/sources/'+sha+'/report')).body;
  assert.equal(report.totals.outstanding,'40');assert.equal(report.totals.financedTco2e.scope1,'40');
  assert.equal(report.totals.coverage.scope2.missing,2);
  assert.equal(report.officialOjkSubmission,false);
  assert.equal((await run(db,'/analytics/sources')).body.sources[0].status,'reconciled_to_declared_GL');
  await assert.rejects(()=>run(db,'/analytics/sources',source));
  assert.equal((await run(db,'/analytics/sources')).body.sources.length,1);
  await assert.rejects(()=>run(db,'/analytics/sources/'+sha,undefined,'bank-b','other'),e=>e.code==='SOURCE_NOT_FOUND');
  assert.throws(()=>db.sqlite.exec("UPDATE gcx_portfolio_sources SET expected_count=3"),/immutable/);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM gcx_events WHERE action='quant.source_control'").get().n,1);
 }finally{db.sqlite.close();}
});
test('CBS adapter splits large CSV source into unique control references and preserves root totals',()=>{
 const header='facilityRef,obligorRef,assetClass,currency,asOf,outstanding,attributionDenominator,denominatorCurrency,denominatorBasis,scope1,scope2,scope3,dataQualityScore,evidenceReference,emissionSourceVintage';
 const rows=Array.from({length:101},(_,i)=>[('FAC-'+String(i).padStart(4,'0')),'OBL','business_loans','IDR','2026-09-30','20','100','IDR','total_equity_and_debt','100','','','3','synthetic','2025'].join(','));
 const {manifest,batches}=convertCsvToBatches([header,...rows].join('\n'),{asOf:'2026-09-30',currency:'IDR',sourceSystem:'SYNTHETIC_CBS',glControlCount:101,glControlTotal:'2020',controlReference:'GL-CONTROL'});
 assert.ok(batches.length>=2);assert.equal(manifest.glControlTotal,'2020');
 assert.equal(new Set(batches.map(x=>x.controlReference)).size,batches.length);
 assert.equal(new Set(batches.map(x=>x.sourceSha256)).size,1);
});
