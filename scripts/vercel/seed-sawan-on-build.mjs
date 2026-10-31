// One-shot Bank Sawan synthetic tenant provisioning into an existing, isolated demo schema.
// Only exact Vercel Preview branch. No source bank data, other tenants or public DDL changed.
import {createHash} from 'node:crypto';
import {validateBook6Draft} from '../../src/enterprise/book6.js';
import {validatePayload as validateReadiness} from '../../src/enterprise/discovery-api.js';
import {book7AnnexStress} from '../../src/enterprise/book7-annex.js';
export const SAWAN_SEED_TRIGGER='seed-sawan-demo-once-20261031';
export const SAWAN_SEED_BRANCH='feat/bank-sawan-demo-20261031';
export function sawanSeedGate(env={}){
 return env.GC_SAWAN_SEED_APPLY===SAWAN_SEED_TRIGGER&&
 env.VERCEL_ENV==='preview'&&env.VERCEL_GIT_COMMIT_REF===SAWAN_SEED_BRANCH&&
 env.GC_SAWAN_APPROVED_TARGET==='greencal-crms-enterprise'&&
 env.GC_SAWAN_DB_NAME==='postgres'&&
 /^postgres(?:ql)?:\/\//.test(env.DATABASE_URL_POOLED||env.DATABASE_URL||'');
}
const sha=s=>createHash('sha256').update(s).digest('hex');
export function sawanFixture(){
 const now='2026-10-31T00:00:00.000Z';
 const risk={category:'physical',sector:'Pertanian dan Kehutanan (SIMULASI)',location:'Wilayah Sawan Fiktif',event:'DEMO: kenaikan frekuensi banjir hipotetis',cause:'Skenario iklim buatan untuk pelatihan',transmission:'Penurunan nilai agunan sintetik',impact:'Perubahan PD dan LGD ilustratif',owner:'Risk Analyst Bank Sawan DEMO',likelihood:3,severity:3,controls:'Pemantauan portofolio simulasi',mitigation:'Review agunan simulasi',dueDate:'2027-01-31',scale:'bank-internal-5x5-v1',inherentScore:9};
 const book6=validateBook6Draft({reportingYear:2026,bank:{code:'SAWAN-DEMO',name:'Bank Sawan — SIMULASI / BUKAN BANK NYATA',picName:'PIC DEMO',picTitle:'Operator Simulasi',picEmail:'contact@example.invalid',picPhone:'0000000000'},answers:{},figures:[],bonds:[],methodologyNotes:'DATA FIKTIF. Belum direkonsiliasi dengan workbook resmi Buku 6 OJK.',executiveSummary:'DRAF SIMULASI Bank Sawan. Bukan laporan regulator atau data bank nyata.'});
 const readiness=validateReadiness({scope:'Bank Sawan — simulasi CRMS 7 Buku OJK, tanpa data riil',asOf:'2026-10-31',interviewer:'Asesor simulasi',notes:'DATA DEMO, skor penilaian tidak berdasarkan bukti aktual.',dimensions:{
  governance:{score:2,gap:'Kebijakan hanya simulasi',blocker:true,owner:'Sawan Risk (simulasi)'},
  data:{score:1,gap:'Data CBS/GL/CKPN tidak tersedia',blocker:true},
  portfolio:{score:2,gap:'Portofolio tidak terhubung ke bank',blocker:true},
  scenario:{score:2,gap:'Asumsi NGFS menggunakan contoh tanpa verifikasi',blocker:true},
  financial:{score:1,gap:'Belum ada validasi model bank',blocker:true},
  technology:{score:2,gap:'Akses hanya demo, belum SSO bank',blocker:true}
 },topics:{T01:{score:2,completenessPct:35},T02:{score:2,completenessPct:25},T03:{score:1,completenessPct:10}},answers:{A1:{status:'partial',answer:'Simulasi kebutuhan CRMS bank, bukan penilaian aktual',evidenceRef:'DEMO-SAWAN-NON-OFFICIAL'}},inventory:{},quality:{}});
 const input={table:'A.3',scenario:'net_zero_2050',year:2026,size:'Mikro',locationRisk:'Tinggi',sector:'Pertanian dan Kehutanan',rating:'AA',baselinePD:'0.0005'};
 const book7=book7AnnexStress(input);
 return {now,risk,book6,readiness,input,book7,sourceSha256:sha('BANK SAWAN SYNTHETIC ONLY 2026-10-31')};
}
export async function seedSawanOnPreview(env=process.env){
 if(!sawanSeedGate(env))return {allowed:false,applied:false,code:'SAWAN_SEED_GATE_CLOSED',bankProductionReady:false};
 const {Client}=await import('pg');const f=sawanFixture(),connectionString=env.DATABASE_URL_POOLED||env.DATABASE_URL;
 const client=new Client({connectionString,connectionTimeoutMillis:8000,ssl:{rejectUnauthorized:true},application_name:'greencal-sawan-once-preview'});
 let began=false;
 try{
  await client.connect();
  const meta=await client.query('SELECT current_database() AS name,pg_is_in_recovery() AS recovery');
  if(meta.rows[0]?.name!=='postgres'||meta.rows[0]?.recovery)throw Error('UNEXPECTED_DATABASE');
  await client.query('BEGIN');began=true;await client.query('SET LOCAL statement_timeout=20000');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('greencal-demo-sawan-tenant'))");
  await client.query('SET LOCAL search_path TO greencal_demo,public');
  const receipt=await client.query("SELECT source_type FROM gc_demo_migration_receipts WHERE id='greencal-demo-20261031'");
  if(receipt.rows[0]?.source_type!=='INVENTORY_ONLY_NOT_ACCOUNT_COPY')throw Error('DEMO_SCHEMA_NOT_VERIFIED');
  const others=await client.query("SELECT id FROM gcx_institutions ORDER BY id");
  if(others.rows.length!==2||others.rows.some(x=>!['demo-bus-2026','demo-uus-2026'].includes(x.id)))throw Error('UNEXPECTED_EXISTING_TENANTS');
  const pub=await client.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'");
  if(pub.rows[0]?.n!==0)throw Error('PUBLIC_SCHEMA_NOT_EMPTY');
  await client.query("INSERT INTO gcx_institutions(id,name,institution_type,currency,active,created_at) VALUES('bank-sawan-demo','Bank Sawan — SIMULASI / DATA FIKTIF','BUS','IDR',1,$1)",[f.now]);
  const subjects=[
   ['sawan-maker','data_maker'],['sawan-checker','checker'],['sawan-approver','approver'],
   ['sawan-risk','risk_analyst'],['sawan-model','climate_model_analyst'],['sawan-compliance','compliance_reviewer']
  ];
  for(const [subject,role] of subjects)await client.query(
   'INSERT INTO gcx_memberships(tenant_id,subject,email,role,active) VALUES($1,$2,$3,$4,1)',
   ['bank-sawan-demo',subject,subject+'@example.invalid',role]);
  await client.query(`INSERT INTO gcx_records
   (tenant_id,id,kind,title,payload,status,created_by,updated_by,created_at,updated_at)
   VALUES('bank-sawan-demo','sawan-risk-physical-01','risk','SIMULASI: Risiko Fisik Bank Sawan',$1,'draft','sawan-risk','sawan-risk',$2,$2)`,
   [JSON.stringify(f.risk),f.now]);
  await client.query(`INSERT INTO gcx_book6_workpapers
   (tenant_id,id,reporting_year,bank_code,payload_json,status,created_by,updated_by,created_at,updated_at)
   VALUES('bank-sawan-demo','sawan-book6-draft-01',2026,'SAWAN-DEMO',$1,'draft','sawan-maker','sawan-maker',$2,$2)`,
   [JSON.stringify(f.book6),f.now]);
  await client.query(`INSERT INTO gcx_readiness_assessments
   (tenant_id,id,title,payload,status,created_by,updated_by,created_at,updated_at)
   VALUES('bank-sawan-demo','sawan-readiness-draft-01','Discovery Readiness — Bank Sawan (SIMULASI)',
   $1,'draft','sawan-risk','sawan-risk',$2,$2)`,[JSON.stringify(f.readiness),f.now]);
  // Existing PostgreSQL migration was earlier than annex methods; expand CHECK only
  // in the isolated demo schema, not any institution production table.
  await client.query('ALTER TABLE gcx_analytic_runs DROP CONSTRAINT gcx_analytic_runs_kind_check');
  await client.query(`ALTER TABLE gcx_analytic_runs ADD CONSTRAINT gcx_analytic_runs_kind_check
   CHECK(kind IN('ngfs_interpolation','geospatial_overlay','credit_transmission',
   'book7_standardized','ojk_reconciliation','book7_annex_lookup','book7_annex_stress',
   'book7_mapping','book7_productive_pd','book7_retail_npl','book7_collateral_lgd',
   'book7_frye_jacobs','book7_npl','book7_ckpn','book7_market','book7_liquidity','book7_capital'))`);
  await client.query(`INSERT INTO gcx_analytic_runs
   (tenant_id,id,kind,request_json,result_json,source_sha256,actor,occurred_at,status)
   VALUES('bank-sawan-demo','sawan-book7-run-01','book7_annex_stress',$1,$2,$3,'sawan-model',$4,'internal_only')`,
   [JSON.stringify(f.input),JSON.stringify(f.book7),f.sourceSha256,f.now]);
  const check=await client.query(`SELECT
    (SELECT count(*)::int FROM gcx_institutions WHERE id='bank-sawan-demo') AS institutions,
    (SELECT count(*)::int FROM gcx_memberships WHERE tenant_id='bank-sawan-demo') AS memberships,
    (SELECT count(*)::int FROM gcx_records WHERE tenant_id='bank-sawan-demo') AS risks,
    (SELECT count(*)::int FROM gcx_book6_workpapers WHERE tenant_id='bank-sawan-demo') AS book6,
    (SELECT count(*)::int FROM gcx_readiness_assessments WHERE tenant_id='bank-sawan-demo') AS readiness,
    (SELECT count(*)::int FROM gcx_analytic_runs WHERE tenant_id='bank-sawan-demo') AS book7`);
  const row=check.rows[0];
  if(row.institutions!==1||row.memberships!==6||row.risks!==1||row.book6!==1||row.readiness!==1||row.book7!==1)throw Error('SAWAN_RECONCILIATION_FAILED');
  await client.query('COMMIT');began=false;
  return {allowed:true,applied:true,tenant:'bank-sawan-demo',mode:'SYNTHETIC_ONLY',...row,bankProductionReady:false,officialOjkSubmission:false};
 }catch(e){if(began)await client.query('ROLLBACK').catch(()=>{});return {allowed:true,applied:false,code:e?.message?.slice(0,110)||'SEED_FAILED',bankProductionReady:false};}
 finally{await client.end().catch(()=>{});}
}
