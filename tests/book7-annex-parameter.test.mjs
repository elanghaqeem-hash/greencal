import test from 'node:test';
import assert from 'node:assert/strict';
import {BOOK7_ANNEX_PDF_CATALOG_STATUS as STATUS,book7AnnexLookup,book7AnnexStress} from '../src/enterprise/book7-annex.js';
import {ANNEX_CREDIT_PDF_PRESENTATION as C} from '../src/enterprise/book7-annex-credit-data.js';
import {ANNEX_MARKET_PDF_PRESENTATION as M} from '../src/enterprise/book7-annex-market-data.js';
import {handleQuantApi} from '../src/enterprise/quant-api.js';
import {enterpriseDb} from './support/enterprise-db.mjs';
const base={scenario:'net_zero_2050',year:2026,size:'Mikro',locationRisk:'Tinggi',sector:'Pertanian dan Kehutanan',rating:'AA'};
test('OJK annex PDF tables present complete expected row counts and exact unique keys',()=>{
 assert.deepEqual(STATUS.rows,{A3:1260,A5:36,A6:420,A8:21,B2:3,B3:26,B5:1260,C2:84});
 assert.deepEqual(C.years,[2025,2026,2027,2028,2030,2035,2040,2045,2050]);
 assert.deepEqual(C.years,M.years);
 for(const [rows,dim] of [[C.A3,5],[C.A6,4],[C.A5,3],[M.B5,5],[M.C2,3],[C.A8,1],[M.B2,1],[M.B3,1]]){
  assert.equal(new Set(rows.map(r=>JSON.stringify(r.slice(0,dim)))).size,rows.length);
 }
 for(const rows of [C.A3,C.A6,C.A5,M.B5,M.B2])for(const r of rows){
  const numbers=r.at(-2);assert.equal(numbers.length,9);
  for(const n of numbers)assert.match(n,/^\d+(?:\.\d{4})$/);
 }
 assert.equal(STATUS.sourcePrecision,'PDF_PUBLISHED_ROUNDED');
 assert.equal(STATUS.fullPrecisionWorkbookVerified,undefined);
});
test('A.3 PDF lookup uses EXACT bucket/year and applies productive credit PD',()=>{
 const row=book7AnnexLookup({...base,table:'A.3'});
 assert.equal(row.rawPublishedValue,'1.1466');assert.equal(row.pdfPage,3);
 assert.equal(row.fullPrecisionWorkbookVerified,false);assert.equal(row.officialSubmission,false);
 const r=book7AnnexStress({...base,table:'A.3',baselinePD:'0.0005'});
 assert.equal(r.adjustedPD,'0.000573');
 assert.throws(()=>book7AnnexLookup({...base,table:'A.3',year:2029}),e=>e.code==='BOOK7_ANNEX_LOOKUP_INVALID');
 assert.throws(()=>book7AnnexLookup({...base,table:'A.3',rating:'AAA'}));
 assert.throws(()=>book7AnnexLookup({...base,table:'A.3',locationRisk:'Unknown'}));
});
test('A.5 physical haircuts expressed in PERCENT in PDF, converted correctly to fraction',()=>{
 const r=book7AnnexLookup({...base,table:'A.5',collateralKind:'Komersial'});
 assert.equal(r.rawPublishedValue,'2.0633');assert.equal(r.decimalFraction,'0.020633');
 const stress=book7AnnexStress({...base,table:'A.5',collateralKind:'Komersial',collateralValue:'1000000'});
 assert.equal(stress.adjustedCollateral,'979367');assert.equal(stress.physicalValueLoss,'20633');
});
test('A.6 transition scalar affects collateral valuation, not direct LGD formula',()=>{
 const row=book7AnnexLookup({...base,table:'A.6'});
 assert.equal(row.rawPublishedValue,'0.9998');assert.equal(row.numericMeaning,'COLLATERAL_TRANSITION_MULTIPLIER');
 const r=book7AnnexStress({...base,table:'A.6',collateralValue:'1000000'});
 assert.equal(r.adjustedCollateral,'999800');
});
test('A.8 exact rating mapping and boundary evidence',()=>{
 const r=book7AnnexLookup({table:'A.8',granularRating:'Aaa'});
 assert.equal(r.bucket,'AA');assert.equal(r.lowerBoundPercent,'0.0000');assert.equal(r.upperBoundPercent,'0.0245');
 assert.throws(()=>book7AnnexLookup({table:'A.8',granularRating:'AAA'}));
});
test('B.2 Indonesia sovereign rates are distinct from B.5 corporate bond rates',()=>{
 const s=book7AnnexLookup({...base,table:'B.2'}),c=book7AnnexLookup({...base,table:'B.5'});
 assert.equal(s.rawPublishedValue,'2.1421');
 assert.equal(c.rawPublishedValue,'1.8157');
 assert.equal(book7AnnexStress({...base,table:'B.2',baselinePD:'0.001'}).adjustedPD,'0.002142');
});
test('B.3 Fed Funds percentage points converted to fractional rate shock; NDC present only there',()=>{
 const r=book7AnnexStress({table:'B.3',scenario:'net_zero_2050',year:2026});
 assert.equal(r.rawPublishedValue,'3.64');assert.equal(r.baselinePercent,'3.41');
 assert.equal(r.rfShockFraction,'0.0023');
 const ndc=book7AnnexLookup({table:'B.3',scenario:'ndc',year:2026});
 assert.equal(ndc.rawPublishedValue,'3.45');
 assert.throws(()=>book7AnnexLookup({...base,table:'B.2',scenario:'ndc'}));
});
test('C.2 liquidity shock is ONLY Net Zero 2050 in 2026, and source percentages are converted',()=>{
 const r=book7AnnexLookup({...base,table:'C.2'});
 assert.equal(r.depositOutflowPercent,'0.5988');assert.equal(r.undrawnDrawdownPercent,'3.3077');
 assert.equal(r.depositOutflowFraction,'0.005988');
 const x=book7AnnexStress({...base,table:'C.2',balance:'1000000',baselineRate:'0.05',component:'deposit'});
 assert.equal(x.additionalAmount,'5988');assert.equal(x.adjustedAmount,'55988');
 const u=book7AnnexStress({...base,table:'C.2',balance:'1000000',baselineRate:'0.10',component:'undrawn'});
 assert.equal(u.additionalAmount,'33077');assert.equal(u.adjustedAmount,'133077');
 assert.throws(()=>book7AnnexLookup({...base,table:'C.2',year:2030}));
 assert.throws(()=>book7AnnexLookup({...base,table:'C.2',scenario:'current_policies'}));
});
test('No silent sources for A.7 CRE/RRE NaN, no time extrapolation and no invented scenario',()=>{
 assert.throws(()=>book7AnnexLookup({...base,table:'A.7'}),e=>e.code==='BOOK7_ANNEX_LOOKUP_INVALID');
 assert.throws(()=>book7AnnexLookup({...base,table:'A.5',year:2029,collateralKind:'Komersial'}));
 assert.throws(()=>book7AnnexStress({...base,table:'A.3',baselinePD:'1'}));
});
test('Institution API annex dispatch remains fail-closed under dedicated feature flag and RBAC',async()=>{
 const db=enterpriseDb();
 try{
  const p={kind:'book7_annex_lookup',input:{...base,table:'A.3'}};
  const req=()=>new Request('https://uat.invalid/api/enterprise/analytics/runs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(p)});
  const env={GC_ENTERPRISE_QUANT_ENABLED:'true'};
  await assert.rejects(()=>handleQuantApi(req(),env,db,'bank-a',{subject:'role-model',role:'climate_model_analyst'},'/analytics/runs'),e=>e.code==='BOOK7_DISABLED');
  await assert.rejects(()=>handleQuantApi(req(),{...env,GC_ENTERPRISE_BOOK7_ENABLED:'true'},db,'bank-a',{subject:'role-viewer',role:'executive_viewer'},'/analytics/runs'),e=>e.code==='QUANT_ROLE_DENIED');
 }finally{db.sqlite.close();}
});
