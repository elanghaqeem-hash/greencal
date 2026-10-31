// Read-only deployment-time probe of the Vercel-bound PostgreSQL resource.
// Does not enumerate rows, retrieve PII, print connection strings or mutate the DB.
// Run only with GC_MIGRATION_READONLY_PROBE=true in Preview.
export function summarizeDatabaseInspection({connected=false,dbName='',schema='',tables=[],isRecovery=false}={}){
 const bankTables=tables.filter(t=>/^gcx_[a-z0-9_]+$/.test(t));
 const publicQuota=tables.includes('gc_public_ai_quota');
 const unexpected=tables.filter(t=>!/^gcx_[a-z0-9_]+$/.test(t)&&t!=='gc_public_ai_quota');
 return {connected,readOnly:true,bankProductionReady:false,
  hasNamedDatabase:Boolean(dbName)&&!['postgres','template0','template1'].includes(dbName),
  schemaIsPublic:schema==='public',isRecovery:Boolean(isRecovery),
  bankTableCount:bankTables.length,publicQuotaTablePresent:publicQuota,
  otherTableCount:unexpected.length,dbNameRedacted:true,
  readyForWrite:false};
}
export async function inspectDestinationDatabase(env=process.env){
 const url=env.DATABASE_URL_POOLED||env.GREENCAL_POSTGRES_URL||env.DATABASE_URL;
 if(!/^postgres(?:ql)?:\/\//.test(url||'')){
  return {connected:false,readOnly:true,bankProductionReady:false,code:'POSTGRES_NOT_CONFIGURED'};
 }
 let client;
 try{
  const {Client}=await import('pg');
  client=new Client({connectionString:url,ssl:{rejectUnauthorized:true},
   connectionTimeoutMillis:7000,application_name:'greencal-migration-readonly-probe'});
  await client.connect();
  await client.query('BEGIN TRANSACTION READ ONLY');
  await client.query("SET LOCAL statement_timeout = '5s'");
  const meta=await client.query(
    'SELECT current_database() AS db, current_schema() AS schema, pg_is_in_recovery() AS recovery');
  const rows=await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' ORDER BY table_name LIMIT 500");
  await client.query('ROLLBACK');
  return summarizeDatabaseInspection({connected:true,dbName:meta.rows[0]?.db,
    schema:meta.rows[0]?.schema,tables:rows.rows.map(x=>x.table_name),
    isRecovery:meta.rows[0]?.recovery});
 }catch{
  if(client)await client.query('ROLLBACK').catch(()=>{});
  return {connected:false,readOnly:true,bankProductionReady:false,
   code:'POSTGRES_READONLY_PROBE_FAILED'};
 }finally{if(client)await client.end().catch(()=>{});}
}
