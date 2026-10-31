// Read-only independent verification of the persisted isolated demonstration schema.
// Never read passwords, email records, borrower data, source files or secrets.
export function summarizeDemoVerification({connected=false,tables=[],guards=[],counts={},
 receipt=false,publicTables=0}={}){
 const required=['gcx_institutions','gcx_memberships','gcx_records','gcx_record_versions',
 'gcx_events','gcx_domain_records','gcx_domain_versions','gcx_portfolio_batches',
 'gcx_portfolio_positions','gcx_analytic_runs','gcx_advanced_runs','gcx_portfolio_sources',
 'gcx_release_candidates','gcx_release_assignments','gcx_release_reviews',
 'gcx_verified_source_candidates','gcx_source_attestations','gcx_book6_workpapers',
 'gcx_book6_versions','gcx_readiness_assessments','gcx_readiness_versions'];
 const present=new Set(tables),triggered=new Set(guards);
 const missing=required.filter(t=>!present.has(t));
 const guardTables=['gcx_records','gcx_record_versions','gcx_events','gcx_book6_workpapers',
  'gcx_book6_versions','gcx_readiness_assessments','gcx_readiness_versions'];
 const missingGuards=guardTables.filter(t=>!triggered.has(t));
 const verified=Boolean(connected&&missing.length===0&&missingGuards.length===0&&
  counts.institutions===2&&counts.memberships===10&&counts.risks===1&&
  counts.book6Drafts===1&&counts.book6Versions===1&&
  counts.auditEvents>=2&&receipt&&publicTables===0);
 return {connected,readOnly:true,syntheticOnly:true,schema:'greencal_demo',
  demoVerified:verified,enterpriseTables:required.length-missing.length,
  missingTables:missing,missingGuards,
  institutionCount:counts.institutions??null,roleCount:counts.memberships??null,
  book6DraftCount:counts.book6Drafts??null,auditEventCount:counts.auditEvents??null,
  publicTableCount:publicTables,inventoryReceiptPresent:!!receipt,
  bankProductionReady:false,officialOjkWorkbookParity:false,
  legacyPasswordsMigrated:false};
}
export async function verifyPersistedDemo(env=process.env){
 const dsn=env.DATABASE_URL_POOLED||env.DATABASE_URL;
 if(!/^postgres(?:ql)?:\/\//.test(dsn||''))
  return summarizeDemoVerification();
 const {Client}=await import('pg');
 const client=new Client({connectionString:dsn,
  connectionTimeoutMillis:7000,ssl:{rejectUnauthorized:true},
  application_name:'greencal-persisted-demo-verification'});
 try{
  await client.connect();
  await client.query('BEGIN READ ONLY');
  await client.query("SET LOCAL statement_timeout='8s'");
  const tables=await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='greencal_demo' AND table_type='BASE TABLE'");
  const guards=await client.query(`SELECT DISTINCT c.relname AS name FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='greencal_demo' AND NOT t.tgisinternal AND t.tgenabled <> 'D'`);
  const counts=await client.query(`SELECT
    (SELECT count(*)::int FROM greencal_demo.gcx_institutions) AS institutions,
    (SELECT count(*)::int FROM greencal_demo.gcx_memberships) AS memberships,
    (SELECT count(*)::int FROM greencal_demo.gcx_records) AS risks,
    (SELECT count(*)::int FROM greencal_demo.gcx_book6_workpapers WHERE status='draft') AS "book6Drafts",
    (SELECT count(*)::int FROM greencal_demo.gcx_book6_versions) AS "book6Versions",
    (SELECT count(*)::int FROM greencal_demo.gcx_events) AS "auditEvents",
    EXISTS(SELECT 1 FROM greencal_demo.gc_demo_migration_receipts WHERE id='greencal-demo-20261031') AS receipt,
    (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') AS "publicTables"`);
  await client.query('ROLLBACK');
  return summarizeDemoVerification({connected:true,tables:tables.rows.map(x=>x.table_name),
   guards:guards.rows.map(x=>x.name),counts:counts.rows[0],
   receipt:counts.rows[0]?.receipt,publicTables:counts.rows[0]?.publicTables});
 }catch{
  await client.query('ROLLBACK').catch(()=>{});
  return {connected:false,readOnly:true,syntheticOnly:true,
   demoVerified:false,bankProductionReady:false,code:'DEMO_READONLY_INSPECTION_FAILED'};
 }finally{await client.end().catch(()=>{});}
}
