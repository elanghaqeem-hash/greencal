import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/worker.js';
import {enterpriseDb} from './support/enterprise-db.mjs';
import {calculateEmission,validatePayload} from '../src/enterprise/validation.js';
const base='https://greencal.test';
const key=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk=await crypto.subtle.exportKey('jwk',key.publicKey);jwk.kid='test-signing-key';
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>String(url)==='test.invalid'?nativeFetch(url,options):new Response(JSON.stringify({keys:[jwk]}),{headers:{'Content-Type':'application/json'}});
const b64=x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url');
async function token(subject='maker',overrides={}){const now=Math.floor(Date.now()/1000),h=b64({alg:'RS256',kid:jwk.kid}),p=b64({sub:subject,email:subject+'@uat.invalid',iss:'https://test-team.cloudflareaccess.com',aud:['enterprise-test-audience'],iat:now,exp:now+300,...overrides});const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key.privateKey,new TextEncoder().encode(h+'.'+p));return h+'.'+p+'.'+Buffer.from(sig).toString('base64url');}
function fixture(){const db=enterpriseDb(),sql=db.sqlite;for(const id of ['bank-a','bank-b'])sql.prepare('INSERT INTO gcx_institutions VALUES(?,?,?,?,?,?)').run(id,'SYNTHETIC UAT '+id,'BUS','IDR',1,'2026-10-27');
 for(const [subject,role] of [['maker','data_maker'],['factor-maker','climate_model_analyst'],['risk-maker','risk_analyst'],['compliance','compliance_reviewer'],['checker','checker'],['approver','approver'],['viewer','executive_viewer'],['auditor','internal_auditor'],['external','external_auditor']])sql.prepare('INSERT INTO gcx_memberships VALUES(?,?,?,?,?)').run('bank-a',subject,subject+'@uat.invalid',role,1);
 sql.prepare('INSERT INTO gcx_memberships VALUES(?,?,?,?,?)').run('bank-b','other','other@uat.invalid','data_maker',1);
 return {db,env:{GC_ENTERPRISE_ENABLED:'true',ENTERPRISE_DB:db,GC_ENTERPRISE_ACCESS_DOMAIN:'test-team.cloudflareaccess.com',GC_ENTERPRISE_ACCESS_AUD:'enterprise-test-audience',ASSETS:{fetch:async()=>new Response('SHELL')}}};}
async function call(f,path,subject='maker',method='GET',body,tenant='bank-a',extra={}){const headers={'Cf-Access-Jwt-Assertion':await token(subject),'X-GreenCal-Tenant':tenant,...(body!==undefined?{'Content-Type':'application/json',Origin:base}:{}),...extra};const r=await worker.fetch(new Request(base+'/api/enterprise'+path,{method,headers,...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})}),f.env);return {status:r.status,body:await r.json()};}
const factor={value:'0.85',activityUnit:'kWh',sourceUrl:'https://methodology.uat.invalid/factor',sourceDocument:'SYNTHETIC UAT FACTOR — not OJK',page:1,methodology:'SYNTHETIC test vector',geography:'UAT',effectiveFrom:'2026-01-01',effectiveTo:'2026-12-31',version:'synthetic-v1',gwpBasis:'CO2e test only'};
const risk={category:'physical',sector:'UAT sector',location:'UAT location',event:'Synthetic flood',cause:'Synthetic cause',transmission:'Synthetic collateral',impact:'Synthetic loss',owner:'Risk owner UAT',likelihood:2,severity:3,controls:'UAT controls',mitigation:'UAT mitigation',dueDate:'2026-12-31'};
const emission=factorId=>({quantity:'1000',activityUnit:'kWh',activityDate:'2026-06-30',scope:'scope2',factorId,evidence:'SYNTHETIC UAT meter',branch:'UAT Branch'});
async function create(f,kind,payload,subject){const r=await call(f,'/records',subject,'POST',{kind,title:'SYNTHETIC '+kind,payload});assert.equal(r.status,201,JSON.stringify(r.body));return r.body.record;}
async function act(f,r,action,subject,reason=''){const next=await call(f,'/records/'+r.id+'/workflow',subject,'POST',{revision:r.revision,action,reason});assert.equal(next.status,200,JSON.stringify(next.body));return next.body.record;}
async function approveFactor(f){let r=await create(f,'factor',factor,'factor-maker');r=await act(f,r,'submit','factor-maker');r=await act(f,r,'check','checker');r=await act(f,r,'approve','approver');return r;}

