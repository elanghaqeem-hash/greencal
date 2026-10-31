import test from 'node:test';
import assert from 'node:assert/strict';
import {BOOK6_QUESTIONS,BOOK6_BOND_FIELDS,book6Catalog,book6Preview,validateBook6Draft} from '../src/enterprise/book6.js';
import {handleBook6Api} from '../src/enterprise/book6-api.js';
import {enterpriseDb} from './support/enterprise-db.mjs';
const hash='a'.repeat(64);
const bank={code:'SYNTHETIC-UAT',name:'SYNTHETIC TEST BANK',picName:'PIC TEST',picTitle:'Climate Risk Test',picEmail:'pic@uat.invalid',picPhone:'000'};
const base=()=>({reportingYear:2026,bank,answers:{'Panduan Umum.1':{text:'UAT illustrative response',evidence:['SYNTHETIC-POLICY-01']}},figures:[{section:'B',metric:'outstanding',period:'t',dimensions:{sector:'NR1',stage:'1'},value:'100.000001',sourceReference:'SYNTHETIC-GL',sourceSha256:hash}],bonds:[],methodologyNotes:'SYNTHETIC UAT ONLY'});
function fixture(){const db=enterpriseDb();for(const id of ['bank-a','bank-b'])db.sqlite.prepare('INSERT INTO gcx_institutions VALUES(?,?,?,?,?,?)').run(id,id,'BUS','IDR',1,'2026-10-31');db.sqlite.prepare('INSERT INTO gcx_memberships VALUES(?,?,?,?,?)').run('bank-a','maker','maker@uat.invalid','data_maker',1);db.sqlite.prepare('INSERT INTO gcx_memberships VALUES(?,?,?,?,?)').run('bank-a','checker','checker@uat.invalid','compliance_reviewer',1);db.sqlite.prepare('INSERT INTO gcx_memberships VALUES(?,?,?,?,?)').run('bank-b','other','other@uat.invalid','data_maker',1);return db;}
const request=(path,method='GET',body)=>new Request('https://uat.invalid/api/enterprise'+path,{method,headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
const api=(db,path,role='data_maker',subject='maker',tenant='bank-a',method='GET',body,env={})=>handleBook6Api(request(path,method,body),{GC_ENTERPRISE_BOOK6_ENABLED:'true',...env},db,tenant,{role,subject},path);
test('Buku 6 official sections, full qualitative count, and 13 mandatory bond fields',()=>{
 const c=book6Catalog();assert.equal(BOOK6_QUESTIONS.length,81);assert.equal(new Set(BOOK6_QUESTIONS.map(q=>q.id)).size,81);
 assert.deepEqual(Object.keys(c.scenarios),['C','D','E']);assert.equal(BOOK6_BOND_FIELDS.length,13);
 assert.deepEqual(c.periods.C,['t','t+1','t+2','t+3','2030','2040','2050']);assert.equal(c.officialWorkbookAvailable,false);
});
test('draft never fabricates empty data; distinguishes missing from reported zero',()=>{
 const d=validateBook6Draft(base()),p=book6Preview(d);
 assert.equal(d.figures[0].value,'100.000001');assert.equal(p.answeredCount,1);assert.equal(p.officialSubmission,false);
 assert.ok(p.warnings.some(x=>x.includes('Workbook')));
 assert.equal(p.qualitative.required,81);
 assert.equal(p.qualitative.answered,1);
 assert.equal(p.qualitative.missingQuestionIds.length,80);
 assert.deepEqual(p.qualitative.answeredMissingEvidenceIds,[]);
 assert.equal(p.quantitative.rows,1);
 assert.deepEqual(p.quantitative.missingSections,['C','D','E','F','G','H']);
 assert.equal(p.quantitative.sourceBytesVerified,false);
 assert.equal(p.quantitative.glCkpnReconciled,false);
 assert.equal(p.quantitative.officialWorkbookCellParity,false);
 assert.equal(validateBook6Draft({...base(),figures:[{...base().figures[0],value:'0'}]}).figures[0].value,'0');
 assert.equal(validateBook6Draft({...base(),figures:[]}).figures.length,0);
});
test('invalid source, sector, period, duplicate, negative, unexpected metric, typo question and forged output are rejected',()=>{
 const d=base(),f=d.figures[0];
 for(const invalid of [{...f,sourceSha256:'0'.repeat(10)},{...f,dimensions:{...f.dimensions,sector:'UNKNOWN'}},{...f,period:'2051'},{...f,value:'1e6'},{...f,value:'-100'},{...f,metric:'unknown'},{...f,section:'A'}]){
  assert.throws(()=>validateBook6Draft({...d,figures:[invalid]}));
 }
 assert.throws(()=>validateBook6Draft({...d,figures:[f,f]}));
 assert.throws(()=>validateBook6Draft({...d,figures:[{section:'B',metric:'pd',period:'t',dimensions:{sector:'NR1'},value:'101',sourceReference:'UAT',sourceSha256:hash}]}));
 assert.throws(()=>validateBook6Draft({...d,figures:[{section:'G',metric:'operational_transition_cost',period:'2030',dimensions:{expenseType:'training'},value:'1',sourceReference:'UAT',sourceSha256:hash}]}));
 assert.throws(()=>validateBook6Draft({...d,figures:[{section:'C',metric:'top10_counterparty_credit',period:'2030',dimensions:{sector:'R1',counterpartyRef:'ANON',measure:'EAD'},value:'1',sourceReference:'UAT',sourceSha256:hash}]}));
 assert.throws(()=>validateBook6Draft({...d,answers:{'FAKE.1':{text:'Wrong'}}}));
 assert.equal(validateBook6Draft({...d,officialSubmission:true,readyForBankUse:true}).schema,'greencal-book6-draft-v1');
});
test('internal Book6 APIs fail closed, enforce role, tenant isolation and writer ownership',async()=>{
 const db=fixture();
 try{
  await assert.rejects(()=>api(db,'/book6/catalog','data_maker','maker','bank-a','GET',undefined,{GC_ENTERPRISE_BOOK6_ENABLED:'false'}),e=>e.code==='BOOK6_DISABLED');
  await assert.rejects(()=>api(db,'/book6/workpapers','executive_viewer','maker','bank-a','POST',base()),e=>e.code==='BOOK6_ROLE_DENIED');
  const create=await api(db,'/book6/workpapers','data_maker','maker','bank-a','POST',base());assert.equal(create.status,201);
  const created=await create.json();assert.equal(created.revision,1);
  const id=created.id;
  await assert.rejects(()=>api(db,'/book6/workpapers/'+id,'data_maker','other','bank-b'),e=>e.code==='BOOK6_NOT_FOUND');
  await assert.rejects(()=>api(db,'/book6/workpapers/'+id,'data_maker','maker','bank-a','PATCH',{revision:0,document:base()}),e=>e.code==='BOOK6_REVISION_CONFLICT');
  await assert.rejects(()=>api(db,'/book6/workpapers/'+id,'data_maker','not-maker','bank-a','PATCH',{revision:1,document:base()}),e=>e.code==='BOOK6_OWNER_DENIED');
  const update=await api(db,'/book6/workpapers/'+id,'data_maker','maker','bank-a','PATCH',{revision:1,document:{...base(),methodologyNotes:'UPDATED SYNTHETIC'}});assert.equal((await update.json()).revision,2);
  const get=await api(db,'/book6/workpapers/'+id);assert.equal((await get.json()).document.methodologyNotes,'UPDATED SYNTHETIC');
  const exportResponse=await api(db,'/book6/workpapers/'+id+'/export','compliance_reviewer','checker');const exp=await exportResponse.json();
  assert.match(exp.sha256,/^[a-f0-9]{64}$/);assert.equal(exp.snapshot.regulatoryReport,false);
  assert.equal(exp.snapshot.officialWorkbookParity,'unverified');
  const rows=db.sqlite.prepare('SELECT COUNT(*) n FROM gcx_book6_versions WHERE tenant_id=? AND workpaper_id=?').get('bank-a',id);assert.equal(rows.n,2);
  assert.throws(()=>db.sqlite.prepare('UPDATE gcx_book6_versions SET actor=?').run('tamper'),/immutable/);
  assert.throws(()=>db.sqlite.prepare('DELETE FROM gcx_book6_workpapers').run(),/cannot be deleted/);
 }finally{db.sqlite.close();}
});
