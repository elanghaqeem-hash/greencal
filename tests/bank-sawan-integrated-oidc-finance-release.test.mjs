import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign as rsaSign} from 'node:crypto';
import {enterpriseDb} from './support/enterprise-db.mjs';
import {handleEnterpriseApi} from '../src/enterprise/api.js';
import {convertCsvToBatches} from '../scripts/portfolio-cbs-adapter.mjs';
import {reconcileCkpn} from '../scripts/ckpn-reconciliation.mjs';
import {lifetimeCreditEcl} from '../src/enterprise/quant-v2.js';
import {evaluateOjk2026} from '../src/enterprise/ojk-readiness.js';

const TENANT='bank-sawan-demo',FOREIGN='bank-foreign-demo',AS_OF='2026-09-30';
const ISSUER='https://idp-sawan.synthetic.example',JWKS=ISSUER+'/jwks',AUD='greencal-sawan-sim';
const SHA=x=>createHash('sha256').update(x).digest('hex');
const PEOPLE=Object.freeze([
 ['sawan-pm','crms_project_administrator'],['sawan-admin','institution_administrator'],
 ['sawan-maker','data_maker'],['sawan-risk','risk_management_head'],
 ['sawan-finance','approver'],['sawan-compliance','compliance_reviewer'],
 ['sawan-it','institution_administrator'],['sawan-validator','internal_auditor'],
 ['sawan-model','climate_model_analyst'],['sawan-viewer','executive_viewer']
]);
const GL={asOf:AS_OF,currency:'IDR',sourceSystem:'SAWAN_SYNTHETIC_CBS',glControlTotal:'300',glControlCount:2,controlReference:'SIMULASI-SAWAN-GL-20260930'};
const CSV=[
 'facilityRef,obligorRef,assetClass,currency,asOf,outstanding,attributionDenominator,denominatorCurrency,denominatorBasis,scope1,scope2,scope3,dataQualityScore,evidenceReference,emissionSourceVintage',
 'SAWAN-FAC-01,SAWAN-OBL-01,business_loans,IDR,2026-09-30,100,500,IDR,total_equity_and_debt,60,20,,3,SYNTHETIC-SOURCE-01,2025',
 'SAWAN-FAC-02,SAWAN-OBL-02,business_loans,IDR,2026-09-30,200,1000,IDR,total_equity_and_debt,100,50,,3,SYNTHETIC-SOURCE-02,2025',
 ''
].join('\n');
const CKPN=[
 'facilityRef,currency,asOf,stage,bookedCKPN',
 'SAWAN-FAC-01,IDR,2026-09-30,1,5',
 'SAWAN-FAC-02,IDR,2026-09-30,1,4',
 ''
].join('\n');
const SIGNOFF=[
 ['risk','sawan-risk'],['finance','sawan-finance'],['compliance','sawan-compliance'],
 ['it','sawan-it'],['independent_model_validation','sawan-validator']
];

