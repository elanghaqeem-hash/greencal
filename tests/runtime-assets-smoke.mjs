// Real Workers static-asset service: catches canonical redirects missed by file mocks.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
const require=createRequire(import.meta.url),root=resolve(import.meta.dirname,'..');
const remote=process.env.GREENCAL_SMOKE_BASE_URL;
let child,output='',base=remote;
try{
 if(!remote){
  const entry=process.env.GREENCAL_WRANGLER_CLI||resolve(dirname(require.resolve('wrangler')),'../bin/wrangler.js');
  child=spawn(process.execPath,[entry,'dev','--local','--ip','127.0.0.1','--port','8789','--inspector-ip','127.0.0.1','--inspector-port','9249','--show-interactive-dev-session=false'],{cwd:root,env:{...process.env,WRANGLER_SEND_METRICS:'false'},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);
  const started=Date.now();while(!output.includes('Ready on')){
   if(child.exitCode!==null)throw Error(output.slice(-2000));if(Date.now()-started>90000)throw Error('Worker runtime startup timeout: '+output.slice(-2000));
   await new Promise(r=>setTimeout(r,200));
  }
  base='http://127.0.0.1:8789';
 }
 for(const [path,file] of [['/','index.html'],['/enterprise/','enterprise/index.html'],['/auth-client.js','auth-client.js'],['/assets/enterprise.js','assets/enterprise.js'],['/assets/enterprise.css','assets/enterprise.css'],['/assets/guide-learning.js','assets/guide-learning.js']]){
  const response=await fetch(base+path,{redirect:'manual',signal:AbortSignal.timeout(20000)});assert.equal(response.status,200,path+' must not redirect or fail');
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');assert.equal(hash(Buffer.from(await response.arrayBuffer())),hash(await readFile(resolve(root,'dist',file))),path+' must match deploy artifact');
  if(path==='/enterprise/'){assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(response.headers.get('cache-control'),'no-store');}
 }
 const direct=await fetch(base+'/enterprise/index.html',{redirect:'manual'});assert.ok([301,307,308].includes(direct.status));assert.equal(direct.headers.get('location'),'/enterprise/');
 const api=await fetch(base+'/api/enterprise/session');assert.equal(api.status,503);assert.equal((await api.json()).code,'ENTERPRISE_NOT_ENABLED');
 const unauthorized=await fetch(base+'/api/state');assert.ok([401,403,503].includes(unauthorized.status));
 console.log('PASS: '+(remote?'production':'Workers runtime')+' canonical enterprise route, exact asset hashes, security headers, disabled enterprise and denied legacy state.');
}finally{if(child){child.kill('SIGINT');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(()=>{child.kill('SIGKILL');resolve();},4000).unref();});}}
