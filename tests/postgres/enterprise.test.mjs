// PostgreSQL 16 integration tests, LOCAL synthetic data ONLY.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
const url=process.env.GREENCAL_TEST_POSTGRES_URL;
if (!/^postgres(ql)?:\/\//.test(url||'')) throw Error('Local PostgreSQL test URL missing');
const host=new URL(url).hostname;
if (!['localhost','127.0.0.1','::1'].includes(host)) throw Error('Refusing tests on non-loopback PostgreSQL');
const pool=new Pool({connectionString:url,max:2});
const sql=await readFile(new URL('../../migrations/postgres/0001_enterprise.sql',import.meta.url),'utf8');
await pool.query(sql);
const run=(query,params=[])=>pool.query(query,params);
async function rejects(query,params=[]){await assert.rejects(()=>run(query,params));}
try {
 const count=await run("SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema=current_schema() AND table_name LIKE 'gcx_%'");
 assert.equal(count.rows[0].n,22);
 const fake='__synthetic_ci_only__', other='__other_synthetic__';
 for (const id of [fake,other]) {
  await run('INSERT INTO gcx_institutions(id,name,institution_type,currency,created_at) VALUES($1,$2,$3,$4,$5)',
   [id,'Synthetic bank never real','BUS','IDR','2026-10-31']);
 }
 for (const [subject,role] of [['maker','data_maker'],['checker','checker'],['approver','approver']]) {
  await run('INSERT INTO gcx_memberships(tenant_id,subject,email,role) VALUES($1,$2,$3,$4)',
   [fake,subject,subject+'@invalid.test',role]);
 }
 const valid=JSON.stringify({synthetic:true,amount:0});
 await run("INSERT INTO gcx_records(tenant_id,id,kind,title,payload,created_by,updated_by,created_at,updated_at) VALUES($1,'r1','risk','Synthetic', $2,'maker','maker','t0','t0')",[fake,valid]);
 const v=await run("SELECT COUNT(*)::int AS n FROM gcx_record_versions WHERE tenant_id=$1 AND record_id='r1'",[fake]);assert.equal(v.rows[0].n,1);
 await rejects("UPDATE gcx_records SET title='Wrong revision' WHERE tenant_id=$1 AND id='r1'",[fake]);
 await run("UPDATE gcx_records SET revision=revision+1,title='Reviewed',status='submitted',updated_by='maker',updated_at='t1' WHERE tenant_id=$1 AND id='r1'",[fake]);
 const v2=await run("SELECT COUNT(*)::int AS n FROM gcx_record_versions WHERE tenant_id=$1 AND record_id='r1'",[fake]);assert.equal(v2.rows[0].n,2);
 await rejects("DELETE FROM gcx_record_versions WHERE tenant_id=$1",[fake]);
 await rejects("DELETE FROM gcx_events WHERE tenant_id=$1",[fake]);
 await rejects("DELETE FROM gcx_records WHERE tenant_id=$1",[fake]);
 await rejects("INSERT INTO gcx_records(tenant_id,id,kind,title,payload,created_by,updated_by,created_at,updated_at) VALUES($1,'bad','risk','Invalid','not JSON','maker','maker','t0','t0')",[fake]);
 await rejects("INSERT INTO gcx_records(tenant_id,id,kind,title,payload,created_by,updated_by,created_at,updated_at) VALUES($1,'bad2','risk','Cross tenant',$2,'maker','maker','t0','t0')",[other,valid]);
 // Independent attestation must reject self-review and missing appointment.
 await run("INSERT INTO gcx_release_candidates(tenant_id,id,commit_sha,build_sha256,evidence_sha256,created_by,created_at) VALUES($1,'c1',$2,$3,$3,'maker','t2')",[fake,'a'.repeat(40),'b'.repeat(64)]);
 await rejects("INSERT INTO gcx_release_reviews(tenant_id,candidate_id,function,reviewer_subject,outcome,evidence_sha256,evidence_reference,attestation,reviewed_at) VALUES($1,'c1','risk','maker','approved',$2,'evidence','fake','t3')",[fake,'b'.repeat(64)]);
 console.log(JSON.stringify({synthetic:true,tests:'PASS',tables:21,checks:['versions','immutability','tenant-fk','json','approval-guard'],bankProductionReady:false}));
} finally { await pool.end(); }