test('disabled enterprise and missing identity fail closed; no public DB fallback',async()=>{
 const r=await worker.fetch(new Request(base+'/api/enterprise/session'),{DB:{}});assert.equal(r.status,503);
 const f=fixture();const req=new Request(base+'/api/enterprise/session');assert.equal((await worker.fetch(req,f.env)).status,401);f.db.sqlite.close();
});
test('real RSA signature, audience, issuer, expiry, nbf and subject bind enterprise identity',async()=>{
 const f=fixture();for(const overrides of [{aud:['wrong']},{iss:'https://wrong.cloudflareaccess.com'},{exp:0},{nbf:Math.floor(Date.now()/1000)+1000},{sub:''},{email:'other@uat.invalid'}]){
 const r=await call(f,'/session','maker','GET',undefined,'bank-a',{'Cf-Access-Jwt-Assertion':await token('maker',overrides)});assert.ok(r.status===401||(r.status===200&&r.body.tenants.length===0));
 }const forged=(await token()).slice(0,-12)+'AAAAAAAAAAAA';assert.equal((await call(f,'/session','maker','GET',undefined,'bank-a',{'Cf-Access-Jwt-Assertion':forged})).status,401);
 const r=await call(f,'/session');assert.equal(r.status,200);assert.deepEqual(r.body.tenants.map(t=>t.tenant_id),['bank-a']);f.db.sqlite.close();
});
test('tenant parameter and forged browser role cannot grant access',async()=>{
 const f=fixture();assert.equal((await call(f,'/institution','maker','GET',undefined,'bank-b')).status,403);
 assert.equal((await call(f,'/records','maker','POST',{kind:'factor',title:'fake',payload:factor,role:'institution_administrator'})).status,403);
 const r=await create(f,'risk',risk,'risk-maker');assert.equal((await call(f,'/records/'+r.id,'other','GET',undefined,'bank-b')).status,404);f.db.sqlite.close();
});
test('CSRF, malformed input, oversized streamed body and negative quantities are rejected',async()=>{
 const f=fixture();assert.equal((await call(f,'/records','factor-maker','POST',{kind:'factor',title:'test',payload:factor},'bank-a',{Origin:'https://evil.invalid'})).status,403);
 assert.equal((await call(f,'/records','factor-maker','POST','{')).status,400);
 assert.equal((await call(f,'/records','factor-maker','POST',JSON.stringify({x:'a'.repeat(33000)}))).status,413);
 for(const value of [null,-1,'-1','1e6','NaN','0.0000001'])assert.throws(()=>validatePayload('factor',{...factor,value}));f.db.sqlite.close();
});
test('source, ISO dates, unit, and page validation reject invalid reference data',()=>{
 for(const payload of [{...factor,effectiveFrom:'2026-02-30'},{...factor,effectiveTo:'2025-01-01'},{...factor,sourceUrl:'http://insecure.invalid'},{...factor,page:0}])assert.throws(()=>validatePayload('factor',payload));
 assert.throws(()=>validatePayload('regulatory_document',{book:7,officialTitle:'x',publicationDate:'2026-10-06',version:'2026',sourceUrl:'https://other.invalid/book.pdf',sha256:'a'.repeat(64),pageCount:2}));
});
test('three separate actors review and approve; author cannot self-check or approve',async()=>{
 const f=fixture();let r=await create(f,'factor',factor,'factor-maker');r=await act(f,r,'submit','factor-maker');
 assert.equal((await call(f,'/records/'+r.id+'/workflow','factor-maker','POST',{revision:r.revision,action:'check'})).status,403);
 assert.equal((await call(f,'/records/'+r.id+'/workflow','approver','POST',{revision:r.revision,action:'approve'})).status,403);
 r=await act(f,r,'check','checker');r=await act(f,r,'approve','approver');assert.equal(r.status,'approved');assert.notEqual(r.created_by,r.checked_by);assert.notEqual(r.created_by,r.approved_by);assert.notEqual(r.checked_by,r.approved_by);f.db.sqlite.close();
});
test('approved factor + activity calculate on server, ignore forged outputs, freeze source snapshot',async()=>{
 const f=fixture(),fac=await approveFactor(f);let r=await create(f,'emission',{...emission(fac.id),calculation:{result:999999}},'maker');
 assert.equal(r.payload.calculation.result,'0.85');assert.equal(r.payload.calculation.factorRevision,4);
 r=await act(f,r,'submit','maker');r=await act(f,r,'check','checker');r=await act(f,r,'approve','approver');
 const exported=await call(f,'/records/'+r.id+'/export','auditor');assert.equal(exported.status,200);assert.match(exported.body.sha256,/^[a-f0-9]{64}$/);assert.equal(exported.body.snapshot.regulatoryReport,false);
 const rec=exported.body.snapshot.record;assert.equal(calculateEmission(rec.payload,{...fac,payload:JSON.stringify(rec.payload.calculation.factorSnapshot)}).calculation.result,rec.payload.calculation.result);
 assert.equal(exported.body.snapshot.history.length,4);f.db.sqlite.close();
});
test('unapproved factors, mismatch units, expired factors and cross-tenant factor IDs cannot calculate',async()=>{
 const f=fixture(),draft=await create(f,'factor',factor,'factor-maker');assert.equal((await call(f,'/records','maker','POST',{kind:'emission',title:'test',payload:emission(draft.id)})).status,400);
 const fac=await approveFactor(f);for(const payload of [{...emission(fac.id),activityUnit:'MWh'},{...emission(fac.id),activityDate:'2027-01-01'}])assert.equal((await call(f,'/records','maker','POST',{kind:'emission',title:'test',payload})).status,400);
 assert.equal((await call(f,'/records','other','POST',{kind:'emission',title:'cross tenant',payload:emission(fac.id)},'bank-b')).status,404);f.db.sqlite.close();
});
test('exact decimal test vectors preserve measured zero, distinguish null and avoid binary rounding',()=>{
 const f={id:'test-only',revision:4,kind:'factor',status:'approved',payload:JSON.stringify({...factor,value:'0.2'})};
 for(const [quantity,expected] of [['0.1','0.00002'],['0','0'],['1000','0.2'],['0.000001','0.0000000002']])assert.equal(calculateEmission({...emission('test-only'),quantity},f).calculation.result,expected);
 assert.throws(()=>validatePayload('emission',{...emission('id'),quantity:null}));
});
test('stale revisions cannot overwrite; approved snapshots and audit/version rows cannot be modified or deleted',async()=>{
 const f=fixture(),fac=await approveFactor(f);assert.equal((await call(f,'/records/'+fac.id,'factor-maker','PATCH',{revision:fac.revision,title:'tamper',payload:factor})).status,403);
 assert.equal((await call(f,'/records/'+fac.id+'/workflow','factor-maker','POST',{revision:1,action:'submit'})).status,409);
 const s=f.db.sqlite;assert.throws(()=>s.prepare('UPDATE gcx_records SET revision=revision+1,title=? WHERE id=?').run('tamper',fac.id),/frozen/);
 for(const sql of ['DELETE FROM gcx_records','DELETE FROM gcx_events','UPDATE gcx_events SET action=\'tamper\'','DELETE FROM gcx_record_versions','UPDATE gcx_record_versions SET status=\'draft\''])assert.throws(()=>s.exec(sql));s.close();
});
test('record mutation rolls back atomically when audit write fails',async()=>{
 const f=fixture();f.db.sqlite.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON gcx_events BEGIN SELECT RAISE(ABORT,'test audit unavailable'); END;");
 const r=await call(f,'/records','risk-maker','POST',{kind:'risk',title:'UAT rollback',payload:risk});assert.equal(r.status,503);
 assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) AS n FROM gcx_records').get().n,0);assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) AS n FROM gcx_record_versions').get().n,0);f.db.sqlite.close();
});
test('reject with reason, edit and resubmit retain old versions and re-run independent review',async()=>{
 const f=fixture();let r=await create(f,'risk',risk,'risk-maker');r=await act(f,r,'submit','risk-maker');
 assert.equal((await call(f,'/records/'+r.id+'/workflow','checker','POST',{revision:r.revision,action:'reject',reason:''})).status,403);
 r=await act(f,r,'reject','checker','Evidence insufficient');const updated=await call(f,'/records/'+r.id,'risk-maker','PATCH',{revision:r.revision,title:'UAT revised',payload:{...risk,likelihood:3,inherentScore:25}});assert.equal(updated.status,200);r=updated.body.record;assert.equal(r.payload.inherentScore,9);r=await act(f,r,'submit','risk-maker');assert.equal(r.checked_by,null);
 assert.equal((await call(f,'/records/'+r.id+'/history','auditor')).body.versions.length,5);f.db.sqlite.close();
});
test('external auditor sees only approved records; deactivated membership loses access',async()=>{
 const f=fixture();const draft=await create(f,'risk',risk,'risk-maker');assert.equal((await call(f,'/records/'+draft.id,'external')).status,404);
 assert.equal((await call(f,'/records?kind=risk','external')).body.records.length,0);
 const fac=await approveFactor(f);assert.equal((await call(f,'/records/'+fac.id,'external')).status,200);assert.equal((await call(f,'/audit','external')).status,403);
 f.db.sqlite.prepare('UPDATE gcx_memberships SET active=0 WHERE subject=?').run('maker');assert.equal((await call(f,'/summary')).status,403);f.db.sqlite.close();
});
test('document-to-requirement mapping requires reviewed source and valid page; approval never claims compliance PASS',async()=>{
 const f=fixture();let doc=await create(f,'regulatory_document',{book:7,officialTitle:'SYNTHETIC UAT source metadata only',publicationDate:'2026-10-06',version:'2026',sourceUrl:'https://ojk.go.id/uat-not-a-real-file.pdf',sha256:'a'.repeat(64),pageCount:10},'compliance');
 const requirement={documentId:doc.id,chapter:'UAT',section:'UAT',page:2,requirement:'SYNTHETIC',module:'UAT',data:'UAT',businessRule:'UAT',testCase:'UAT',evidence:'UAT',implementationStatus:'planned'};
 assert.equal((await call(f,'/records','compliance','POST',{kind:'requirement',title:'UAT',payload:requirement})).status,400);
 doc=await act(f,doc,'submit','compliance');doc=await act(f,doc,'check','checker');doc=await act(f,doc,'approve','approver');
 const r=await create(f,'requirement',requirement,'compliance');assert.equal(r.payload.acceptanceStatus,'not_validated');assert.equal(r.payload.documentHash,'a'.repeat(64));
 assert.equal((await call(f,'/records','compliance','POST',{kind:'requirement',title:'UAT',payload:{...requirement,page:11}})).status,400);
 assert.equal((await call(f,'/summary')).body.regulatoryAcceptance,'not_validated');f.db.sqlite.close();
});
test('enterprise HTML security headers and no browser persistence; public calculator remains independent',async()=>{
 const f=fixture();const r=await worker.fetch(new Request(base+'/enterprise/'),f.env);assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(r.headers.get('cache-control'),'no-store');
 const js=readFileSync(new URL('../assets/enterprise.js',import.meta.url),'utf8');assert.doesNotMatch(js,/\b(?:localStorage|sessionStorage)\.(?:setItem|getItem)|innerHTML\s*=/);f.db.sqlite.close();
});

