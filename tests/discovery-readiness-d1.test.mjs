import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';

const migration=await readFile(new URL('../migrations/enterprise/0100_discovery_readiness.sql',import.meta.url),'utf8');
function setup(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 db.exec("CREATE TABLE gcx_institutions(id TEXT PRIMARY KEY,name TEXT,institution_type TEXT,currency TEXT,active INTEGER,created_at TEXT)");
 db.exec("CREATE TABLE gcx_memberships(tenant_id TEXT,subject TEXT,email TEXT,role TEXT,active INTEGER,PRIMARY KEY(tenant_id,subject),FOREIGN KEY(tenant_id) REFERENCES gcx_institutions(id))");
 db.exec("CREATE TABLE gcx_events(id INTEGER PRIMARY KEY AUTOINCREMENT,tenant_id TEXT,actor TEXT,action TEXT,target TEXT,occurred_at TEXT)");
 db.exec(migration);
 for(const tenant of ['bank-a','bank-b']){
  db.prepare('INSERT INTO gcx_institutions VALUES(?,?,?,?,?,?)').run(tenant,tenant,'BUS','IDR',1,'2026-10-31');
  for(const subject of ['maker','checker','approver'])db.prepare('INSERT INTO gcx_memberships VALUES(?,?,?,?,?)').run(tenant,subject,subject+'@example.invalid',subject==='maker'?'data_maker':subject,1);
 }
 return db;
}
test('isolated readiness D1 schema creates evidence without seeded assessments',()=>{
 const db=setup();
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM gcx_readiness_assessments').get().n,0);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM gcx_readiness_versions').get().n,0);
 db.close();
});
test('tenant-specific revisions, immutable version trail and blocked deletes',()=>{
 const db=setup();
 const p='{"dimensions":{},"topics":{},"answers":{},"inventory":{},"quality":{}}';
 db.prepare("INSERT INTO gcx_readiness_assessments(tenant_id,id,title,payload,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)")
 .run('bank-a','a1','Review bank a',p,'maker','maker','2026-10-31','2026-10-31');
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM gcx_readiness_versions WHERE tenant_id=?').get('bank-a').n,1);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM gcx_readiness_assessments WHERE tenant_id=? AND id=?').get('bank-b','a1').n,0);
 db.prepare("INSERT INTO gcx_readiness_assessments(tenant_id,id,title,payload,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)")
 .run('bank-b','a1','Review bank b',p,'maker','maker','2026-10-31','2026-10-31');
 db.prepare("UPDATE gcx_readiness_assessments SET revision=revision+1,status='submitted',updated_at='2026-11-01' WHERE tenant_id='bank-a' AND id='a1'").run();
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM gcx_readiness_versions WHERE tenant_id='bank-a' AND assessment_id='a1'").get().n,2);
 assert.throws(()=>db.prepare("UPDATE gcx_readiness_versions SET reason='tampered' WHERE tenant_id='bank-a'").run(),/immutable readiness evidence/);
 assert.throws(()=>db.prepare("DELETE FROM gcx_readiness_assessments WHERE tenant_id='bank-a'").run(),/readiness retention/);
 assert.throws(()=>db.prepare("UPDATE gcx_readiness_assessments SET title='no revision' WHERE tenant_id='bank-a' AND id='a1'").run(),/invalid readiness revision/);
 db.prepare("UPDATE gcx_readiness_assessments SET revision=revision+1,status='checked',checked_by='checker',updated_by='checker',updated_at='2026-11-02' WHERE tenant_id='bank-a' AND id='a1'").run();
 db.prepare("UPDATE gcx_readiness_assessments SET revision=revision+1,status='approved',approved_by='approver',updated_by='approver',updated_at='2026-11-03' WHERE tenant_id='bank-a' AND id='a1'").run();
 assert.throws(()=>db.prepare("UPDATE gcx_readiness_assessments SET revision=revision+1,title='overwrite' WHERE tenant_id='bank-a' AND id='a1'").run(),/approved readiness snapshot immutable/);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM gcx_readiness_versions WHERE tenant_id='bank-a'").get().n,4);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM gcx_events WHERE tenant_id='bank-a'").get().n,4);
 assert.equal(db.prepare("SELECT title FROM gcx_readiness_assessments WHERE tenant_id='bank-b' AND id='a1'").get().title,'Review bank b');
 db.close();
});
