import test from 'node:test';import assert from 'node:assert/strict';
import {ingestIamcCsv} from '../scripts/ngfs-iamc-adapter.mjs';
const csv='Model,Scenario,Region,Variable,Unit,2030,2040\nREMIND,Net Zero 2050,Indonesia,Price|Carbon,USD/tCO2,10,30\nGCAM,Current Policies,Indonesia,Price|Carbon,USD/tCO2,1,4\n';
const selection={model:'REMIND',scenario:'Net Zero 2050',region:'Indonesia',variable:'Price|Carbon',unit:'USD/tCO2',vintage:'synthetic-UAT',year:2035,sourceUrl:'https://data.ene.iiasa.ac.at/ngfs/'};
test('NGFS IAMC adapter selects exactly one scenario and interpolates within available years',()=>{
 const x=ingestIamcCsv(csv,selection);
 assert.equal(x.result.value,'20');assert.equal(x.input.points.length,2);assert.match(x.sourceFileSha256,/^[a-f0-9]{64}$/);
 assert.equal(x.reviewStatus,'bank_source_and_model_review_required');
});
test('NGFS IAMC rejects interpolation outside points, ambiguous sources, and unspecified units',()=>{
 assert.throws(()=>ingestIamcCsv(csv,{...selection,year:2050}));
 assert.throws(()=>ingestIamcCsv(csv,{...selection,unit:'IDR/tCO2'}),/exact-match/);
 assert.throws(()=>ingestIamcCsv(csv.replace('10,30','not-number,30'),selection),/Non-numeric/);
 assert.throws(()=>ingestIamcCsv(csv.replace('Price|Carbon,USD/tCO2,10,30','Price|Carbon,USD/tCO2,10,30\nREMIND,Net Zero 2050,Indonesia,Price|Carbon,USD/tCO2,10,30'),selection),/exact-match/);
});
