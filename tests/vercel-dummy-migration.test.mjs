import test from 'node:test';
import assert from 'node:assert/strict';
import {migrationGate,migrateDummyOnPreview,sourceInventory,DEMO_BRANCH,DEMO_TRIGGER,DEMO_SCHEMA}
 from '../scripts/vercel/migrate-demo-on-build.mjs';
import {book6Preview} from '../src/enterprise/book6.js';
const gate={
 GC_DEMO_MIGRATION_APPLY:DEMO_TRIGGER,
 VERCEL_ENV:'preview',
 VERCEL_GIT_COMMIT_REF:DEMO_BRANCH,
 GC_DEMO_APPROVED_TARGET:'greencal-crms-enterprise',
 GC_DEMO_TARGET_DATABASE:'greencal_ci',
 DATABASE_URL_POOLED:'postgresql://user:password@127.0.0.1:5432/greencal_ci'
};
test('migration only runs on exact Preview branch, project and expected DB',async()=>{
 assert.equal(migrationGate(gate).allowed,true);
 for(const overrides of [
  {GC_DEMO_MIGRATION_APPLY:''},{VERCEL_ENV:'production'},
  {VERCEL_GIT_COMMIT_REF:'main'},
  {GC_DEMO_APPROVED_TARGET:'some-other-project'},
  {GC_DEMO_TARGET_DATABASE:''},
  {DATABASE_URL_POOLED:'sqlite:///file'}
 ]){
  assert.equal(migrationGate({...gate,...overrides}).allowed,false);
 }
 assert.deepEqual(await migrateDummyOnPreview({}),{
  allowed:false,code:'NOT_REQUESTED',applied:false,bankProductionReady:false
 });
});
test('source counts are metadata-only; legacy credentials are excluded',()=>{
 const inv=sourceInventory();
 assert.equal(inv.gc_users,2);
 assert.equal(Object.values(inv).reduce((a,b)=>a+b,0),2);
 assert.equal(Object.hasOwn(inv,'password_hash'),false);
 assert.equal(DEMO_SCHEMA,'greencal_demo');
});
test('real disposable Postgres receives isolated demo-only schema and audit history',async(t)=>{
 const url=process.env.GREENCAL_TEST_PG_URL;
 if(!url){t.skip('Synthetic test requires ephemeral GREENCAL_TEST_PG_URL');return;}
 const expected=new URL(url);
 if(!['localhost','127.0.0.1'].includes(expected.hostname)||
   expected.pathname!=='/greencal_ci')throw Error('NON_DISPOSABLE_TEST_URL_REJECTED');
 const r=await migrateDummyOnPreview({...gate,DATABASE_URL_POOLED:url,CI:'true',GC_DEMO_LOCAL_CI_ONLY:'true'});
 assert.equal(r.applied,true,JSON.stringify(r));
 assert.equal(r.institutions,2);
 assert.equal(r.demo_memberships,10);
 assert.equal(r.demo_records,1);
 assert.equal(r.demo_book6_drafts,1);
 assert.equal(r.enterprise_tables,21);
 assert.equal(r.legacyAccountHashesMigrated,false);
 assert.equal(r.bankProductionReady,false);
 assert.equal(r.book6OfficialWorkbookParity,false);
 const {Client}=await import('pg');
 const db=new Client({connectionString:url,ssl:false});
 await db.connect();
 try{
  const t1=await db.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'");
  assert.equal(t1.rows[0].n,0);
  const users=await db.query('SELECT subject,email FROM greencal_demo.gcx_memberships ORDER BY subject');
  assert.equal(users.rowCount,10);
  assert.ok(users.rows.every(x=>x.email.endsWith('@example.invalid')));
  const ledger=await db.query('SELECT source_type,source_counts_json FROM greencal_demo.gc_demo_migration_receipts');
  assert.equal(ledger.rowCount,1);
  assert.equal(ledger.rows[0].source_type,'INVENTORY_ONLY_NOT_ACCOUNT_COPY');
  assert.equal(JSON.parse(ledger.rows[0].source_counts_json).gc_users,2);
  const book=await db.query('SELECT status,payload_json FROM greencal_demo.gcx_book6_workpapers');
  assert.equal(book.rows[0].status,'draft');
  const parsed=JSON.parse(book.rows[0].payload_json);
  assert.equal(parsed.schema,'greencal-book6-draft-v1');
  assert.equal(book6Preview(parsed).officialSubmission,false);
  assert.equal(book6Preview(parsed).templateParity,'unverified');
  await assert.rejects(()=>db.query("DELETE FROM greencal_demo.gcx_book6_versions"),/immutable evidence/);
  const run2=await migrateDummyOnPreview({...gate,DATABASE_URL_POOLED:url,CI:'true',GC_DEMO_LOCAL_CI_ONLY:'true'});
  assert.equal(run2.applied,false);
  assert.equal(run2.code,'DEMO_SCHEMA_ALREADY_EXISTS_NO_OVERWRITE');
 }finally{await db.end();}
});
