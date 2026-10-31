// One-time, intentionally guarded migration for GreenCal DEMO ONLY.
// A Vercel Preview build may initialize the *isolated* greencal_demo schema.
// It never changes public schema, imports legacy passwords or enables bank reporting.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {validateBook6Draft} from '../../src/enterprise/book6.js';

export const DEMO_SCHEMA='greencal_demo';
export const DEMO_BRANCH='feat/vercel-dummy-database-apply-20261031';
export const DEMO_TRIGGER='apply-demo-only-20261031';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const sourceCounts=Object.freeze({gc_state:0,gc_users:2,gc_sessions:0,
 gc_login_limits:0,gc_events:0,gc_public_ai_quota:0,
 ai_settings:0,users:0,sessions:0});
const sha=value=>createHash('sha256').update(value).digest('hex');

export function migrationGate(env={}){
 if(env.GC_DEMO_MIGRATION_APPLY!==DEMO_TRIGGER)return {allowed:false,code:'NOT_REQUESTED'};
 if(env.VERCEL_ENV!=='preview'||env.VERCEL_GIT_COMMIT_REF!==DEMO_BRANCH)
  return {allowed:false,code:'PREVIEW_BRANCH_REQUIRED'};
 if(env.GC_DEMO_APPROVED_TARGET!=='greencal-crms-enterprise')
  return {allowed:false,code:'WRONG_VERCEL_PROJECT'};
 if(!/^[a-z][a-z0-9_]{1,63}$/.test(env.GC_DEMO_TARGET_DATABASE||''))
  return {allowed:false,code:'DATABASE_CONFIRMATION_REQUIRED'};
 if(!/^(?:postgres|postgresql):\/\//.test(env.DATABASE_URL_POOLED||env.DATABASE_URL||''))
  return {allowed:false,code:'DATABASE_CONNECTION_MISSING'};
 return {allowed:true,code:'PREVIEW_DEMO_ONLY'};
}
export const sourceInventory=()=>({...sourceCounts});
function stripTransaction(sql){
 if(!/^BEGIN;\s*$/m.test(sql)||!/^COMMIT;\s*$/m.test(sql))
  throw Error('EXPECTED_TRANSACTION_WRAPPER');
 return sql.replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'');
}
export async function migrateDummyOnPreview(env=process.env){
 const gate=migrationGate(env);
 if(!gate.allowed)return {...gate,applied:false,bankProductionReady:false};
 const {Client}=await import('pg');
 const client=new Client({connectionString:env.DATABASE_URL_POOLED||env.DATABASE_URL,
  connectionTimeoutMillis:8000,ssl:{rejectUnauthorized:true},
  application_name:'greencal-demo-migration-20261031'});
 let began=false;
 try{
  await client.connect();
  const meta=await client.query('SELECT current_database() AS name, pg_is_in_recovery() AS recovery');
  if(meta.rows[0]?.name!==env.GC_DEMO_TARGET_DATABASE||meta.rows[0]?.recovery)
   throw Error('DATABASE_TARGET_NOT_CONFIRMED');
  await client.query('BEGIN');
  began=true;
  await client.query('SET LOCAL statement_timeout=20000');
  // Serialize deployment builds: one schema creation even during concurrent previews.
  await client.query("SELECT pg_advisory_xact_lock(hashtext('greencal_demo_one_time_migration'))");
  const present=await client.query('SELECT 1 FROM pg_namespace WHERE nspname=$1',[DEMO_SCHEMA]);
  if(present.rowCount)throw Error('DEMO_SCHEMA_ALREADY_EXISTS_NO_OVERWRITE');
  const publicTables=await client.query(
   "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' LIMIT 2");
  if(publicTables.rowCount)throw Error('PUBLIC_SCHEMA_NOT_EMPTY');
  // Only writes to the new namespace. Each original migration's BEGIN/COMMIT
  // is stripped so both DDL files, seed and receipt use ONE atomic transaction.
  await client.query('CREATE SCHEMA greencal_demo');
  await client.query('SET LOCAL search_path TO greencal_demo,public');
  const file1=await readFile(resolve(root,'migrations/vercel/0100_enterprise_core.sql'),'utf8');
  const file2=await readFile(resolve(root,'migrations/vercel/0101_enterprise_modules.sql'),'utf8');
  await client.query(stripTransaction(file1));
  await client.query(stripTransaction(file2));
  await client.query(`CREATE TABLE gc_demo_migration_receipts(
    id TEXT PRIMARY KEY, source_counts_json TEXT NOT NULL CHECK(source_counts_json IS JSON),
    source_type TEXT NOT NULL CHECK(source_type='INVENTORY_ONLY_NOT_ACCOUNT_COPY'),
    migration_sha256 TEXT NOT NULL CHECK(length(migration_sha256)=64),
    created_at TEXT NOT NULL
   )`);
  const now='2026-10-31T00:00:00.000Z';
  for(const [id,name,kind] of [
   ['demo-bus-2026','BANK SIMULASI GREENCAL — DATA FIKTIF','BUS'],
   ['demo-uus-2026','UNIT USAHA SIMULASI GREENCAL — DATA FIKTIF','UUS']
  ]){
   await client.query(`INSERT INTO gcx_institutions
    (id,name,institution_type,currency,active,created_at) VALUES($1,$2,$3,'IDR',1,$4)`,[id,name,kind,now]);
   for(const [subject,role] of [
    ['demo-maker','data_maker'],['demo-checker','checker'],['demo-approver','approver'],
    ['demo-risk','risk_analyst'],['demo-auditor','internal_auditor']]){
     await client.query(`INSERT INTO gcx_memberships(tenant_id,subject,email,role,active)
      VALUES($1,$2,$3,$4,1)`,[id,subject,subject+'@example.invalid',role]);
   }
  }
  const risk={
   category:'physical',sector:'Sektor fiktif pertanian',location:'Wilayah fiktif Indonesia',
   event:'Simulasi banjir, tidak berdasarkan data kejadian nyata',
   cause:'Skenario uji internal',transmission:'Penurunan nilai agunan simulasi',
   impact:'Dampak hipotetis pada kualitas kredit',owner:'Risk Analyst DEMO',
   likelihood:2,severity:3,controls:'Peninjauan pengendalian simulasi',
   mitigation:'Rencana mitigasi sintetis',dueDate:'2026-12-31',
   scale:'bank-internal-5x5-v1',inherentScore:6
  };
  await client.query(`INSERT INTO gcx_records
    (tenant_id,id,kind,title,payload,status,created_by,updated_by,created_at,updated_at)
    VALUES($1,'demo-risk-physical-01','risk','DEMO — Risiko Iklim Fiktif',
    $2,'draft','demo-risk','demo-risk',$3,$3)`,
    ['demo-bus-2026',JSON.stringify(risk),now]);
  const book6=validateBook6Draft({
   reportingYear:2026,
   bank:{code:'DEMO-ONLY',name:'BANK SIMULASI GREENCAL — BUKAN BANK NYATA',
    picName:'Kontak Demo',picTitle:'Operator Simulasi',picEmail:'contact@example.invalid',
    picPhone:'0000000000'},
   answers:{},figures:[],bonds:[],
   methodologyNotes:'SEMUA DATA DEMO. Bukan template Excel resmi OJK, tidak untuk pelaporan regulator.',
   executiveSummary:'DRAF UJI INTERNAL — hasil dan identitas sepenuhnya sintetis.'
  });
  await client.query(`INSERT INTO gcx_book6_workpapers
   (tenant_id,id,reporting_year,bank_code,payload_json,status,created_by,updated_by,created_at,updated_at)
   VALUES($1,'demo-book6-draft-01',2026,'DEMO-ONLY',$2,'draft','demo-maker','demo-maker',$3,$3)`,
   ['demo-bus-2026',JSON.stringify(book6),now]);
  const inv=JSON.stringify(sourceCounts),migrationHash=sha(file1+'\n'+file2+'\n'+inv);
  await client.query(`INSERT INTO gc_demo_migration_receipts
   (id,source_counts_json,source_type,migration_sha256,created_at)
   VALUES('greencal-demo-20261031',$1,'INVENTORY_ONLY_NOT_ACCOUNT_COPY',$2,$3)`,
   [inv,migrationHash,now]);
  const result=await client.query(`SELECT
    (SELECT count(*)::int FROM gcx_institutions) AS institutions,
    (SELECT count(*)::int FROM gcx_memberships) AS demo_memberships,
    (SELECT count(*)::int FROM gcx_records) AS demo_records,
    (SELECT count(*)::int FROM gcx_book6_workpapers) AS demo_book6_drafts,
    (SELECT count(*)::int FROM gcx_events) AS audit_events,
    (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='greencal_demo' AND table_name LIKE 'gcx_%') AS enterprise_tables`);
  if(result.rows[0]?.institutions!==2||result.rows[0]?.demo_memberships!==10||
     result.rows[0]?.enterprise_tables!==21||result.rows[0]?.demo_book6_drafts!==1)
   throw Error('DEMO_RECONCILIATION_FAILED');
  await client.query('COMMIT');began=false;
  return {allowed:true,applied:true,mode:'SYNTHETIC_ONLY',schema:DEMO_SCHEMA,
   ...result.rows[0],legacyAccountHashesMigrated:false,sourcePublicStateRows:0,
   book6OfficialWorkbookParity:false,bankProductionReady:false};
 }catch(e){
  if(began)await client.query('ROLLBACK').catch(()=>{});
  return {allowed:true,applied:false,code:e?.message?.slice(0,100)||'DEMO_APPLY_FAILED',
   bankProductionReady:false};
 }finally{await client.end().catch(()=>{});}
}
