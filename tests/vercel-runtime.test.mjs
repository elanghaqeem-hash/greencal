import test from 'node:test';
import assert from 'node:assert/strict';
import {toPgSql,d1Compatibility,getPostgres} from '../src/vercel/postgres.js';
import {handler,resolveApiPath,publicNetworkScope} from '../api/bridge.js';

test('SQL placeholders do not rewrite literal/question mark or SQL comments',()=>{
 const q=toPgSql("SELECT '?' AS literal, col FROM items WHERE a=? AND b=? -- ? in comment");
 assert.equal(q.text,"SELECT '?' AS literal, col FROM items WHERE a=$1 AND b=$2 -- ? in comment");
 assert.equal(q.parameterCount,2);
});
test('case-insensitive legacy D1 membership query is translated',()=>{
 assert.equal(toPgSql('SELECT * FROM m WHERE m.email=? COLLATE NOCASE AND tenant_id=?').text,
  'SELECT * FROM m WHERE LOWER(m.email)=LOWER($1) AND tenant_id=$2');
});
test('unsupported SQLite-specific SQL fails closed',()=>{
 for(const sql of ['PRAGMA foreign_keys=ON','SELECT * FROM sqlite_master','INSERT OR IGNORE INTO x VALUES(?)']){
  assert.throws(()=>toPgSql(sql),/SQLITE_ONLY_QUERY/);
 }
 assert.throws(()=>toPgSql("SELECT 'unfinished"),/UNTERMINATED_SQL/);
});
test('prepared statements bind and return rows / metadata',async()=>{
 const queries=[],db={query:async(t,args)=>{queries.push({t,args});return {rows:[{x:4}],rowCount:1};}};
 const adapter=d1Compatibility(db);
 const result=await adapter.prepare('SELECT x FROM d WHERE id=?').bind('a').first();
 assert.equal(result.x,4);
 assert.deepEqual(queries[0],{t:'SELECT x FROM d WHERE id=$1',args:['a']});
 assert.equal((await adapter.prepare('UPDATE d SET x=?').bind(4).run()).meta.changes,1);
 assert.throws(()=>adapter.prepare('SELECT ?').bind(),/SQL_PARAMETER_COUNT_MISMATCH/);
});
test('transactional batch rolls back if any query fails',async()=>{
 const log=[],client={async query(sql){log.push(sql);if(sql==='broken')throw Error('SQL_ERROR');return {rows:[],rowCount:0};},release(){log.push('RELEASE');}};
 const db={query:()=>{},connect:async()=>client};
 const adapter=d1Compatibility(db);
 await assert.rejects(()=>adapter.batch([{sql:'SELECT 1',params:[]},{sql:'broken',params:[]}]),/SQL_ERROR/);
 assert.deepEqual(log,['BEGIN','SELECT 1','broken','ROLLBACK','RELEASE']);
});
test('without configuration, never connect to database',async()=>{
 const old={DATABASE_URL:process.env.DATABASE_URL,DATABASE_URL_POOLED:process.env.DATABASE_URL_POOLED,GREENCAL_POSTGRES_URL:process.env.GREENCAL_POSTGRES_URL};
 delete process.env.DATABASE_URL; delete process.env.DATABASE_URL_POOLED; delete process.env.GREENCAL_POSTGRES_URL;
 try{assert.equal(await getPostgres(),null);}finally{for(const [k,v] of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
function mockRes(){
 const result={headers:{},code:0,data:null};
 result.setHeader=(k,v)=>(result.headers[k]=v,result);
 result.status=x=>(result.code=x,result);
 result.json=x=>(result.data=x,result);
 result.send=x=>(result.data=x,result);
 return result;
}
test('health is explicit and redacts secrets, with false release readiness',async()=>{
 const res=mockRes();
 await handler({query:{path:'health'},method:'GET'},res);
 assert.equal(res.code,200);
 assert.equal(res.data.platform,'vercel');
 assert.equal(res.data.bankProductionReady,false);
 assert.equal(res.headers['Cache-Control'],'no-store');
 assert.equal(JSON.stringify(res.data).includes('PASSWORD'),false);
});
test('institution remains fail-closed with no banking identity',async()=>{
 const res=mockRes();
 await handler({query:{path:'enterprise/session'},method:'GET',headers:{}},res);
 assert.equal(res.code,503);
 assert.equal(res.data.code,'ENTERPRISE_NOT_ENABLED');
});
test('invalid endpoint paths and arbitrary endpoints never impersonate a live API',async()=>{
 assert.equal(resolveApiPath({path:'../../secret'}),null);
 const res=mockRes();
 await handler({query:{path:'auth/login'},method:'POST',headers:{}},res);
 assert.equal(res.code,503);
});

test('network scope HMAC is stable by IP, opaque, and not browser-provided',()=>{
 const secret='very-long-only-in-test-synthetic-secret-37-chars';
 const a=publicNetworkScope({headers:{'x-vercel-forwarded-for':'203.0.113.42'}},secret);
 const b=publicNetworkScope({headers:{'x-vercel-forwarded-for':'203.0.113.42'}},secret);
 const c=publicNetworkScope({headers:{'x-vercel-forwarded-for':'203.0.113.43'}},secret);
 assert.match(a,/^[0-9a-f]{64}$/);
 assert.equal(a,b);
 assert.notEqual(a,c);
 assert.equal(publicNetworkScope({headers:{'x-vercel-forwarded-for':'bad_ip'}},secret),null);
 assert.equal(publicNetworkScope({headers:{'x-vercel-forwarded-for':'203.0.113.42'}},'short'),null);
});
test('public scope endpoint refuses untrusted or absent proxy context',async()=>{
 const req={query:{path:'client-scope'},method:'GET',headers:{}};
 const res=mockRes();
 await handler(req,res);
 assert.equal(res.code,503);
 assert.equal(res.data.code,'NETWORK_SCOPE_UNAVAILABLE');
});
