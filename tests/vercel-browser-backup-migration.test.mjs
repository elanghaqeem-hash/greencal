import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const raw=readFileSync(new URL('../auth-client.js',import.meta.url),'utf8');
const marker='  function installPublicBackupImport(){';
assert.ok(raw.includes(marker));
const sandbox={window:{addEventListener(){}},document:{},console};
vm.runInNewContext(raw.replace(marker,
  '  window.__backupValidator=normalizePublicBackup;\\n'+marker).replace('\\n'+marker,'\n'+marker),sandbox);
const normalize=(obj)=>vm.runInNewContext(
 'window.__backupValidator(JSON.parse('+JSON.stringify(JSON.stringify(obj))+'))',sandbox);
const normalizeJson=(json)=>vm.runInNewContext(
 'window.__backupValidator(JSON.parse('+JSON.stringify(json)+'))',sandbox);

test('Cloudflare browser backup import preserves only public activity and narrative fields',()=>{
 const input={entries:[{id:'a1',year:2026,quantity:10}],exposures:[{id:'f1',value:500}],
  offsets:[],narrativeDrafts:{'2026':'Synthetic public draft'},
  settings:{apiKey:'FORBIDDEN',orgName:'bank'},users:[{role:'admin'}],audit:[{sensitive:'x'}]};
 const result=normalize(input);
 assert.equal(result.entries.length,1);
 assert.equal(result.exposures.length,1);
 assert.equal(result.narrativeDrafts['2026'],'Synthetic public draft');
 for(const key of ['settings','users','audit','apiKey'])assert.equal(Object.hasOwn(result,key),false);
 assert.equal(typeof result.updatedAt,'string');
});
test('import rejects unexpected record type and prototype poison, never changes privilege settings',()=>{
 for(const value of [
  {entries:'not_array'},
  {entries:[null]},
  {entries:[{id:'a',constructor:'danger'}]},
  {settings:{users:['admin']}},
  {entries:[1]},
  []
 ])assert.throws(()=>normalize(value));
 // JSON (unlike JavaScript object literals) retains the own "__proto__" key.
 assert.throws(()=>normalizeJson('{"entries":[{"nested":{"__proto__":{"polluted":true}}}]}'));
});
test('file must fit bounded local storage and exclude secret-bearing admin state',()=>{
 const obj={entries:[{id:'test',notes:'x'.repeat(1900100)}]};
 assert.throws(()=>normalize(obj));
 assert.match(raw,/file\.size>1900000/);
 assert.match(raw,/scopeReady\|\|!scopedStore/);
 assert.match(raw,/window\.confirm/);
 assert.match(raw,/localStorage\.setItem\(scopedStore,JSON\.stringify\(parsed\)\)/);
 assert.doesNotMatch(raw,/fetch\(.*file\.text/);
});
