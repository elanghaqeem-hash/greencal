// Read-only PostgreSQL schema preflight for a dedicated institution database.
// Does NOT create tables, import bank data, approve models or turn on enterprise flags.
// Run only after a bank owner approves the provider/database and credentials.
import {pathToFileURL} from 'node:url';

export const REQUIRED_TABLES=Object.freeze([
 'gcx_institutions','gcx_memberships','gcx_records','gcx_record_versions','gcx_events',
 'gcx_domain_records','gcx_domain_versions','gcx_portfolio_batches','gcx_portfolio_positions',
 'gcx_analytic_runs','gcx_advanced_runs','gcx_portfolio_sources','gcx_release_candidates',
 'gcx_release_assignments','gcx_release_reviews','gcx_verified_source_candidates',
 'gcx_source_attestations','gcx_book6_workpapers','gcx_book6_versions',
 'gcx_readiness_assessments','gcx_readiness_versions'
]);
export const GUARDED_TABLES=Object.freeze([
 'gcx_records','gcx_record_versions','gcx_events','gcx_domain_records',
 'gcx_domain_versions','gcx_portfolio_batches','gcx_portfolio_positions',
 'gcx_analytic_runs','gcx_advanced_runs','gcx_portfolio_sources',
 'gcx_release_candidates','gcx_release_assignments','gcx_release_reviews',
 'gcx_verified_source_candidates','gcx_source_attestations','gcx_book6_workpapers',
 'gcx_book6_versions','gcx_readiness_assessments','gcx_readiness_versions'
]);

export function evaluateBankSchema({expectedDatabase,database,tables=[],triggerTables=[]}={}){
 const expected=typeof expectedDatabase==='string'?expectedDatabase.trim():'';
 const actual=typeof database==='string'?database.trim():'';
 const present=new Set(tables),guarded=new Set(triggerTables);
 const missingTables=REQUIRED_TABLES.filter(t=>!present.has(t));
 const missingGuards=GUARDED_TABLES.filter(t=>!guarded.has(t));
 const databaseVerified=!!expected&&!!actual&&expected===actual&&
  !/^postgres|template[01]$/i.test(actual);
 const schemaPresent=databaseVerified&&missingTables.length===0&&missingGuards.length===0;
 return {databaseVerified,schemaPresent,tableCount:present.size,
  missingTables,missingGuards,bankProductionReady:false,
  note:'Schema metadata only; NOT a tenant-isolation test, release approval, or OJK workbook certification.'};
}

export async function inspectBankSchema(env=process.env){
 const url=env.GC_ENTERPRISE_DATABASE_URL_POOLED;
 const expected=env.GREENCAL_BANK_DB_NAME;
 const publicUrl=env.DATABASE_URL_POOLED||env.GREENCAL_POSTGRES_URL||env.DATABASE_URL;
 if(url && publicUrl){try{const a=new URL(url),b=new URL(publicUrl);
  if(a.hostname===b.hostname&&a.pathname===b.pathname)
   return {databaseVerified:false,schemaPresent:false,bankProductionReady:false,code:'BANK_DATABASE_NOT_ISOLATED'};
 }catch{}}
 if(!/^postgres(?:ql)?:\/\//.test(url||'')||!expected)
  return {databaseVerified:false,schemaPresent:false,bankProductionReady:false,
   code:'BANK_DATABASE_OR_EXPECTED_NAME_MISSING'};
 const {Client}=await import('pg');
 const client=new Client({connectionString:url,connectionTimeoutMillis:5000,
  ssl:{rejectUnauthorized:true},application_name:'greencal-schema-preflight'});
 try{
  await client.connect();
  await client.query('BEGIN READ ONLY');
  const info=await client.query('SELECT current_database() AS name');
  const t=await client.query(`SELECT table_name FROM information_schema.tables
   WHERE table_schema=current_schema() AND table_type='BASE TABLE' AND table_name LIKE 'gcx_%'`);
  const guards=await client.query(`SELECT DISTINCT c.relname AS name
   FROM pg_trigger tr JOIN pg_class c ON c.oid=tr.tgrelid
   JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname=current_schema() AND NOT tr.tgisinternal AND tr.tgenabled <> 'D'`);
  await client.query('ROLLBACK');
  return evaluateBankSchema({expectedDatabase:expected,database:info.rows[0]?.name,
   tables:t.rows.map(x=>x.table_name),triggerTables:guards.rows.map(x=>x.name)});
 }catch{
  try{await client.query('ROLLBACK');}catch{}
  return {databaseVerified:false,schemaPresent:false,bankProductionReady:false,
   code:'BANK_SCHEMA_INSPECTION_FAILED'};
 }finally{await client.end().catch(()=>{});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=await inspectBankSchema();
 console.log(JSON.stringify(result));
 if(!result.schemaPresent)process.exitCode=1;
}
