import test from 'node:test';
import assert from 'node:assert/strict';
import {book5Selection,book5Category,book5Evaluate,book5ValidateScores,book5ConservativeDistrictMax,BOOK5_HAZARDS} from '../src/enterprise/book5.js';
import {handleBook5Api} from '../src/enterprise/book5-api.js';
const scores=(v)=>Object.fromEntries(BOOK5_HAZARDS.map(x=>[x,v]));
const select={datasetId:'ojk_2026_v1',province:'Jawa Barat',regency:'Kota Depok',district:'Pancoran Mas',
 assetLine:'residential',scenario:'Current Policy',year:2020};
const source={sha256:'a'.repeat(64),version:'OJK-2026-Annex-1',status:'validated',latestDataConfirmed:true};
const evalAt=(selection,points)=>book5Evaluate(selection,points,source);
test('Book 5 source published scores, zero vs missing, and score 50 overlap',()=>{
 const input=scores('0');input.flood='50';input.wildfire=null;input.combined='78';
 const r=evalAt(select,[{year:2020,scores:input}]);
 assert.equal(r.scores.sea_level_rise.score,0);
 assert.equal(r.scores.sea_level_rise.category.code,'low');
 assert.equal(r.scores.wildfire.score,null);
 assert.equal(r.scores.wildfire.category.code,'missing');
 assert.equal(r.scores.flood.category.code,'medium');
 assert.equal(r.scores.combined.score,78); // no averaging, summing or maximum hazard
 assert.equal(r.limitations.financialLossEstimated,false);
 assert.equal(r.approvalStatus,'internal_screening_only_not_approved_ojk_reporting');
});
test('Only official points may be interpolated; source null stays missing and extrapolation rejected',()=>{
 const q={...select,year:2025};
 const x=evalAt(q,[{year:2020,scores:{...scores('2'),combined:'88'}},
  {year:2030,scores:{...scores('4'),combined:'60',storm:null}}]);
 assert.equal(x.scores.flood.score,3);
 assert.equal(x.scores.combined.score,74); // interpolate combined itself
 assert.equal(x.scores.storm.score,null);
 assert.equal(x.interpolation,'linear_between_official_points');
 assert.throws(()=>book5Selection({...select,year:2051}),/2020/);
 assert.throws(()=>evalAt(q,[{year:2020,scores:scores(2)}]),/belum tersedia/);
});
test('Conservative district maximum chooses separate source scores, no recomposition',()=>{
 const max=book5ConservativeDistrictMax([{year:2030,scores:{...scores(4),combined:21}},
  {year:2030,scores:{...scores(8),storm:null,combined:42}}]);
 assert.equal(max[0].scores.combined,42);
 assert.equal(max[0].scores.flood,8);
 assert.equal(max[0].scores.storm,4);
});
test('Reject invalid source, scenario, asset class, numeric range and duplicated years',()=>{
 assert.throws(()=>book5ValidateScores({...scores(0),combined:101}),/0–100/);
 assert.throws(()=>book5Selection({...select,scenario:'RCP 9'}),/Skenario/);
 assert.throws(()=>book5Selection({...select,assetLine:'mortgage'}),/Lini/);
 assert.throws(()=>evalAt(select,[{year:2020,scores:scores(1)},{year:2020,scores:scores(1)}]),/duplikat/);
 assert.throws(()=>book5Evaluate(select,[{year:2020,scores:scores(1)}],{}),/SHA/);
 assert.equal(book5Category(50).code,'medium');
});
test('API displays catalog on empty staging and prevents screen without activation',async()=>{
 const db={prepare:()=>({bind:()=>({all:async()=>({results:[]})})})};
 let r=await handleBook5Api(new Request('https://test.example/api/enterprise/book5/catalog'),{},db,'tenant_demo',{role:'external_auditor'},'/book5/catalog');
 assert.equal(r.status,200);assert.deepEqual((await r.json()).datasets,[]);
 const req=new Request('https://test.example/api/enterprise/book5/screen',{method:'POST',body:JSON.stringify(select),headers:{'content-type':'application/json'}});
 await assert.rejects(()=>handleBook5Api(req,{},db,'tenant_demo',{role:'risk_analyst'},'/book5/screen'),/belum diaktifkan/);
});
