import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const script=read('assets/enterprise-input.js');
const app=read('assets/enterprise.js');
const html=read('enterprise.html');
const builder=read('scripts/build-dist.mjs');
class Elem {
 constructor(tag){this.tagName=tag;this.children=[];this.attrs={};this.value='';this.hidden=false;}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=[...nodes];}
 setAttribute(k,v){this.attrs[k]=v;}
}
const doc={createElement:tag=>new Elem(tag),body:new Elem('body')};
const sandbox={window:{},document:doc};
vm.runInNewContext(script,sandbox,{filename:'enterprise-input.js'});
const centre=sandbox.window.GreenCalInput;
const schema={
 risk:{category:['Jenis','select',['physical','transition']],likelihood:['Likelihood','number'],severity:['Severity','number'],owner:['Owner']},
 portfolio:{facilityRef:['Kode fasilitas'],ead:['EAD'],asOf:['Posisi','date']},
 scenario:{framework:['Framework','select',['NGFS']],horizonYear:['Tahun','number']},
 governance:{owner:['Pemilik']},requirement:{chapter:['Bab']},
 factor:{value:['Faktor'],sourceUrl:['URL','url']},emission:{quantity:['Aktivitas']},
 physical:{hazard:['Bahaya']},transition:{driver:['Pemicu']},
 report_package:{periodStart:['Dari','date']},
 regulatory_document:{book:['Buku','number']}
};
const labels=Object.fromEntries(Object.keys(schema).map(k=>[k,k.toUpperCase()]));
function walk(n){return [n,...(n.children||[]).flatMap(walk)];}

test('all seven OJK books and eleven secured record domains are discoverable',()=>{
 assert.equal(centre.catalog.length,7);
 assert.deepEqual([...new Set(centre.catalog.flatMap(x=>x.records))].sort(),Object.keys(schema).sort());
 assert.equal(centre.advanced.length,7);
});

test('unconfigured Vercel workspace shows simulation form without persistent bank writes',()=>{
 const root=new Elem('section');
 centre.render(root,{schema,labels,mode:'preview',initial:'risk'});
 const nodes=walk(root);
 assert.ok(nodes.some(n=>n.tagName==='form'));
 assert.ok(nodes.some(n=>n.name==='likelihood'));
 assert.ok(nodes.some(n=>n.name==='severity'));
 assert.ok(nodes.some(n=>n.textContent?.includes('Bank Sawan')));
 assert.doesNotMatch(script,/\b(?:localStorage|sessionStorage|indexedDB)\b|fetch\s*\(/);
 const inputs=nodes.filter(n=>n.tagName==='input');
 assert.ok(inputs.some(n=>n.name==='likelihood'&&n.min==='1'&&n.max==='5'));
 assert.ok(inputs.some(n=>n.name==='title'&&n.required));
});

test('authenticated form launcher forwards to secured existing record and specialized modules',async()=>{
 const root=new Elem('section'),kinds=[],special=[];
 centre.render(root,{schema,labels,mode:'live',initial:'risk',
  canCreate:k=>k==='risk',onOpenRecord:k=>kinds.push(k),onNavigate:k=>special.push(k)});
 const buttons=walk(root).filter(n=>n.tagName==='button');
 assert.ok(buttons.some(n=>n.textContent==='Buka form dan tambah draf'&&!n.disabled));
 assert.ok(buttons.some(n=>n.textContent==='Buka modul'));
 await buttons.find(n=>n.textContent==='Buka form dan tambah draf').onclick();
 await buttons.find(n=>n.textContent==='Buka modul').onclick();
 assert.deepEqual(kinds,['risk']);
 assert.deepEqual(special,['discovery']);
});

test('HTML, enterprise fallback and Vercel build ship the same form assets',()=>{
 assert.match(html,/data-view="input"/);
 assert.match(html,/id="preview" hidden/);
 for(const path of ['assets/enterprise-input.js','assets/enterprise-input.css']){
  assert.ok(html.includes('/'+path));
  assert.ok(builder.includes('"'+path+'"'));
 }
 assert.match(app,/renderPreview\(view\)/);
 assert.match(app,/mode:'live'/);
 assert.match(app,/mode:'preview'/);
 assert.match(app,/if\(!session\)\{renderPreview\(view\)/);
});
