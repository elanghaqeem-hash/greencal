import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
class Element {
 constructor(tag){this.tagName=tag;this.children=[];this.value='';this.type='';this.checked=false;this.disabled=false;this.textContent='';}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=[...nodes];}
 setAttribute(name,value){this[name]=value;}
 remove(){this.removed=true;}
 querySelector(tag){return nodes(this).find(x=>x.tagName===tag)||null;}
}
const nodes=el=>[el,...(el.children||[]).flatMap(nodes)];
function runtime(){
 const window={},document={createElement:t=>new Element(t),body:new Element('body')};
 for(const src of ['assets/enterprise-formkit.js','assets/enterprise-analytics.js','assets/enterprise-book3.js','assets/enterprise-release.js','assets/enterprise-book6.js','assets/enterprise-input.js'])
  vm.runInNewContext(read(src),{window,document},{filename:src});
 return {window,document};
}
const runtimeCache=runtime(),kit=runtimeCache.window.GreenCalFormKit;

test('analytics catalog exposes complete structured fields for all twenty-five+ workflows',()=>{
 const specs=runtimeCache.window.GreenCalAnalytics.specs;
 assert.ok(Object.keys(specs).length>=24);
 for(const [name,config] of Object.entries(specs)){
  const fields=kit.forAnalytics(name,config.fields);
  assert.deepEqual(fields.map(x=>x.name),config.fields,name+' fields differ from API contract');
  assert.ok(fields.every(x=>x.label&&x.type),name+' missing label or control');
 }
 for(const key of ['portfolio_import','ngfs_interpolation','lifetime_ecl','source_manifest','book7_ckpn','book7_liquidity'])
  assert.ok(kit.forAnalytics(key,specs[key].fields).some(x=>x.type==='array'),key);
});

test('Buku 3 method schemas include nested debtor and Scope 1–3 fields',()=>{
 const examples=runtimeCache.window.GreenCalBook3.templates;
 assert.deepEqual(Object.keys(examples),['debtor','financed','carbon_cost','activity','gas_activity']);
 for(const [name,example] of Object.entries(examples)){
  const schema=kit.forExample(example,name);
  assert.deepEqual(schema.map(x=>x.name),Object.keys(example));
 }
 const financed=kit.forExample(examples.financed,'financed');
 assert.ok(financed.find(x=>x.name==='debtor').fields.some(x=>x.name==='emissions'));
});

test('empty fields cannot generate valid payload; values never prefill live inputs',()=>{
 const host=new Element('div');
 const controller=kit.mount(host,[kit.field('sourceSha256','Hash','hash'),kit.field('year','Tahun','integer')]);
 assert.throws(()=>controller.getValue(),/wajib diisi/);
 const controls=nodes(host).filter(x=>x.tagName==='input');
 assert.ok(controls.every(x=>x.value===''));
 const source=read('assets/enterprise-formkit.js');
 assert.doesNotMatch(source,/\b(localStorage|sessionStorage|indexedDB)\b|\.innerHTML\s*=/);
});

test('financial decimals remain strings; ECL stage is numeric and repeatable periods are typed',()=>{
 const schema=kit.forAnalytics('lifetime_ecl',['facilityRef','stage','currency','eir','sourceSha256','modelApprovalReference','scenarios']);
 const values={facilityRef:'SIM-001',stage:2,currency:'IDR',eir:'0.075',sourceSha256:'a'.repeat(64),modelApprovalReference:'SIMULASI validation',
  scenarios:[{key:'SIM-NZ',weight:'1',periods:[{year:1,conditionalPD:'0.02',lgd:'0.4',ead:'1000000000'}]}]};
 const host=new Element('div'),controller=kit.mount(host,schema,{values});
 const actual=controller.getValue();
 assert.equal(actual.stage,2);assert.equal(actual.eir,'0.075');
 assert.equal(actual.scenarios[0].periods[0].year,1);
 assert.equal(actual.scenarios[0].periods[0].conditionalPD,'0.02');
 assert.equal(actual.scenarios[0].periods[0].ead,'1000000000');
});

test('PCAF exposure input supports nested emissions and OJK tier without silent defaults',()=>{
 const schema=kit.forAnalytics('portfolio_import',['asOf','currency','sourceSha256','sourceSystem','glControlTotal','glControlCount','controlReference','exposures']);
 const payload={asOf:'2026-09-30',currency:'IDR',sourceSha256:'b'.repeat(64),sourceSystem:'SIM CBS',glControlTotal:'70000000',glControlCount:1,controlReference:'SIM GL',
  exposures:[{facilityRef:'FAC-1',obligorRef:'OBL-1',assetClass:'business_loans',asOf:'2026-09-30',currency:'IDR',
   outstanding:'70000000',attributionDenominator:'200000000',denominatorCurrency:'IDR',denominatorBasis:'total_equity_and_debt',
   emissions:{scope1:'123.45',scope2:'0',scope3:null},dataQualityScore:2,ojkTier:2,
   emissionSourceMethod:'borrower_report',emissionSourceVintage:'2025',evidenceReference:'SIM only'}]};
 const result=kit.mount(new Element('div'),schema,{values:payload}).getValue();
 assert.equal(result.exposures[0].emissions.scope3,null);
 assert.equal(result.exposures[0].emissions.scope2,'0');
 assert.equal(result.exposures[0].ojkTier,2);
 assert.equal(result.glControlCount,1);
});

test('Book 7 annex conditional dimensions are optional and allow source-specific buckets',()=>{
 const spec=runtimeCache.window.GreenCalAnalytics.specs.book7_annex_lookup;
 const schema=kit.forAnalytics('book7_annex_lookup',spec.fields);
 assert.equal(schema.find(x=>x.name==='sector').optional,true);
 assert.equal(schema.find(x=>x.name==='locationRisk').optional,true);
 assert.equal(schema.find(x=>x.name==='year').type,'integer');
});

test('release, book 6 and preview remain server protected and declare no OJK approval',()=>{
 const release=read('assets/enterprise-release.js'),book6=read('assets/enterprise-book6.js');
 assert.match(release,/window.GreenCalFormKit/);assert.doesNotMatch(release,/JSON\.parse\(textarea\.value\)/);
 assert.match(book6,/bondSchema=\[bondKit\.array/);assert.match(book6,/bondEditor\.getValue\(\)\.bonds/);
 const preview=read('assets/enterprise-input.js');
 assert.match(preview,/renderSpecialPreview/);assert.match(preview,/simulationOnly:true,persisted:false/);
 assert.match(preview,/regulatorySubmission:false/);
});

test('Vercel build publishes FormKit scripts before engine modules',()=>{
 const html=read('enterprise.html'),build=read('scripts/build-dist.mjs');
 for(const asset of ['assets/enterprise-formkit.js','assets/enterprise-formkit.css']){
  assert.ok(html.includes('/'+asset));assert.ok(build.includes('"'+asset+'"'));
 }
 assert.ok(html.indexOf('/assets/enterprise-formkit.js')<html.indexOf('/assets/enterprise-analytics.js'));
});