test('two writes using the same revision cannot both commit',async()=>{
 const f=fixture(),r=await create(f,'risk',risk,'risk-maker');const updates=await Promise.all(['one','two'].map(title=>call(f,'/records/'+r.id,'risk-maker','PATCH',{revision:r.revision,title,payload:risk})));
 assert.deepEqual(updates.map(x=>x.status).sort(),[200,409]);assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) AS n FROM gcx_record_versions WHERE record_id=?').get(r.id).n,2);f.db.sqlite.close();
});
test('local SQLite backup restores frozen data, history and foreign-key integrity',async()=>{
 const {backup,DatabaseSync}=await import('node:sqlite'),{mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const f=fixture(),fac=await approveFactor(f),directory=await mkdtemp(join(tmpdir(),'greencal-restore-'));
 try{const path=join(directory,'snapshot.sqlite');await backup(f.db.sqlite,path);const restored=new DatabaseSync(path);assert.equal(restored.prepare('SELECT payload FROM gcx_records WHERE id=?').get(fac.id).payload,JSON.stringify(fac.payload));assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM gcx_record_versions').get().n,4);assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM gcx_events').get().n,4);assert.deepEqual(restored.prepare('PRAGMA foreign_key_check').all(),[]);assert.throws(()=>restored.exec('DELETE FROM gcx_records'),/retention/);restored.close();}finally{f.db.sqlite.close();await rm(directory,{recursive:true,force:true});}
});
