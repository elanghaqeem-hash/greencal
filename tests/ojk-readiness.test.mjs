import test from 'node:test';
import assert from 'node:assert/strict';
import {OJK_2026_BOOK_CONTROLS,OJK_2026_GLOBAL_CONTROLS,evaluateOjk2026,publicOjkReadiness} from '../src/enterprise/ojk-readiness.js';
const fake=id=>({controlId:id,status:'verified',scope:'bank_production',sourceSha256:'a'.repeat(64),evidenceSha256:'b'.repeat(64),reviewerSubjects:['risk-user','independent-reviewer'],verifiedAt:'2026-10-31T10:00:00.000Z',officialSourceVerified:true,bankApproved:true});
test('Seven OJK books map uniquely to technical and regulatory evidence gates',()=>{
 assert.deepEqual(OJK_2026_BOOK_CONTROLS.map(b=>b.book),[1,2,3,4,5,6,7]);
 const ids=[...OJK_2026_BOOK_CONTROLS.flatMap(b=>b.controls.map(c=>c.id)),...OJK_2026_GLOBAL_CONTROLS.map(c=>c.id)];
 assert.equal(new Set(ids).size,ids.length);
});
test('Production health cannot claim OJK readiness from existing build or synthetic evidence',()=>{
 const x=publicOjkReadiness();
 assert.equal(x.status,'NOT_READY');assert.equal(x.counts.booksPassed,0);
 assert.equal(x.bankProductionReady,false);assert.equal(x.officialOjkCertification,false);
 assert.equal(x.book3Reconciliation.independentlyRecalculated+x.book3Reconciliation.notRecalculated,x.book3Reconciliation.formulasTotal);
});
test('Partial bank evidence can never be promoted to BOOK PASS',()=>{
 const x=evaluateOjk2026({attestations:[fake('B1_REQUIREMENTS')]});
 assert.equal(x.books[0].status,'PARTIAL');assert.equal(x.status,'NOT_READY');
});
test('Duplicate, synthetic and unverifiable source claims are not accepted as verified',()=>{
 for(const changes of [{reviewerSubjects:['risk','risk']},{reviewerSubjects:['SYNTHETIC_RISK','auditor']},
   {sourceSha256:'z'.repeat(64)},{scope:'preview'},{officialSourceVerified:false},{bankApproved:false}]){
  const x=evaluateOjk2026({attestations:[{...fake('B1_REQUIREMENTS'),...changes}]});
  assert.equal(x.books[0].verified,0);
 }
 assert.equal(evaluateOjk2026({attestations:[fake('B1_REQUIREMENTS'),fake('B1_REQUIREMENTS')]}).books[0].verified,0);
});
test('Passing 7 books is not sufficient without all global controls and signed bank release',()=>{
 const books=OJK_2026_BOOK_CONTROLS.flatMap(b=>b.controls.map(c=>fake(c.id)));
 const global=OJK_2026_GLOBAL_CONTROLS.map(c=>fake(c.id));
 assert.equal(evaluateOjk2026({attestations:books}).status,'NOT_READY');
 assert.equal(evaluateOjk2026({attestations:[...books,...global]}).status,'NOT_READY');
 const proof=evaluateOjk2026({attestations:[...books,...global],bankReleaseAuthorized:true});
 assert.equal(proof.status,'PASS');assert.equal(proof.officialOjkCertification,false);
});