function simulationDb(){
 const db=enterpriseDb(),s=db.sqlite;
 s.prepare('INSERT INTO gcx_institutions VALUES(?,?,?,?,?,?)').run(TENANT,'Bank Sawan — SIMULASI / BUKAN BANK NYATA','BUS','IDR',1,'2026-10-31');
 s.prepare('INSERT INTO gcx_institutions VALUES(?,?,?,?,?,?)').run(FOREIGN,'FOREIGN SYNTHETIC BANK','BUS','IDR',1,'2026-10-31');
 for(const [id,role] of PEOPLE)s.prepare('INSERT INTO gcx_memberships VALUES(?,?,?,?,?)').run(TENANT,id,id+'@example.invalid',role,1);
 s.prepare('INSERT INTO gcx_memberships VALUES(?,?,?,?,?)').run(FOREIGN,'foreign-only','foreign-only@example.invalid','data_maker',1);
 return db;
}
function syntheticOidc(){
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048,publicExponent:0x10001});
 const jwk={...publicKey.export({format:'jwk'}),kid:'sawan-sim-ephemeral',alg:'RS256',use:'sig',key_ops:['verify']};
 const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 function token(subject,overrides={}){
  const now=Math.floor(Date.now()/1000);
  const header=b64({alg:'RS256',typ:'JWT',kid:jwk.kid});
  const payload=b64({iss:ISSUER,aud:AUD,sub:subject,email:subject+'@example.invalid',email_verified:true,
   iat:now,exp:now+600,...overrides});
  const msg=header+'.'+payload;
  return msg+'.'+rsaSign('RSA-SHA256',Buffer.from(msg),privateKey).toString('base64url');
 }
 return {jwk,token};
}
function modelEcl(facilityRef,ead,pd,lgd){
 return lifetimeCreditEcl({stage:1,facilityRef,currency:'IDR',eir:'0',
  sourceSha256:SHA('BANK_SAWAN_SYNTHETIC_ECL_MODEL'),modelApprovalReference:'Bank Sawan SIMULASI — model QA only',
  scenarios:[{key:'sawan-sim',weight:'1',periods:[{year:1,conditionalPD:pd,lgd,ead}]}]});
}
test('Bank Sawan full integration: signed RS256 SSO, CBS/GL/CKPN, independent model arithmetic and five-role mock approvals',async()=>{
 const db=simulationDb(),oidc=syntheticOidc(),realFetch=globalThis.fetch;
 globalThis.fetch=async(u,options)=>String(u)===JWKS?
  new Response(JSON.stringify({keys:[oidc.jwk]}),{status:200,headers:{'content-type':'application/json'}}):
  realFetch(u,options);
 const env={GC_ENTERPRISE_ENABLED:'true',ENTERPRISE_DB:db,GC_ENTERPRISE_IDENTITY_MODE:'oidc',
  GC_ENTERPRISE_OIDC_ISSUER:ISSUER,GC_ENTERPRISE_OIDC_JWKS_URL:JWKS,GC_ENTERPRISE_OIDC_AUD:AUD,
  GC_ENTERPRISE_QUANT_ENABLED:'true',GC_ENTERPRISE_REQUIRE_SOURCE_MANIFEST:'true',
  GC_ENTERPRISE_RELEASE_ENABLED:'true'};
 async function api(subject,path,body,{tenant=TENANT,bearer}={}){
  const method=body===undefined?'GET':'POST',origin='https://sawan-sim.example';
  const headers={'authorization':'Bearer '+(bearer||oidc.token(subject)),
   'x-greencal-tenant':tenant};
  if(method==='POST'){headers['content-type']='application/json';headers['origin']=origin;headers['sec-fetch-site']='same-origin';}
  const req=new Request(origin+'/api/enterprise'+path,{method,headers,
   body:body===undefined?undefined:JSON.stringify(body)});
  const res=await handleEnterpriseApi(req,env);
  return {status:res.status,payload:await res.json()};
 }
 try{
  // Verify real crypto (not trusted headers), exact audience, expiry and tenant memberships.
  const logged=await api('sawan-maker','/session');
  assert.equal(logged.status,200);
  assert.deepEqual(logged.payload.tenants.map(t=>t.tenant_id),[TENANT]);
  assert.equal(logged.payload.tenants[0].role,'data_maker');
  const badAud=await api('sawan-maker','/session',undefined,{bearer:oidc.token('sawan-maker',{aud:'wrong-audience'})});
  assert.equal(badAud.status,401);
  const expired=await api('sawan-maker','/session',undefined,{bearer:oidc.token('sawan-maker',{exp:Math.floor(Date.now()/1000)-1})});
  assert.equal(expired.status,401);
  const validToken=oidc.token('sawan-maker');
  const forged=validToken.split('.');forged[1]=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(forged[1],'base64url')),sub:'sawan-admin'})).toString('base64url');
  assert.equal((await api('sawan-maker','/session',undefined,{bearer:forged.join('.')})).status,401);
  assert.equal((await api('sawan-maker','/summary',undefined,{tenant:FOREIGN})).status,403);

  // Connect to existing real server API handlers using anonymous synthetic CBS and independent GL totals.
  const converted=convertCsvToBatches(CSV,GL);
  assert.equal(converted.manifest.glControlTotal,'300');
  assert.equal(converted.manifest.glControlCount,2);
  assert.equal(converted.manifest.sourceSha256,SHA(CSV));
  const batch=converted.batches[0];
  assert.equal((await api('sawan-maker','/analytics/import',batch)).status,409); // no source manifest
  const registered=await api('sawan-maker','/analytics/sources',{
   asOf:AS_OF,currency:'IDR',sourceSystem:GL.sourceSystem,sourceSha256:SHA(CSV),
   glControlTotal:'300',glControlCount:2,controlReference:GL.controlReference
  });
  assert.equal(registered.status,201);
  assert.equal((await api('sawan-viewer','/analytics/import',batch)).status,403);
  const imported=await api('sawan-maker','/analytics/import',batch);
  assert.equal(imported.status,201);
  const source=await api('sawan-risk','/analytics/sources/'+SHA(CSV));
  assert.equal(source.status,200);assert.equal(source.payload.completed,true);
  assert.equal(source.payload.actualTotal,'300');assert.equal(source.payload.actualCount,2);
  const preview=await api('sawan-risk','/analytics/sources/'+SHA(CSV)+'/report');
  assert.equal(preview.status,200);
  assert.equal(preview.payload.totals.outstanding,'300');
  assert.equal(preview.payload.totals.financedTco2e.scope1,'32');
  assert.equal(preview.payload.totals.financedTco2e.scope2,'14');
  assert.equal(preview.payload.officialOjkSubmission,false);
  assert.equal((await api('foreign-only','/analytics/sources/'+SHA(CSV),undefined,{tenant:FOREIGN})).status,404);

  // Independent challenger algebra: stage-1 ECL = EAD*PD*LGD with EIR=0; no hidden tolerance.
  const e1=modelEcl('SAWAN-FAC-01','100','0.1','0.5');
  const e2=modelEcl('SAWAN-FAC-02','200','0.05','0.4');
  assert.equal(e1.expectedCreditLoss,'5');assert.equal(e2.expectedCreditLoss,'4');
  const independent=(100*0.1*0.5)+(200*0.05*0.4);
  assert.equal(independent,9);
  const ckpn=reconcileCkpn(CKPN,[
    {facilityRef:'SAWAN-FAC-01',stage:1,currency:'IDR',expectedCreditLoss:e1.expectedCreditLoss},
    {facilityRef:'SAWAN-FAC-02',stage:1,currency:'IDR',expectedCreditLoss:e2.expectedCreditLoss}],
    {currency:'IDR',asOf:AS_OF,rowCount:2,glCkpnControlTotal:'9',approvedTolerance:'0'});
  assert.equal(ckpn.glReconciled,true);assert.equal(ckpn.withinTolerance,true);
  assert.equal(ckpn.modelEclTotal,'9');assert.equal(ckpn.bookedCkpnTotal,'9');
  assert.equal(ckpn.postingAllowed,false);assert.equal(ckpn.regulatoryApproved,false);
  assert.throws(()=>reconcileCkpn(CKPN,[
    {facilityRef:'SAWAN-FAC-01',stage:1,currency:'IDR',expectedCreditLoss:'5'},
    {facilityRef:'SAWAN-FAC-02',stage:1,currency:'IDR',expectedCreditLoss:'4'}],
    {currency:'IDR',asOf:AS_OF,rowCount:2,glCkpnControlTotal:'10',approvedTolerance:'0'}),/do not reconcile/);

  // Five genuinely separate synthetic signed identities use immutable actual release APIs.
  const sha256=SHA('SAWAN_SIMULATION_BUILD'),evidenceSha=SHA('SAWAN_MODEL_INDEPENDENT_CHALLENGER_AND_CKPN');
  const candidate=await api('sawan-pm','/release/candidates',{commitSha:'b'.repeat(40),
   buildSha256:sha256,evidenceSha256:evidenceSha});
  assert.equal(candidate.status,201);
  const releaseId=candidate.payload.id;
  const unauthorized=await api('sawan-viewer','/release/candidates/'+releaseId+'/reviews',{
   function:'risk',outcome:'approved',evidenceSha256:evidenceSha,
   evidenceReference:'SYNTHETIC-CHECK-ROLE-CONTROL',attestation:'Bank Sawan simulation only, invalid viewer approval.'});
  assert.equal(unauthorized.status,403);
  for(const [fn,subject] of SIGNOFF){
   const assigned=await api('sawan-admin','/release/assignments',{
    function:fn,reviewerSubject:subject,
    approvedAppointmentReference:'SIMULATION-ONLY-SAWAN-'+fn+'-20261031'});
   assert.equal(assigned.status,201,fn+' appointment '+JSON.stringify(assigned.payload));
   const review=await api(subject,'/release/candidates/'+releaseId+'/reviews',{
    function:fn,outcome:'approved',evidenceSha256:evidenceSha,
    evidenceReference:'SYNTHETIC-SAWAN-INDEPENDENT-TEST-'+fn,
    attestation:'Bank Sawan synthetic reviewer: I have tested this simulation only; this is not actual bank approval or OJK validation.'});
   assert.equal(review.status,201,fn+' review '+JSON.stringify(review.payload));
  }
  const status=await api('sawan-viewer','/release/candidates/'+releaseId);
  assert.equal(status.status,200);assert.equal(status.payload.missing.length,0);
  assert.equal(status.payload.reviews.length,5);
  assert.equal(status.payload.approvalStatus,'attestations_complete_subject_to_bank_and_regulator_checks');
  assert.equal(status.payload.bankProductionReady,false);
  assert.equal(status.payload.officialOjkApproved,false);
  assert.equal((await api('foreign-only','/release/candidates/'+releaseId,undefined,{tenant:FOREIGN})).status,404);
  const gate=evaluateOjk2026({bankReleaseAuthorized:true});
  assert.equal(gate.status,'NOT_READY');assert.equal(gate.bankProductionReady,false);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM gcx_release_reviews WHERE tenant_id=?').get(TENANT).n,5);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM gcx_portfolio_positions WHERE tenant_id=?').get(TENANT).n,2);
  assert.throws(()=>db.sqlite.exec('DELETE FROM gcx_release_reviews'),/immutable review/);
 }finally{
  globalThis.fetch=realFetch;db.sqlite.close();
 }
});
