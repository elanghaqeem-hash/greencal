import test from 'node:test';
import assert from 'node:assert/strict';
import {PATHS,YEARS,book4Validate,book4Deviation,book4Quarterly,book2CarbonCost,book1GovernanceCoverage,DOCUMENTS} from '../src/enterprise/books124.js';
import {handleBooks124Api} from '../src/enterprise/books124-api.js';
const book4hash=DOCUMENTS.find(x=>x.book===4).sha256;
function dataset(type='flow'){
 return {variable:'OJK_TEST_SERIES',unit:'IDR',seriesType:type,sourcePage:29,sourceSha256:book4hash,
 observations:PATHS.flatMap((scenario,s)=>YEARS.map(year=>({scenario,year,value:String(100+(year-2025)*4+s*10)})))};
}
const req=(kind,payload)=>new Request('https://bank.test/api/enterprise/books124/validate',
 {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind,payload})});
test('Book 4 requires exactly 26 years × 4 pathways, including Reference',()=>{
 const d=dataset();assert.equal(book4Validate(d).coverage.observations,104);
 assert.deepEqual(book4Validate(d).coverage.scenarios,PATHS);
 assert.equal(book4Validate(d).sourceReview,'pending_independent_review');
 assert.throws(()=>book4Validate({...d,observations:d.observations.slice(1)}),/104/);
 const dup=dataset();dup.observations[1]={...dup.observations[0]};assert.throws(()=>book4Validate(dup),/Duplikasi/);
 assert.throws(()=>book4Validate({...d,sourceSha256:'0'.repeat(64)}),/berbeda/);
});
test('Book 4 deviations compare same-year reference, never report Reference',()=>{
 const r=book4Deviation({series:dataset(),scenario:'Net Zero 2050',year:2030});
 assert.equal(r.reference,'120');assert.equal(r.scenarioValue,'150');assert.equal(r.absoluteDeviation,'30');assert.equal(r.relativeDeviationPct,'25');
 assert.throws(()=>book4Deviation({series:dataset(),scenario:'Reference',year:2030}),/pembanding/);
});
test('Book 4 frequency adjustment preserves annual flow and rejects extrapolation and rate interpolation',()=>{
 const q=book4Quarterly({series:dataset(),scenario:'Reference',year:2030});
 assert.deepEqual(q.quarters.map(x=>x.value),['30','30','30','30']);assert.equal(q.aggregateCheck,'120');
 const stock=book4Quarterly({series:dataset('stock'),scenario:'Reference',year:2030});
 assert.deepEqual(stock.quarters.map(x=>x.value),['121','122','123','124']);
 assert.throws(()=>book4Quarterly({series:dataset('stock'),scenario:'Reference',year:2050}),/ekstrapolasi/);
 assert.throws(()=>book4Quarterly({series:dataset('rate'),scenario:'Reference',year:2030}),/interpolasi/i);
});
test('Book 2 carbon cost follows source formula and preserves exact decimal strings',()=>{
 const x=book2CarbonCost({carbonPrice:'200.50',emissionsToReduce:'13.25',carbonPriceUnit:'IDR/tCO2e'});
 assert.equal(x.carbonCostIDR,'2656.625');assert.equal(x.officialSubmission,false);
 assert.throws(()=>book2CarbonCost({carbonPrice:'-1',emissionsToReduce:'1',carbonPriceUnit:'IDR/tCO2e'}));
 assert.throws(()=>book2CarbonCost({carbonPrice:'1',emissionsToReduce:'1',carbonPriceUnit:'USD/tCO2e'}));
});
test('Book 1 flags evidence gap rather than self-certifying OJK compliance',()=>{
 const a=book1GovernanceCoverage({evidence:{governance:['board minutes'],strategy:[],risk_management:['risk register'],disclosure:[]}});
 assert.deepEqual(a.missing,['strategy','disclosure']);assert.equal(a.assessment,'evidence_incomplete');
 const b=book1GovernanceCoverage({evidence:{governance:['a'],strategy:['b'],risk_management:['c'],disclosure:['d']}});
 assert.equal(b.assessment,'evidence_declared_pending_review');assert.equal(b.independentReviewRequired,true);
});
test('API enforces feature gate and server trusted roles, never stores results',async()=>{
 const env={GC_ENTERPRISE_BOOK124_ENABLED:'true'},actor={role:'risk_analyst'};
 let res=await handleBooks124Api(req('book2_carbon_cost',{carbonPrice:'5',emissionsToReduce:'2',carbonPriceUnit:'IDR/tCO2e'}),env,null,'tenant_demo',actor,'/books124/validate');
 assert.equal(res.status,200);const data=await res.json();assert.equal(data.result.carbonCostIDR,'10');assert.equal(data.stored,false);
 await assert.rejects(()=>handleBooks124Api(req('book2_carbon_cost',{carbonPrice:'5',emissionsToReduce:'2',carbonPriceUnit:'IDR/tCO2e'}),env,null,'tenant_demo',{role:'external_auditor'},'/books124/validate'),/Peran/);
 await assert.rejects(()=>handleBooks124Api(req('book2_carbon_cost',{carbonPrice:'5',emissionsToReduce:'2',carbonPriceUnit:'IDR/tCO2e'}),{},null,'tenant_demo',actor,'/books124/validate'),/belum diaktifkan/);
 res=await handleBooks124Api(new Request('https://bank.test/api/enterprise/books124/catalog'),{},null,'tenant_demo',{role:'external_auditor'},'/books124/catalog');
 assert.equal(res.status,200);assert.equal((await res.json()).documents.length,3);
});
