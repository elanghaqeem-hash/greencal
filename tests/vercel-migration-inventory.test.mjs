import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeDatabaseInspection,inspectDestinationDatabase}
 from '../scripts/vercel/inspect-db-on-build.mjs';

test('Vercel destination preflight is metadata only and never asserts bank readiness',()=>{
 const summary=summarizeDatabaseInspection({connected:true,dbName:'greencal_production',
  schema:'public',tables:['gcx_institutions','gcx_events','gc_public_ai_quota','private_internal_table']});
 assert.equal(summary.connected,true);
 assert.equal(summary.bankTableCount,2);
 assert.equal(summary.publicQuotaTablePresent,true);
 assert.equal(summary.otherTableCount,1);
 assert.equal(summary.hasNamedDatabase,true);
 assert.equal(summary.readyForWrite,false);
 assert.equal(summary.bankProductionReady,false);
 assert.equal(summary.dbNameRedacted,true);
 assert.equal(JSON.stringify(summary).includes('greencal_production'),false);
 assert.equal(JSON.stringify(summary).includes('private_internal_table'),false);
});
test('probe refuses to invent a connection when provider credentials are not installed',async()=>{
 const result=await inspectDestinationDatabase({});
 assert.deepEqual(result,{connected:false,readOnly:true,
  bankProductionReady:false,code:'POSTGRES_NOT_CONFIGURED'});
});
test('wrong or default database cannot be marked named production resource',()=>{
 for(const dbName of ['postgres','template0','template1','']){
  const r=summarizeDatabaseInspection({connected:true,dbName,schema:'public',tables:[]});
  assert.equal(r.hasNamedDatabase,false);
  assert.equal(r.readyForWrite,false);
 }
});
