import test from 'node:test';
import assert from 'node:assert/strict';
import {convertCsvToBatches} from '../scripts/portfolio-cbs-adapter.mjs';
import {readFileSync} from 'node:fs';
const HEADER='facilityRef,obligorRef,assetClass,currency,asOf,outstanding,attributionDenominator,denominatorCurrency,denominatorBasis,scope1,scope2,scope3,dataQualityScore,evidenceReference,emissionSourceVintage';
const row=(id='FAC-001')=>[id,'OBL-001','business_loans','IDR','2026-09-30','20','100','IDR','total_equity_and_debt','100','30','',3,'"SYNTHETIC, EVIDENCE"','2025'].join(',');
const control={asOf:'2026-09-30',currency:'IDR',sourceSystem:'SYNTHETIC_CBS',glControlTotal:'40',glControlCount:2,controlReference:'SYNTHETIC-GL'};
test('offline CBS adapter reconciles independent GL and produces valid PCAF JSON batches',()=>{
 const r=convertCsvToBatches([HEADER,row('FAC-001'),row('FAC-002')].join('\n')+'\n',control);
 assert.equal(r.manifest.glControlTotal,'40');
 assert.equal(r.manifest.glControlCount,2);
 assert.match(r.manifest.sourceSha256,/^[a-f0-9]{64}$/);
 assert.equal(r.batches[0].exposures[0].emissions.scope3,null);
 assert.equal(r.batches[0].exposures[0].evidenceReference,'SYNTHETIC, EVIDENCE');
});
test('offline CBS adapter refuses unknown PII columns, GL mismatches and duplicate facilities',()=>{
 const rows=[HEADER,row('FAC-001'),row('FAC-002')].join('\n');
 assert.throws(()=>convertCsvToBatches(rows.replace('facilityRef,','fullName,facilityRef,'),control),/header/);
 assert.throws(()=>convertCsvToBatches(rows,{...control,glControlTotal:'100'}),/GL/);
 assert.throws(()=>convertCsvToBatches(rows,{...control,glControlCount:3}),/count/);
 assert.throws(()=>convertCsvToBatches([HEADER,row('FAC-001'),row('FAC-001')].join('\n'),control),/Duplicate/);
});
test('enterprise analytics is bundled into secured UI without browser persistence',()=>{
 const html=readFileSync(new URL('../enterprise.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../assets/enterprise-analytics.js',import.meta.url),'utf8');
 assert.match(html,/assets\/enterprise-analytics\.js/);
 assert.match(html,/data-view="analytics"/);
 assert.doesNotMatch(js,/\b(?:localStorage|sessionStorage)\b|innerHTML\s*=/);
 assert.match(js,/official/i);
});
