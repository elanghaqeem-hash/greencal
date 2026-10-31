import test from 'node:test';
import assert from 'node:assert/strict';
import {sawanFixture,sawanSeedGate,SAWAN_SEED_TRIGGER,SAWAN_SEED_BRANCH} from '../scripts/vercel/seed-sawan-on-build.mjs';
import {analyzeReadiness} from '../src/enterprise/discovery.js';
import {book6Preview} from '../src/enterprise/book6.js';
import {sawanPreviewGate,getSawanBook7Example} from '../src/vercel/sawan-demo.js';
const flags={
 GC_SAWAN_SEED_APPLY:SAWAN_SEED_TRIGGER,VERCEL_ENV:'preview',
 VERCEL_GIT_COMMIT_REF:SAWAN_SEED_BRANCH,
 GC_SAWAN_APPROVED_TARGET:'greencal-crms-enterprise',
 GC_SAWAN_DB_NAME:'postgres',DATABASE_URL:'postgresql://test.invalid/db'
};
test('Bank Sawan one-time seed is blocked unless exact preview branch and target',()=>{
 assert.equal(sawanSeedGate(flags),true);
 for(const delta of [{VERCEL_ENV:'production'},{VERCEL_GIT_COMMIT_REF:'main'},
  {GC_SAWAN_SEED_APPLY:'disabled'},{GC_SAWAN_DB_NAME:'other'},
  {GC_SAWAN_APPROVED_TARGET:'other'},{DATABASE_URL:'sqlite:///demo'}])
  assert.equal(sawanSeedGate({...flags,...delta}),false);
});
test('synthetic data does not invent official bank records or regulator approval',()=>{
 const f=sawanFixture();
 assert.equal(f.book6.bank.code,'SAWAN-DEMO');
 assert.equal(f.book6.figures.length,0);
 assert.equal(book6Preview(f.book6).officialSubmission,false);
 assert.equal(f.book7.adjustedPD,'0.000573');
 assert.equal(f.book7.officialSubmission,false);
 const analysis=analyzeReadiness(f.readiness);
 assert.equal(analysis.indicativeNextStage,'remediation_or_assessment_required');
 assert.ok(analysis.blockers.length>=1);
 assert.equal(f.sourceSha256.length,64);
});
test('read-only API is strictly Preview branch-bound and disabled in production',()=>{
 assert.equal(sawanPreviewGate({...flags,GC_SAWAN_DEMO_ENABLED:'true'}),true);
 assert.equal(sawanPreviewGate({...flags,VERCEL_ENV:'production',GC_SAWAN_DEMO_ENABLED:'true'}),false);
 assert.equal(getSawanBook7Example().result.adjustedPD,'0.000573');
});
