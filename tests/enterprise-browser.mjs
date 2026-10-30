import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {createRequire} from 'node:module';
import worker from '../src/worker.js';
import {enterpriseDb} from './support/enterprise-db.mjs';
const require=createRequire(import.meta.url);
let playwright;try{playwright=await import('playwright');}catch{playwright=await import(require.resolve('playwright',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES].filter(Boolean)}));}
playwright=playwright.default||playwright;
const db=enterpriseDb(),now=new Date().toISOString(),root=resolve(import.meta.dirname,'../dist');
db.sqlite.prepare('INSERT INTO gcx_institutions VALUES(?,?,?,?,?,?)').run('uat-only','SYNTHETIC UAT Bank','BUS','IDR',1,now);
for(const [s,r] of [['factor-maker','climate_model_analyst'],['maker','data_maker'],['checker','checker'],['approver','approver'],['viewer','executive_viewer'],['risk-maker','risk_analyst']])db.sqlite.prepare('INSERT INTO gcx_memberships VALUES(?,?,?,?,?)').run('uat-only',s,s+'@uat.invalid',r,1);
const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);jwk.kid='browser-uat';
const nativeFetch=globalThis.fetch;globalThis.fetch=(u,o)=>String(u)==='https://browser-uat.cloudflareaccess.com/cdn-cgi/access/certs'?Promise.resolve(new Response(JSON.stringify({keys:[jwk]}))):nativeFetch(u,o);
async function jwt(subject){const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),seconds=Math.floor(Date.now()/1000),h=b64({alg:'RS256',kid:jwk.kid}),p=b64({sub:subject,email:subject+'@uat.invalid',iss:'https://browser-uat.cloudflareaccess.com',aud:['browser-uat-aud'],iat:seconds,exp:seconds+600});const s=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(h+'.'+p));return h+'.'+p+'.'+Buffer.from(s).toString('base64url');}
const env={GC_ENTERPRISE_ENABLED:'true',GC_ENTERPRISE_ACCESS_DOMAIN:'browser-uat.cloudflareaccess.com',GC_ENTERPRISE_ACCESS_AUD:'browser-uat-aud',ENTERPRISE_DB:db,ASSETS:{async fetch(req){
 const path=new URL(req.url).pathname;const assetPath=path.endsWith('/')?path+'index.html':path;const file=resolve(root,'.'+assetPath);if(!file.startsWith(root+'/'))return new Response('',{status:404});try{const bytes=await readFile(file);return new Response(bytes,{headers:{'content-type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[extname(file)]||'application/octet-stream'}});}catch{return new Response('Not found',{status:404});}
}}};
const server=createServer(async(req,res)=>{try{let chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);const url='http://127.0.0.1:'+server.address().port+req.url;const out=await worker.fetch(new Request(url,{method:req.method,headers:req.headers,...(body.length?{body}:{} )}),env);res.writeHead(out.status,Object.fromEntries(out.headers));res.end(Buffer.from(await out.arrayBuffer()));}catch{res.writeHead(500);res.end('Test harness failure');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await playwright.chromium.launch({headless:true}),errors=[];
async function pageFor(subject,width=1366){const context=await browser.newContext({viewport:{width,height:900},extraHTTPHeaders:{'Cf-Access-Jwt-Assertion':await jwt(subject)}});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/enterprise/');await page.locator('#workspace').waitFor({state:'visible'});await page.locator('#notice').filter({hasText:'Status penerimaan regulasi'}).waitFor();return {context,page};}
const clickMenu=async(page,view)=>{if(!(await page.locator('#sidebar').isVisible()))await page.locator('#menuToggle').click();await page.locator('[data-view="'+view+'"]').click();if(view==='manual')await page.getByRole('heading',{name:'Alur penggunaan foundation'}).waitFor();else await page.locator('#notice').filter({hasText:'Record institusi'}).waitFor();};
try{
 const {page:fm}=await pageFor('factor-maker');await clickMenu(fm,'factor');await fm.getByRole('button',{name:'Tambah draf'}).click();
 const values={title:'SYNTHETIC UAT factor',value:'0.85',activityUnit:'kWh',sourceUrl:'https://uat.invalid/factor',sourceDocument:'SYNTHETIC UAT no OJK claim',page:'1',methodology:'Synthetic browser vector',geography:'UAT',effectiveFrom:'2026-01-01',effectiveTo:'2026-12-31',version:'synthetic-v1',gwpBasis:'CO2e synthetic'};
 for(const [k,v] of Object.entries(values))await fm.locator('[name="'+k+'"]').fill(v);
 await fm.getByRole('button',{name:'Simpan draf',exact:true}).click();await fm.locator('td').filter({hasText:'SYNTHETIC UAT factor'}).waitFor();await fm.getByRole('button',{name:'Ajukan',exact:true}).click();await fm.locator('td').filter({hasText:/^submitted$/}).waitFor();
 const {page:checker}=await pageFor('checker');await clickMenu(checker,'factor');await checker.getByRole('button',{name:'Periksa',exact:true}).click();await checker.locator('td').filter({hasText:/^checked$/}).waitFor();
 const {page:approver}=await pageFor('approver');approver.on('dialog',d=>d.accept());await clickMenu(approver,'factor');await approver.getByRole('button',{name:'Setujui',exact:true}).click();await approver.locator('td').filter({hasText:/^approved$/}).waitFor();
 // Domain UI smoke: scenario metadata, approved reference suggestions, and physical screening.
 const {page:climate}=await pageFor('factor-maker');await clickMenu(climate,'scenario');await climate.getByRole('button',{name:'Tambah draf'}).click();
 for(const [k,v] of Object.entries({title:'SYNTHETIC scenario',scenarioName:'Synthetic UAT',vintage:'synthetic-2026',pathway:'No real NGFS figures',horizonYear:'2035',sourceUrl:'https://uat.invalid/scenario',sourceVersion:'synthetic-v1',assumptions:'Synthetic input, not bank validated',limitations:'No financial calculation'}))await climate.locator('[name="'+k+'"]').fill(v);
 await climate.getByRole('button',{name:'Simpan draf',exact:true}).click();await climate.getByText('SYNTHETIC scenario',{exact:true}).waitFor();
 await climate.getByRole('button',{name:'Ajukan',exact:true}).click();await clickMenu(checker,'scenario');await checker.getByRole('button',{name:'Periksa',exact:true}).click();
 await clickMenu(approver,'scenario');await approver.getByRole('button',{name:'Setujui',exact:true}).click();
 const scenarioId=db.sqlite.prepare("SELECT id FROM gcx_domain_records WHERE kind='scenario'").get().id;
 const {page:portfolioMaker}=await pageFor('maker');await clickMenu(portfolioMaker,'portfolio');await portfolioMaker.getByRole('button',{name:'Tambah draf'}).click();
 for(const [k,v] of Object.entries({title:'SYNTHETIC exposure',facilityRef:'UAT-ANON-F1',obligorRef:'UAT-ANON-D1',sector:'UAT financial sector',region:'UAT region',currency:'IDR',ead:'100000',outstanding:'90000',asOf:'2026-09-30',maturityDate:'2029-12-31',evidence:'Synthetic only'}))await portfolioMaker.locator('[name="'+k+'"]').fill(v);
 await portfolioMaker.getByRole('button',{name:'Simpan draf',exact:true}).click();await portfolioMaker.getByText('SYNTHETIC exposure',{exact:true}).waitFor();
 await portfolioMaker.getByRole('button',{name:'Ajukan',exact:true}).click();await clickMenu(checker,'portfolio');await checker.getByRole('button',{name:'Periksa',exact:true}).click();
 await clickMenu(approver,'portfolio');await approver.getByRole('button',{name:'Setujui',exact:true}).click();
 const portfolioId=db.sqlite.prepare("SELECT id FROM gcx_domain_records WHERE kind='portfolio'").get().id;
 const {page:screen}=await pageFor('risk-maker');await clickMenu(screen,'physical');await screen.getByRole('button',{name:'Tambah draf'}).click();
 for(const [k,v] of Object.entries({title:'SYNTHETIC flood screening',portfolioId,scenarioId,hazardSource:'Synthetic hazards',hazardLevel:'3',vulnerabilityLevel:'2',mitigation:'Synthetic plan',evidence:'Synthetic evidence'}))await screen.locator('[name="'+k+'"]').fill(v);
 await screen.getByRole('button',{name:'Simpan draf',exact:true}).click();await screen.getByText('SYNTHETIC flood screening',{exact:true}).waitFor();
 assert.equal(db.sqlite.prepare("SELECT json_extract(payload,'$.screenScore') AS score FROM gcx_domain_records WHERE kind='physical'").get().score,6);
 const factorId=db.sqlite.prepare("SELECT id FROM gcx_records WHERE kind='factor'").get().id;
 const {page:maker}=await pageFor('maker');await clickMenu(maker,'emission');await maker.getByRole('button',{name:'Tambah draf'}).click();
 for(const [k,v] of Object.entries({title:'SYNTHETIC UAT electricity',quantity:'1000',activityUnit:'kWh',activityDate:'2026-06-30',factorId,evidence:'SYNTHETIC UAT meter',branch:'UAT branch'}))await maker.locator('[name="'+k+'"]').fill(v);await maker.locator('[name="scope"]').selectOption('scope2');await maker.getByRole('button',{name:'Simpan draf',exact:true}).click();await maker.getByText('0.85 tCO₂e',{exact:true}).waitFor();
 await maker.reload();await maker.locator('#workspace').waitFor({state:'visible'});await clickMenu(maker,'emission');await maker.getByText('0.85 tCO₂e',{exact:true}).waitFor();await maker.getByRole('button',{name:'Ajukan',exact:true}).click();await maker.locator('td').filter({hasText:/^submitted$/}).waitFor();
 await clickMenu(checker,'emission');await checker.getByRole('button',{name:'Periksa',exact:true}).click();await checker.locator('td').filter({hasText:/^checked$/}).waitFor();await clickMenu(approver,'emission');await approver.getByRole('button',{name:'Setujui',exact:true}).click();await approver.locator('td').filter({hasText:/^approved$/}).waitFor();
 const downloadPromise=approver.waitForEvent('download');await approver.getByRole('button',{name:'Ekspor bukti',exact:true}).click();const download=await downloadPromise;assert.match(download.suggestedFilename(),/^GreenCal_Evidence_/);
 await approver.getByRole('button',{name:'Rincian',exact:true}).click();await approver.locator('#detailDialog').waitFor({state:'visible'});assert.equal(await approver.locator('.history').count(),4);await approver.locator('#closeDetail').click();await approver.screenshot({path:'/tmp/greencal-enterprise-desktop.png',fullPage:true});
 for(const width of [360,390,414]){
  const {context,page}=await pageFor('maker',width);assert.ok(await page.locator('#logout').isVisible());await clickMenu(page,'emission');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await page.getByRole('button',{name:'Tambah draf'}).click();await page.locator('[name="quantity"]').fill('0');if(width===390)await page.screenshot({path:'/tmp/greencal-enterprise-mobile.png',fullPage:true});assert.ok(await page.locator('#recordForm [type="submit"]').isVisible());assert.ok(await page.locator('#recordDialog').evaluate(e=>e.scrollWidth<=e.clientWidth));await page.locator('#closeDialog').click();await clickMenu(page,'manual');await page.getByRole('heading',{name:'Alur penggunaan foundation'}).waitFor();await context.close();
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'PASS',flow:'factor draft → submit → check → approve; emission → server calculation → reload → check → approve → download → history',viewports:[1366,360,390,414],database:'real SQLite exact migration',identity:'signed synthetic JWT + local JWKS; real bank SSO NOT TESTED',screens:'factor and emission workflow; overview and user guide navigation',consoleErrors:errors},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));db.sqlite.close();globalThis.fetch=nativeFetch;}
