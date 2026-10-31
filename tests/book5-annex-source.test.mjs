import test from 'node:test';
import assert from 'node:assert/strict';
import {book5Category} from '../src/enterprise/book5.js';
import {handleBook5Api} from '../src/enterprise/book5-api.js';
test('Excel Appendix 1 cover resolves exact score 50 to medium; 0 stays low',()=>{
 assert.equal(book5Category(0).code,'low');
 assert.equal(book5Category(1).code,'medium');
 assert.equal(book5Category(50).code,'medium');
 assert.equal(book5Category(50.000001).code,'high');
 assert.equal(book5Category(100).code,'high');
});
test('Postcode cannot route to unreviewed/disabled data and rejects invalid format',async()=>{
 const db={prepare:()=>({bind:()=>({first:async()=>null})})};
 const request=new Request('https://bank.test/api/enterprise/book5/postcodes?datasetId=ojk2026&mappingId=map1&code=16431');
 await assert.rejects(()=>handleBook5Api(request,{},db,'bank',{role:'risk_analyst'},'/book5/postcodes'),/belum tersedia/);
 await assert.rejects(()=>handleBook5Api(request,{GC_ENTERPRISE_BOOK5_ENABLED:'true'},db,'bank',{role:'risk_analyst'},'/book5/postcodes'),/harus disahkan/);
 const invalid=new Request('https://bank.test/api/enterprise/book5/postcodes?datasetId=ojk2026&mappingId=map1&code=1643');
 await assert.rejects(()=>handleBook5Api(invalid,{GC_ENTERPRISE_BOOK5_ENABLED:'true'},db,'bank',{role:'risk_analyst'},'/book5/postcodes'),/lima digit/);
});
