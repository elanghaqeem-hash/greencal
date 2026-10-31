// Preview-only, read-only Bank Sawan synthetic training API.
// Never returns membership emails/subjects, confidential records or PostgreSQL credentials.
// Does NOT authenticate a real bank user and cannot activate regulatory production modules.
import {book7AnnexStress} from '../enterprise/book7-annex.js';
import {analyzeReadiness} from '../enterprise/discovery.js';
import {book6Preview} from '../enterprise/book6.js';
export const SAWAN_PREVIEW_BRANCH='feat/bank-sawan-demo-20261031';
export function sawanPreviewGate(env={}){
 return env.VERCEL_ENV==='preview'&&
 env.VERCEL_GIT_COMMIT_REF===SAWAN_PREVIEW_BRANCH&&
 env.GC_SAWAN_DEMO_ENABLED==='true';
}
const FIXTURE_INPUT={table:'A.3',scenario:'net_zero_2050',year:2026,size:'Mikro',locationRisk:'Tinggi',sector:'Pertanian dan Kehutanan',rating:'AA',baselinePD:'0.0005'};
export function getSawanBook7Example(){
 return {input:{...FIXTURE_INPUT},result:book7AnnexStress(FIXTURE_INPUT),
  status:'SYNTHETIC_ONLY',officialSubmission:false};
}
export async function getSawanDemoSummary(env=process.env){
 if(!sawanPreviewGate(env))return {ok:false,code:'SAWAN_PREVIEW_ONLY'};
 const dsn=env.DATABASE_URL_POOLED||env.DATABASE_URL;
 if(!/^postgres(?:ql)?:\/\//.test(dsn||''))return {ok:false,code:'DB_NOT_CONFIGURED'};
 const {Client}=await import('pg');
 const client=new Client({connectionString:dsn,ssl:{rejectUnauthorized:true},
  connectionTimeoutMillis:7000,application_name:'greencal-sawan-demo-readonly'});
 let tx=false;
 try{
  await client.connect();
  await client.query('BEGIN READ ONLY');tx=true;
  await client.query('SET LOCAL statement_timeout=7000');
  const a=await client.query(
   "SELECT name,institution_type,currency FROM greencal_demo.gcx_institutions WHERE id='bank-sawan-demo' AND active=1");
  if(a.rowCount!==1||!a.rows[0].name.includes('SIMULASI'))throw Error('UNVERIFIED_SYNTHETIC_TENANT');
  const record=await client.query(
   "SELECT title,status FROM greencal_demo.gcx_records WHERE tenant_id='bank-sawan-demo' ORDER BY created_at LIMIT 2");
  const book=await client.query(
   "SELECT payload_json,status FROM greencal_demo.gcx_book6_workpapers WHERE tenant_id='bank-sawan-demo' LIMIT 1");
  const discovery=await client.query(
   "SELECT title,payload,status FROM greencal_demo.gcx_readiness_assessments WHERE tenant_id='bank-sawan-demo' LIMIT 1");
  const runs=await client.query(
   "SELECT count(*)::int AS n FROM greencal_demo.gcx_analytic_runs WHERE tenant_id='bank-sawan-demo' AND kind='book7_annex_stress'");
  const members=await client.query(
   "SELECT role FROM greencal_demo.gcx_memberships WHERE tenant_id='bank-sawan-demo' AND active=1 ORDER BY role");
  const proof=await client.query(
   "SELECT source_type FROM greencal_demo.gc_demo_migration_receipts WHERE id='greencal-demo-20261031'");
  await client.query('ROLLBACK');tx=false;
  if(book.rowCount!==1||discovery.rowCount!==1||proof.rows[0]?.source_type!=='INVENTORY_ONLY_NOT_ACCOUNT_COPY')
   throw Error('INCOMPLETE_DEMO_INVENTORY');
  const parse=v=>typeof v==='string'?JSON.parse(v):v;
  const b=book6Preview(parse(book.rows[0].payload_json)),ready=analyzeReadiness(parse(discovery.rows[0].payload));
  return {ok:true,tenant:{name:a.rows[0].name,type:a.rows[0].institution_type,currency:a.rows[0].currency,
    id:'bank-sawan-demo',syntheticOnly:true},roles:members.rows.map(x=>x.role),
   risk:record.rows.map(x=>({title:x.title,status:x.status})),
   book6:{status:book.rows[0].status,answered:b.answeredCount,questions:b.questionCount,
    templateParity:b.templateParity,officialSubmission:false},
   readiness:{title:discovery.rows[0].title,status:discovery.rows[0].status,
    headline:ready.headline,topics:ready.topics,gaps:ready.gaps.length,blockers:ready.blockers.length,
    questionnaire:ready.evidenceCoverage.questionnaire,inventory:ready.evidenceCoverage.inventory,
    quality:ready.evidenceCoverage.quality,nextStage:ready.indicativeNextStage},
   book7:{runs:runs.rows[0].n,...getSawanBook7Example()},
   bankProductionReady:false,officialSubmission:false,realInstitutionIdentity:false,readOnly:true};
 }catch{
  if(tx)await client.query('ROLLBACK').catch(()=>{});
  return {ok:false,code:'SAWAN_DEMO_NOT_READY',bankProductionReady:false};
 }finally{await client.end().catch(()=>{});}
}
