import test from 'node:test';
import assert from 'node:assert/strict';
import {DIMENSIONS,TOPICS,QUESTIONS,INVENTORY,QUALITY_TESTS,weighted,analyzeReadiness,readinessLevel} from '../src/enterprise/discovery.js';
import {validatePayload} from '../src/enterprise/discovery-api.js';
import {spawnSync} from 'node:child_process';

const ready = ()=>{
 const dimensions=Object.fromEntries(DIMENSIONS.map(x=>[x.id,{score:3,evidenceRef:'synthetic:reviewed-evidence'}]));
 const topics=Object.fromEntries(TOPICS.map(x=>[x.id,{score:3,evidenceRef:'synthetic:reviewed-evidence',completenessPct:100}]));
 const answers=Object.fromEntries(QUESTIONS.map(x=>[x.id,{status:'yes',evidenceRef:'synthetic:approved-source'}]));
 const inventory=Object.fromEntries(INVENTORY.map(x=>[x.id,{status:'available',evidenceRef:'synthetic:approved-source'}]));
 const quality=Object.fromEntries(QUALITY_TESTS.map(x=>[x.id,{status:'pass',evidenceRef:'synthetic:approved-source'}]));
 return {dimensions,topics,answers,inventory,quality};
};
test('catalogue transcribes uploaded workbook scope and weights',()=>{
 assert.equal(QUESTIONS.length,111);
 assert.equal(INVENTORY.length,35);
 assert.equal(QUALITY_TESTS.length,20);
 assert.equal(DIMENSIONS.length,6);
 assert.equal(TOPICS.length,12);
 assert.equal(DIMENSIONS.reduce((n,x)=>n+x.weight,0),100);
 assert.equal(TOPICS.reduce((n,x)=>n+x.weight,0),100);
 assert.equal(new Set(QUESTIONS.map(x=>x.id)).size,111);
});
test('unrated and partial results must never imply readiness',()=>{
 const none=analyzeReadiness({});
 assert.equal(none.headline.score,null);
 assert.equal(none.headline.coveragePct,0);
 assert.equal(none.headline.level,'Belum dinilai');
 assert.equal(none.indicativeNextStage,'remediation_or_assessment_required');
 const partial={dimensions:{governance:{score:4}},topics:{}};
 const r=analyzeReadiness(partial);
 assert.equal(r.headline.score,4);
 assert.equal(r.headline.coveragePct,15);
 assert.equal(r.indicativeNextStage,'remediation_or_assessment_required');
});
test('exact six-dimension weighted score and workbook thresholds',()=>{
 const d={dimensions:Object.fromEntries(DIMENSIONS.map(x=>[x.id,{score:x.id==='governance'?4:2}])),topics:{}};
 const result=analyzeReadiness(d);
 assert.equal(result.headline.score,2.3);
 assert.equal(result.headline.level,'Developing');
 assert.equal(result.headline.coveragePct,100);
 assert.equal(readinessLevel(1.749),'Initial');
 assert.equal(readinessLevel(1.75),'Developing');
 assert.equal(readinessLevel(2.5),'Established');
 assert.equal(readinessLevel(3.5),'Advanced');
});
test('fully evidenced score 3 can proceed to controlled review only',()=>{
 const result=analyzeReadiness(ready());
 assert.equal(result.headline.score,3);
 assert.equal(result.topics.score,3);
 assert.equal(result.headline.coveragePct,100);
 assert.equal(result.topics.coveragePct,100);
 assert.equal(result.topicCompleteness.averagePct,100);
 assert.equal(result.topicCompleteness.assessed,12);
 assert.equal(result.indicativeNextStage,'eligible_for_controlled_bank_review');
 assert.match(result.note,/bukan kepatuhan OJK/);
});
test('questionnaire, data and quality gaps stop premature readiness release',()=>{
 const p=ready();p.answers.A1={status:'unknown'};
 const r=analyzeReadiness(p);
 assert.ok(r.evidenceCoverage.questionnaire.coveragePct<100);
 assert.equal(r.indicativeNextStage,'remediation_or_assessment_required');
 p.answers.A1={status:'yes'};
 assert.equal(analyzeReadiness(p).indicativeNextStage,'remediation_or_assessment_required');
});
test('blockers override high headline and topic scores',()=>{
 const p=ready();
 p.dimensions.portfolio.score=4;p.dimensions.portfolio.blocker=true;
 assert.equal(analyzeReadiness(p).indicativeNextStage,'remediation_or_assessment_required');
 p.dimensions.portfolio.blocker=false;
 p.quality.Q04={status:'fail'};
 const r=analyzeReadiness(p);
 assert.ok(r.blockers.some(x=>x.id==='Q04'));
 assert.equal(r.indicativeNextStage,'remediation_or_assessment_required');
});
test('unknown IDs, arbitrary fields, invalid percentages and evidence-free high scores rejected',()=>{
 const base=ready();
 assert.doesNotThrow(()=>validatePayload(base));
 assert.throws(()=>validatePayload({...base,unexpected:true}),/Field tidak dikenal/);
 assert.throws(()=>validatePayload({...base,dimensions:{intruder:{score:4}}}),/ID assessment/);
 assert.throws(()=>validatePayload({...base,topics:{T01:{score:4,evidenceRef:''}}}),/membutuhkan referensi bukti/);
 assert.throws(()=>validatePayload({...base,inventory:{I01:{coveragePct:101}}}),/Persentase/);
 assert.throws(()=>validatePayload({...base,answers:{A1:{status:'approved'}}}),/Status tidak valid/);
});
test('does not treat an unassessed score as zero',()=>{
 const r=weighted(DIMENSIONS,{data:{score:2}});
 assert.equal(r.score,2);assert.equal(r.coveragePct,20);
});

test('Discovery browser asset and API entry point have valid JavaScript syntax',()=>{
 for(const path of ['../assets/enterprise-discovery.js','../src/enterprise/discovery-api.js','../src/enterprise/discovery.js']){
  const f=new URL(path,import.meta.url);
  const process=spawnSync(globalThis.process.execPath,['--check',f.pathname],{encoding:'utf8'});
  assert.equal(process.status,0,f.pathname+': '+process.stderr);
 }
});
