// Runs only against disposable, synthetic PostgreSQL CI database.
// Never point at bank databases or commit real institution details.
import test from 'node:test';
import assert from 'node:assert/strict';
import {REQUIRED_TABLES,GUARDED_TABLES,evaluateBankSchema} from '../scripts/vercel/verify-bank-schema.mjs';

const url=process.env.GREENCAL_TEST_PG_URL;
test('PostgreSQL D1 migration parity: real FK, revision, immutable evidence, tenant scope',async(t)=>{
 if(!url){t.skip('Requires disposable GREENCAL_TEST_PG_URL; never contact production');return;}
 if(!url.includes('/greencal_ci'))throw Error('TEST_DATABASE_NAME_MUST_BE_GREENCAL_CI');
 const {Pool}=await import('pg');
 const db=new Pool({connectionString:url,max:2});
 const q=(sql,p=[])=>db.query(sql,p);
 try{
  const x=await q('SELECT current_database() AS name');
  assert.equal(x.rows[0].name,'greencal_ci');
  const tables=await q("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'gcx_%'");
  const guards=await q(`SELECT DISTINCT c.relname AS name FROM pg_trigger tr
   JOIN pg_class c ON c.oid=tr.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND NOT tr.tgisinternal AND tr.tgenabled <> 'D'`);
  const report=evaluateBankSchema({expectedDatabase:'greencal_ci',database:x.rows[0].name,
   tables:tables.rows.map(x=>x.table_name),triggerTables:guards.rows.map(x=>x.name)});
  assert.equal(report.schemaPresent,true,JSON.stringify(report));
  assert.equal(report.bankProductionReady,false);
  assert.equal(REQUIRED_TABLES.length,21);
  assert.equal(GUARDED_TABLES.length,19);
  const date='2026-10-31';
  for(const tenant of ['uat-a','uat-b']){
   await q('INSERT INTO gcx_institutions(id,name,institution_type,currency,created_at) VALUES($1,$2,$3,$4,$5)',
    [tenant,'SYNTHETIC '+tenant,'BUS','IDR',date]);
   for(const role of ['data_maker','checker','approver','risk_management_head','institution_administrator']){
    await q('INSERT INTO gcx_memberships(tenant_id,subject,email,role) VALUES($1,$2,$3,$4)',
     [tenant,role,role+'@uat.invalid',role]);
   }
  }
  const record=['uat-a','risk-1','risk','Synthetic climate risk','{"risk":1}','data_maker','data_maker',date,date];
  await q(`INSERT INTO gcx_records
   (tenant_id,id,kind,title,payload,created_by,updated_by,created_at,updated_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,record);
  assert.equal((await q("SELECT count(*)::integer AS n FROM gcx_record_versions WHERE tenant_id='uat-a'")).rows[0].n,1);
  assert.equal((await q("SELECT count(*)::integer AS n FROM gcx_records WHERE tenant_id='uat-b'")).rows[0].n,0);
  await assert.rejects(()=>q("UPDATE gcx_records SET revision=5 WHERE tenant_id='uat-a' AND id='risk-1'"),/invalid record revision/);
  await q("UPDATE gcx_records SET revision=2,title='Updated synthetic' WHERE tenant_id='uat-a' AND id='risk-1'");
  assert.equal((await q("SELECT count(*)::integer AS n FROM gcx_record_versions WHERE tenant_id='uat-a'")).rows[0].n,2);
  await assert.rejects(()=>q("DELETE FROM gcx_record_versions WHERE tenant_id='uat-a'"),/immutable evidence/);
  await assert.rejects(()=>q("DELETE FROM gcx_records WHERE tenant_id='uat-a'"),/immutable evidence/);
  await q(`INSERT INTO gcx_book6_workpapers
   (tenant_id,id,reporting_year,bank_code,payload_json,created_by,updated_by,created_at,updated_at)
   VALUES('uat-a','b1',2026,'UAT','{}','data_maker','data_maker','2026','2026')`);
  await q("UPDATE gcx_book6_workpapers SET revision=2,payload_json='{\"version\":2}' WHERE tenant_id='uat-a' AND id='b1'");
  assert.equal((await q("SELECT count(*)::integer AS n FROM gcx_book6_versions WHERE tenant_id='uat-a'")).rows[0].n,2);
  await assert.rejects(()=>q("DELETE FROM gcx_book6_versions WHERE tenant_id='uat-a'"),/immutable evidence/);
  await q(`INSERT INTO gcx_readiness_assessments
   (tenant_id,id,title,payload,created_by,updated_by,created_at,updated_at)
   VALUES('uat-a','r1','UAT Readiness','{}','data_maker','data_maker','2026','2026')`);
  assert.equal((await q("SELECT count(*)::integer AS n FROM gcx_readiness_versions WHERE tenant_id='uat-a'")).rows[0].n,1);
  await assert.rejects(()=>q("UPDATE gcx_readiness_versions SET title='forged' WHERE tenant_id='uat-a'"),/immutable evidence/);
  assert.ok((await q("SELECT count(*)::integer AS n FROM gcx_events WHERE tenant_id='uat-a'")).rows[0].n>=5);
 }finally{await db.end();}
});
