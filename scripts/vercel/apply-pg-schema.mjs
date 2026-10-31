// Manual, controlled Enterprise PostgreSQL release utility. NEVER called at build/request startup.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {Pool} from 'pg';

const migration=resolve(fileURLToPath(new URL('../../migrations/postgres/0001_enterprise.sql',import.meta.url)));
const args=new Set(process.argv.slice(2));
const test=args.has('--synthetic-ci');
const apply=args.has('--apply') || test;
const url=test?process.env.GREENCAL_TEST_POSTGRES_URL:process.env.GC_ENTERPRISE_DATABASE_URL_POOLED;
if (!apply) {
 console.log(JSON.stringify({apply:false,source:'migrations/postgres/0001_enterprise.sql',dataset:'none',sourceD1Unchanged:true}));
 process.exit(0);
}
if (!/^postgres(ql)?:\/\//i.test(url||'')) throw Error('Dedicated enterprise PostgreSQL connection missing');
const parsed=new URL(url);
if (test) {
 if (!['127.0.0.1','localhost','::1'].includes(parsed.hostname)) throw Error('Synthetic test must use a loopback database');
} else {
 if (process.env.GC_ENTERPRISE_SCHEMA_APPROVED!=='true') throw Error('Institutional schema processing approval missing');
 if (url === process.env.DATABASE_URL_POOLED || url === process.env.DATABASE_URL || url===process.env.POSTGRES_URL)
  throw Error('Institutional database must differ from the public GreenCal database');
 if (!['require','verify-full','verify-ca'].includes(parsed.searchParams.get('sslmode')||''))
  throw Error('TLS is required for institution database');
}
const pool=new Pool({connectionString:url,max:1,connectionTimeoutMillis:8000,
 ssl:test?false:{rejectUnauthorized:true}});
const c=await pool.connect();
try {
 // Only an isolated target is eligible. Do not modify shared Prisma/other bank schemas.
 const existing=await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE' AND table_name LIKE 'gcx_%'");
 if (existing.rows.length) throw Error('Target contains GreenCal tables: refusing overwrite');
 const ddl=await readFile(migration,'utf8');
 await c.query(ddl);
 const objects=await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE' AND table_name LIKE 'gcx_%'");
 if (objects.rows.length!==22) throw Error('Enterprise PostgreSQL migration object count mismatch');
 console.log(JSON.stringify({apply:true,enterpriseTables:21,receiptTables:1,sourceD1Unchanged:true,bankProductionReady:false}));
} finally {
 c.release();
 await pool.end();
}
