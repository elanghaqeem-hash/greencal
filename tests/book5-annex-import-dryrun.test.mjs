import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
const scoreCols='province,regency,district,asset_line,scenario,year,flood,sea_level_rise,wildfire,heat_stress,water_stress,storm,combined';
const mapCols='province_code,province,regency_code,regency,district_code,district,village_code,village,postal_code,book5_id';
const sum=x=>createHash('sha256').update(x).digest('hex');
async function fixture(){
 const dir=await mkdtemp(join(tmpdir(),'gc-book5-'));
 const score=gzipSync(scoreCols+'\nJAWA BARAT,DEPOK,PANCORAN MAS,residential,Current Policy,2030,20,0,0,29,0,0,8\n');
 const postcode=gzipSync(mapCols+'\n32,JAWA BARAT,3276,KOTA DEPOK,,PANCORAN MAS,32.76.01.1001,SIMULASI,16431,JAWA BARAT_PANCORAN MAS\n');
 const manifest={
  status:'staging_pending_independent_review',
  normalized_scores:{rows:1,sha256:sum(score),quarantined_records:60},
  postal_mapping:{rows:1,sha256:sum(postcode)},
  exception_report:{sha256:'a'.repeat(64)}
 };
 const names={manifest:join(dir,'manifest.json'),scores:join(dir,'scores.csv.gz'),postcodes:join(dir,'postcodes.csv.gz')};
 await Promise.all([writeFile(names.manifest,JSON.stringify(manifest)),writeFile(names.scores,score),writeFile(names.postcodes,postcode)]);
 return {dir,names};
}
function dryrun(f){
 return spawnSync(process.execPath,['scripts/book5/import-official-annex.mjs',
  '--manifest',f.names.manifest,'--scores',f.names.scores,'--postcodes',f.names.postcodes,'--dry-run'],{encoding:'utf8'});
}
test('Bank-side loader validates source manifest, legitimate zero and staging-only status',async()=>{
 const f=await fixture();
 try{
  const run=dryrun(f);
  assert.equal(run.status,0,run.stderr);
  const result=JSON.parse(run.stdout);
  assert.equal(result.normalizedRiskRows,1);
  assert.equal(result.postcodeRows,1);
  assert.equal(result.quarantinedRecords,60);
  assert.equal(result.status,'STAGING_PASS_PENDING_SOURCE_EXCEPTION_APPROVAL');
 }finally{await rm(f.dir,{recursive:true,force:true});}
});
test('Tampering with original staged bytes is blocked by source checksum',async()=>{
 const f=await fixture();
 try{
  await writeFile(f.names.scores,gzipSync(scoreCols+'\nJAWA BARAT,DEPOK,PANCORAN MAS,residential,Current Policy,2030,99,0,0,29,0,0,8\n'));
  const run=dryrun(f);
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/SHA-256 mismatch/);
 }finally{await rm(f.dir,{recursive:true,force:true});}
});
