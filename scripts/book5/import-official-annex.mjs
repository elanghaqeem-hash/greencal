#!/usr/bin/env node
// OJK CRMS 2026 Buku 5 secure bank-side staging importer.
// Never runs during Vercel build. Never uploads XLSX or raw data to public GitHub.
import {createReadStream} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {createGunzip} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createInterface} from 'node:readline';
const RISK=['province','regency','district','asset_line','scenario','year','flood','sea_level_rise','wildfire','heat_stress','water_stress','storm','combined'];
const POST=['province_code','province','regency_code','regency','district_code','district','village_code','village','postal_code','book5_id'];
const SCA=new Set(['Current Policy','Delayed Transition','Net Zero 2050']);
const YEARS=new Set(['2020','2030','2040','2050']);
const ASSETS=new Set(['residential','commercial','industrial','other']);
const HAZARDS=RISK.slice(6);
const die=(msg)=>{throw Error('BOOK5_IMPORT_DENIED: '+msg);};
function args(){
 const a={};for(let i=2;i<process.argv.length;i++){
  const p=process.argv[i];if(p==='--dry-run'||p==='--apply')a[p.slice(2)]=true;
  else if(['--manifest','--scores','--postcodes'].includes(p)){a[p.slice(2)]=process.argv[++i];}
  else die('unknown argument '+p);
 }
 if(!a.manifest||!a.scores||!a.postcodes||Boolean(a['dry-run'])===Boolean(a.apply))die('Use --manifest --scores --postcodes plus exactly one of --dry-run or --apply.');
 return a;
}
function csv(line){
 const output=[];let field='',quoted=false;
 for(let i=0;i<line.length;i++){
  const c=line[i];
  if(quoted){
   if(c==='"'&&line[i+1]==='"'){field+='"';i++;}
   else if(c==='"')quoted=false;
   else field+=c;
  }else if(c==='"'){if(field.length)die('invalid CSV quoting');quoted=true;}
  else if(c===','){output.push(field);field='';}
  else field+=c;
 }
 if(quoted)die('multi-line or incomplete CSV quoting');output.push(field);return output;
}
async function* csvRows(file,expected){
 const input=createInterface({input:createReadStream(file).pipe(createGunzip()),crlfDelay:Infinity});
 let header=false;
 for await(const line of input){
  if(!line.trim())continue;
  const cols=csv(line);
  if(!header){
   header=true;
   if(cols.join('|')!==expected.join('|'))die('Unexpected CSV column schema');
   continue;
  }
  if(cols.length!==expected.length)die('Incorrect CSV field count');
  yield Object.fromEntries(expected.map((k,i)=>[k,cols[i]]));
 }
 if(!header)die('CSV missing header');
}
async function sha256(path){
 const h=createHash('sha256');
 for await(const part of createReadStream(path))h.update(part);
 return h.digest('hex');
}
function risk(r){
 for(const key of RISK.slice(0,4))if(!r[key]||r[key].length>150)die('risk dimension missing '+key);
 if(!ASSETS.has(r.asset_line)||!SCA.has(r.scenario)||!YEARS.has(r.year))die('unexpected risk dimension');
 for(const key of HAZARDS){
  if(!/^\d{1,3}(?:\.\d{1,6})?$/.test(r[key]))die('missing/non-numeric official score '+key);
  const n=Number(r[key]);
  if(!Number.isFinite(n)||n<0||n>100)die('score 0-100 required');
 }
}
function postcode(p){
 if(!/^[0-9]{5}$/.test(p.postal_code))die('postcode must be exactly 5 digits');
 for(const key of ['province','regency','district','book5_id'])if(!p[key]||p[key].length>250)die('required postcode dimension missing: '+key);
}
async function preflight(a,m){
 if(m.status!=='staging_pending_independent_review'||!m.exception_report?.sha256)
  die('A bank-controlled staging manifest and an exception report are required');
 for(const [key,expected] of [[a.scores,m.normalized_scores.sha256],[a.postcodes,m.postal_mapping.sha256]]){
  if(await sha256(key)!==expected)die('normalized source SHA-256 mismatch');
 }
 let riskCount=0,postalCount=0,zeroCount=0;
 const identifiers=new Set();
 for await(const r of csvRows(a.scores,RISK)){
  risk(r);riskCount++;const k=RISK.slice(0,6).map(x=>r[x]).join('\x1f');
  if(identifiers.has(k))die('duplicate source location/scenario/year');
  identifiers.add(k);
  for(const h of HAZARDS)if(Number(r[h])===0)zeroCount++;
 }
 for await(const p of csvRows(a.postcodes,POST)){postcode(p);postalCount++;}
 if(riskCount!==m.normalized_scores.rows||postalCount!==m.postal_mapping.rows)
  die('row counts disagree with source manifest');
 if(!riskCount||!postalCount||!zeroCount)die('empty source or no legitimate zero scores');
 return {normalizedRiskRows:riskCount,postcodeRows:postalCount,
  legitimateZeroScores:zeroCount,quarantinedRecords:m.normalized_scores.quarantined_records,
  status:'STAGING_PASS_PENDING_SOURCE_EXCEPTION_APPROVAL'};
}
async function insertBatch(client,table,columns,records){
 if(!records.length)return;
 const placeholders=[],values=[];
 for(let i=0;i<records.length;i++){
  const part=[];for(let j=0;j<columns.length;j++){
   values.push(records[i][j]);part.push('$'+values.length);
  }placeholders.push('('+part.join(',')+')');
 }
 await client.query('INSERT INTO '+table+'('+columns.join(',')+') VALUES '+placeholders.join(','),values);
}
async function apply(a,m,qa){
 // A successful dry run never grants authority to mark source 'validated'.
 if(process.env.GC_BOOK5_IMPORT_ACK!=='import-to-staging-only')die('Import is disabled without staging-only acknowledgement.');
 const tenant=process.env.GC_BOOK5_TENANT_ID,actor=process.env.GC_BOOK5_ACTOR_SUBJECT,
  dataset=process.env.GC_BOOK5_DATASET_ID,mapping=process.env.GC_BOOK5_MAPPING_ID;
 for(const [label,value] of Object.entries({tenant,actor,dataset,mapping}))
  if(typeof value!=='string'||!(/^[a-zA-Z0-9_-]{1,80}$/).test(value))die(label+' not explicitly selected');
 const url=process.env.DATABASE_URL_POOLED||process.env.GREENCAL_POSTGRES_URL;
 if(!/^postgres(?:ql)?:\/\//.test(url||''))die('Approved bank PostgreSQL connection is missing');
 const {Pool}=await import('pg');
 const pool=new Pool({connectionString:url,max:2,ssl:{rejectUnauthorized:true}});
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const membership=await client.query("SELECT m.role FROM gcx_memberships m JOIN gcx_institutions i ON i.id=m.tenant_id WHERE m.tenant_id=$1 AND m.subject=$2 AND m.active=1 AND i.active=1",[tenant,actor]);
  if(!membership.rows.length||!['institution_administrator','crms_project_administrator'].includes(membership.rows[0].role))
   die('An authorized institution administrator is required; no default user is seeded');
  const tables=await client.query("SELECT to_regclass('gcx_book5_scores') AS score_table,to_regclass('gcx_book5_postcodes') AS postcode_table");
  if(!tables.rows[0]?.score_table||!tables.rows[0]?.postcode_table)die('Migrations 0102 and 0103 must be independently applied first');
  const existing=await client.query('SELECT id FROM gcx_book5_datasets WHERE tenant_id=$1 AND id=$2',[tenant,dataset]);
  if(existing.rows.length)die('Dataset ID already exists; never overwrite official source');
  const now=new Date().toISOString();
  await client.query('INSERT INTO gcx_book5_datasets(tenant_id,id,version,sha256,source_reference,latest_data_confirmed,status,created_by,created_at) VALUES($1,$2,$3,$4,$5,0,$6,$7,$8)',
   [tenant,dataset,'OJK CRMS Buku 5 2026 — Lampiran 1',m.source_encrypted_file_sha256.risk,'OJK Buku 5 Lampiran 1 encrypted XLSX checksum','loaded_pending_validation',actor,now]);
  await client.query('INSERT INTO gcx_book5_postcode_datasets(tenant_id,id,source_sha256,source_reference,source_version,status,created_by,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
   [tenant,mapping,m.source_encrypted_file_sha256.mapping,'OJK Buku 5 Lampiran 2 encrypted XLSX checksum','OJK Buku 5 2026 — Lampiran 2','loaded_pending_validation',actor,now]);
  const rk=['tenant_id','dataset_id',...RISK];
  let group=[];for await(const r of csvRows(a.scores,RISK)){
   risk(r);group.push([tenant,dataset,...RISK.map(k=>HAZARDS.includes(k)?Number(r[k]):k==='year'?Number(r[k]):r[k])]);
   if(group.length===200){await insertBatch(client,'gcx_book5_scores',rk,group);group=[];}
  }await insertBatch(client,'gcx_book5_scores',rk,group);
  const pk=['tenant_id','mapping_id','source_row',...POST];
  group=[];let sourceRow=1;
  for await(const p of csvRows(a.postcodes,POST)){
   postcode(p);sourceRow++;
   group.push([tenant,mapping,sourceRow,...POST.map(k=>p[k]||null)]);
   if(group.length===200){await insertBatch(client,'gcx_book5_postcodes',pk,group);group=[];}
  }await insertBatch(client,'gcx_book5_postcodes',pk,group);
  await client.query('COMMIT');
  return {status:'IMPORTED_STAGING_ONLY',datasetId:dataset,mappingId:mapping,
   tenantId:tenant,rows:qa.normalizedRiskRows,postcodes:qa.postcodeRows,
   scoreDatasetValidated:false,postcodeDatasetValidated:false,
   independentReviewAndExplicitApprovalRequired:true};
 }catch(e){await client.query('ROLLBACK');throw e;}
 finally{client.release();await pool.end();}
}
const a=args();
const manifest=JSON.parse(await readFile(a.manifest,'utf8'));
const qa=await preflight(a,manifest);
const output=a.apply?await apply(a,manifest,qa):qa;
process.stdout.write(JSON.stringify(output,null,2)+'\n');
