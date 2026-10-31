import test from 'node:test';
import assert from 'node:assert/strict';
import {bankOidcConfig,verifyBankOidcIdentity} from '../src/vercel/oidc.js';
import {verifyEnterpriseIdentity} from '../src/enterprise/identity.js';
import {parsePublicAiOrder,vercelPublicAiEnvironment} from '../src/vercel/public-ai.js';
import {publicDatabaseIsolation,getPublicPostgres} from '../src/vercel/postgres.js';
import {handler} from '../api/bridge.js';

const env={GC_ENTERPRISE_IDENTITY_MODE:'oidc',
 GC_ENTERPRISE_OIDC_ISSUER:'https://sso.bank.example/realms/greencal',
 GC_ENTERPRISE_OIDC_JWKS_URL:'https://sso.bank.example/realms/greencal/protocol/openid-connect/certs',
 GC_ENTERPRISE_OIDC_AUD:'greencal-bank-client'};
const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
async function token(key,kid,claims={}){
 const now=Math.floor(Date.now()/1000),header=b64({alg:'RS256',kid});
 const payload=b64({iss:env.GC_ENTERPRISE_OIDC_ISSUER,aud:env.GC_ENTERPRISE_OIDC_AUD,
  sub:'bank-staff-123',email:'STAFF@BANK.EXAMPLE',email_verified:true,exp:now+300,iat:now,...claims});
 const data=header+'.'+payload;
 const signed=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key.privateKey,new TextEncoder().encode(data));
 return data+'.'+Buffer.from(signed).toString('base64url');
}
test('bank OIDC identity verifies signed JWT and never trusts user-provided role',async()=>{
 const key=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,
  publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const kid='reviewed-bank-key',jwk=await crypto.subtle.exportKey('jwk',key.publicKey);jwk.kid=kid;
 const original=globalThis.fetch;
 globalThis.fetch=async(url,opts)=>{
  assert.equal(url,env.GC_ENTERPRISE_OIDC_JWKS_URL);
  assert.equal(opts.redirect,'error');
  return new Response(JSON.stringify({keys:[jwk]}),{headers:{'Content-Type':'application/json'}});
 };
 try{
  const make=t=>new Request('https://greencal.example/api/enterprise/session',{headers:{Authorization:'Bearer '+t}});
  const valid=await verifyEnterpriseIdentity(make(await token(key,kid,{role:'super_administrator'})),env);
  assert.deepEqual(valid,{subject:'bank-staff-123',email:'staff@bank.example'});
  assert.equal(Object.hasOwn(valid,'role'),false);
  const now=Math.floor(Date.now()/1000);
  for(const claim of [{email_verified:false},{aud:'foreign-app'},{iss:'https://other.example'},
    {exp:now-1},{iat:now+100},{nbf:now+100},{sub:''}]){
   const forged=await token(key,kid,claim);
   await assert.rejects(()=>verifyEnterpriseIdentity(make(forged),env),e=>e.status===401);
  }
  const altered=(await token(key,kid)).slice(0,-8)+'AAAAAAAA';
  await assert.rejects(()=>verifyEnterpriseIdentity(make(altered),env),e=>e.status===401);
 }finally{globalThis.fetch=original;}
});
test('OIDC URL and audience are pinned to same approved HTTPS issuer',()=>{
 assert.ok(bankOidcConfig(env));
 for(const overrides of [
  {GC_ENTERPRISE_OIDC_ISSUER:'http://sso.bank.example/realms/greencal'},
  {GC_ENTERPRISE_OIDC_JWKS_URL:'https://attacker.invalid/certs'},
  {GC_ENTERPRISE_OIDC_JWKS_URL:'http://sso.bank.example/certs'},
  {GC_ENTERPRISE_OIDC_JWKS_URL:'https://127.0.0.1/certs'},
  {GC_ENTERPRISE_OIDC_AUD:''}
 ])assert.equal(bankOidcConfig({...env,...overrides}),null);
});
test('public AI config replaces KV safely, never accepts encrypted credentials in JSON',async()=>{
 assert.equal(parsePublicAiOrder('invalid'),false);
 assert.equal(parsePublicAiOrder(JSON.stringify([{provider:'openai',model:'test',enabled:true},
  {provider:'openai',model:'test',enabled:true}])),false);
 assert.equal(parsePublicAiOrder(JSON.stringify([{provider:'openai',model:'valid/one',enabled:true,
  sealedKey:'EVIL'}]))?.[0]?.sealedKey,undefined);
 const c=vercelPublicAiEnvironment({GREENCAL_PUBLIC_AI_ENABLED:'true',
  GREENCAL_AI_ORDER_JSON:'bad',
  AI_KEY_OPENAI:'test_secret_super_long'},null);
 assert.equal(c.GREENCAL_PUBLIC_AI_ENABLED,'false');
 assert.equal(JSON.stringify(await c.AI_CONFIG.get('ai_chain_v1',{type:'json'})),'null');
});
test('public AI database cannot alias institution database or use invalid URLs',async()=>{
 assert.equal(publicDatabaseIsolation(undefined,'postgres://user:pw@host/db'),false);
 assert.equal(publicDatabaseIsolation('postgres://u@host/production','postgres://v@host/production'),false);
 assert.equal(publicDatabaseIsolation('postgres://u@host/public','postgres://v@host/bank'),true);
 assert.equal(publicDatabaseIsolation('sqlite:///public',null),false);
 assert.equal(await getPublicPostgres(),null);
});
function res(){const r={code:0,data:null,headers:{}};r.setHeader=(k,v)=>(r.headers[k]=v,r);
 r.status=v=>(r.code=v,r);r.json=v=>(r.data=v,r);r.send=v=>(r.data=v,r);return r;}
test('native public AI still refuses to analyze without authorized configuration',async()=>{
 const out=res();
 await handler({query:{path:'ai/analyze'},method:'POST',headers:{
  host:'greencal.example',origin:'https://greencal.example','content-type':'application/json'},
  body:{year:2026,total:1,financed:1}},out);
 assert.equal(out.code,403);
 const parsed=typeof out.data==='string'?JSON.parse(out.data):out.data;
 assert.equal(parsed.code,'AI_PUBLIC_DISABLED');
});
