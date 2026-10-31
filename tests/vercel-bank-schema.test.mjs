import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateBankSchema,inspectBankSchema,REQUIRED_TABLES,GUARDED_TABLES}
 from '../scripts/vercel/verify-bank-schema.mjs';

test('preflight does not certify bank production from complete schema alone',()=>{
 const r=evaluateBankSchema({expectedDatabase:'bank_crms_approved',database:'bank_crms_approved',
  tables:REQUIRED_TABLES,triggerTables:GUARDED_TABLES});
 assert.equal(r.databaseVerified,true);
 assert.equal(r.schemaPresent,true);
 assert.equal(r.bankProductionReady,false);
 assert.deepEqual(r.missingTables,[]);
 assert.deepEqual(r.missingGuards,[]);
});
test('preflight fails closed for wrong database, missing book6, missing immutable guards',()=>{
 for(const database of ['','postgres','other_app','template1']){
  const r=evaluateBankSchema({expectedDatabase:'bank_crms_approved',database,
   tables:REQUIRED_TABLES,triggerTables:GUARDED_TABLES});
  assert.equal(r.schemaPresent,false,database);
 }
 const r=evaluateBankSchema({expectedDatabase:'bank_crms_approved',
  database:'bank_crms_approved',
  tables:REQUIRED_TABLES.filter(t=>t!=='gcx_book6_workpapers'),
  triggerTables:GUARDED_TABLES.filter(t=>t!=='gcx_book6_versions')});
 assert.equal(r.schemaPresent,false);
 assert.ok(r.missingTables.includes('gcx_book6_workpapers'));
 assert.ok(r.missingGuards.includes('gcx_book6_versions'));
});
test('preflight requires dedicated database environment, never falls back to public D1',async()=>{
 const r=await inspectBankSchema({});
 assert.equal(r.schemaPresent,false);
 assert.equal(r.bankProductionReady,false);
 assert.equal(r.code,'BANK_DATABASE_OR_EXPECTED_NAME_MISSING');
});
test('preflight reports only metadata, never secrets or connection strings',()=>{
 const r=evaluateBankSchema({expectedDatabase:'bank_crms_approved',database:'bank_crms_approved',
  tables:REQUIRED_TABLES,triggerTables:[]});
 assert.equal(JSON.stringify(r).includes('DATABASE_URL'),false);
 assert.equal(r.bankProductionReady,false);
});
