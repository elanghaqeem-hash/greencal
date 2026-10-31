import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {enterpriseDb} from './support/enterprise-db.mjs';
import {validateBankConnection,retrieveApprovedBankSource,prepareBankPackage,parseGlSource} from '../scripts/bank-secure-fetch.mjs';
import {validateGeoJsonSource,validateNgfsApprovedExtract} from '../scripts/climate-source-validation.mjs';
import {handleSourceRegistry} from '../src/enterprise/source-registry.js';
const sha=x=>createHash('sha256').update(x).digest('hex');
const bankCsv='facilityRef,obligorRef,assetClass,currency,asOf,outstanding,attributionDenominator,denominatorCurrency,denominatorBasis,scope1,scope2,scope3,dataQualityScore,evidenceReference,emissionSourceVintage\nFAC-01,OBL-01,business_loans,IDR,2026-09-30,20,100,IDR,total_equity_and_debt,100,30,,3,PROVENANCE_TEST,2025\n';
const ckpnCsv='facilityRef,currency,asOf,stage,bookedCKPN\nFAC-01,IDR,2026-09-30,1,5\n';
const geodata=JSON.stringify({type:'FeatureCollection',features:[{type:'Feature',id:'flood-001',properties:{},geometry:{type:'Polygon',coordinates:[[[106,-7],[107,-7],[107,-6],[106,-6],[106,-7]]]}}]});
const iamc='Model,Scenario,Region,Variable,Unit,2030,2040\nREMIND,Net Zero 2050,Indonesia,Price|Carbon,USD/tCO2,10,30\n';
test('strict live bank connector is TLS allowlisted and checks complete byte hash, never redirects',async()=>{
 const cfg={source:'CBS',url:'https://cbs.bank.example.id/export/approved-001',allowedHosts:['cbs.bank.example.id'],expectedSha256:sha(bankCsv),secretEnv:'BANK_CBS_SERVICE_TOKEN',approvedPurpose:'CRMS_BANK_AUTHORIZED_DATA_EXTRACTION',maxBytes:25000};
 assert.equal(validateBankConnection(cfg).source,'CBS');
 const fetchImpl=async(u,options)=>{
  assert.equal(u,cfg.url);assert.equal(options.redirect,'error');assert.equal(options.headers.authorization,'Bearer '+'x'.repeat(25));
  return new Response(bankCsv,{status:200,headers:{'content-type':'text/csv'}});
 };
 const p=await retrieveApprovedBankSource(cfg,{fetchImpl,secrets:{BANK_CBS_SERVICE_TOKEN:'x'.repeat(25)}});
 assert.equal(p.sha256,sha(bankCsv));assert.equal(p.text,bankCsv);assert.match(p.status,/pending/);
 await assert.rejects(()=>retrieveApprovedBankSource({...cfg,expectedSha256:'a'.repeat(64)},{fetchImpl,secrets:{BANK_CBS_SERVICE_TOKEN:'x'.repeat(25)}}),/hash/);
 assert.throws(()=>validateBankConnection({...cfg,url:'http://cbs.bank.example.id/export'}),/HTTPS/);
 assert.throws(()=>validateBankConnection({...cfg,allowedHosts:['evil.example']}),/allowlist/);
 assert.throws(()=>validateBankConnection({...cfg,secretEnv:'TOKEN=steal'}),/secret/);
 await assert.rejects(()=>retrieveApprovedBankSource(cfg,{fetchImpl:async()=>new Response('Moved',{status:302,headers:{location:'https://evil.invalid'}}),secrets:{BANK_CBS_SERVICE_TOKEN:'x'.repeat(25)}}),/authentic/);
});
test('CBS+GL and CKPN verified bytes reconcile, but cannot post accounting results',()=>{
 const pkg=prepareBankPackage({
  cbs:{source:'CBS',text:bankCsv,sha256:sha(bankCsv)},glControl:{asOf:'2026-09-30',currency:'IDR',sourceSystem:'CBS_BANK_UAT',glControlTotal:'20',glControlCount:1,controlReference:'GL-TEST'},ckpn:{source:'CKPN',text:ckpnCsv,sha256:sha(ckpnCsv)},
  ckpnControl:{asOf:'2026-09-30',currency:'IDR',rowCount:1,glCkpnControlTotal:'5',approvedTolerance:'0'},eclResults:[{facilityRef:'FAC-01',stage:1,currency:'IDR',expectedCreditLoss:'5'}]
 });
 assert.equal(pkg.portfolio.glControlTotal,'20');assert.equal(pkg.ckpn.totalVariance,'0');assert.equal(pkg.regulatedPostingAllowed,false);
 assert.throws(()=>prepareBankPackage({cbs:{source:'CBS',text:bankCsv,sha256:'0'.repeat(64)},glControl:{glControlTotal:'20',controlReference:'GL'},ckpn:{source:'CKPN',text:ckpnCsv,sha256:sha(ckpnCsv)}}),/source bytes changed/);
});
test('GL independently delivered signed CSV must match full bank source control; absent GL forbidden for operational path',()=>{
 const csv='asOf,currency,sourceSystem,glControlTotal,glControlCount,controlReference\\n2026-09-30,IDR,CBS_BANK_UAT,20,1,GL-TEST\\n'.replaceAll('\\n','\n');
 const gl={source:'GL',text:csv,sha256:sha(csv)};
 assert.equal(parseGlSource(gl).glControlTotal,'20');
 const pkg=prepareBankPackage({cbs:{source:'CBS',text:bankCsv,sha256:sha(bankCsv)},gl,ckpn:{source:'CKPN',text:ckpnCsv,sha256:sha(ckpnCsv)},ckpnControl:{asOf:'2026-09-30',currency:'IDR',rowCount:1,glCkpnControlTotal:'5',approvedTolerance:'0'},eclResults:[{facilityRef:'FAC-01',stage:1,currency:'IDR',expectedCreditLoss:'5'}],requireSourceGL:true});
 assert.equal(pkg.sources.GL,sha(csv));assert.equal(pkg.portfolio.glControlTotal,'20');
 assert.throws(()=>parseGlSource({...gl,text:csv.replace('20,1','21,1')}),/bytes changed/);
 assert.throws(()=>prepareBankPackage({cbs:{source:'CBS',text:bankCsv,sha256:sha(bankCsv)},ckpn:{source:'CKPN',text:ckpnCsv,sha256:sha(ckpnCsv)},requireSourceGL:true}),/independent byte-verified GL/);
});
test('official GeoJSON WGS84 and NGFS IAMC values must match whole-file SHA; no inferred approvals',()=>{
 const geo=validateGeoJsonSource(geodata,{sourceUrl:'https://gis.bnpb.go.id/server/rest/services/inarisk',expectedSha256:sha(geodata),crs:'EPSG:4326',version:'BNPB-UAT-v1',hazard:'flood',licenseReference:'SYNTHETIC UAT review no license granted'});
 assert.equal(geo.featureCount,1);assert.equal(geo.businessApproval,'not_granted');assert.equal(geo.financialLossModelApproved,false);
 assert.throws(()=>validateGeoJsonSource(geodata,{sourceUrl:'https://fake.invalid',expectedSha256:sha(geodata),crs:'EPSG:4326',version:'BNPB-UAT-v1',hazard:'flood',licenseReference:'SYNTHETIC UAT review'}),/official allowlist/);
 assert.throws(()=>validateGeoJsonSource(geodata,{sourceUrl:'https://gis.bnpb.go.id',expectedSha256:'f'.repeat(64),crs:'EPSG:4326',version:'BNPB-UAT-v1',hazard:'flood',licenseReference:'SYNTHETIC UAT review'}),/checksum/);
 const ngfs=validateNgfsApprovedExtract(iamc,{sourceUrl:'https://data.ene.iiasa.ac.at/ngfs/',expectedSha256:sha(iamc),model:'REMIND',scenario:'Net Zero 2050',region:'Indonesia',variable:'Price|Carbon',unit:'USD/tCO2',vintage:'synthetic-uat',year:2035});
 assert.equal(ngfs.series.result.value,'20');assert.equal(ngfs.modelApproval,'not_granted');
 assert.throws(()=>validateNgfsApprovedExtract(iamc,{sourceUrl:'https://phishing.invalid',expectedSha256:sha(iamc)}),/official allowlist/);
});
function fixture(){
 const db=enterpriseDb(),s=db.sqlite;
 for(const t of ['bank-a','bank-b'])s.prepare('INSERT INTO gcx_institutions VALUES(?,?,?,?,?,?)').run(t,'TEST '+t,'BUS','IDR',1,'2026-01-01');
 for(const [name,role] of [['maker','data_maker'],['checker','checker'],['model','climate_model_analyst'],['approver','approver'],['viewer','executive_viewer']])s.prepare('INSERT INTO gcx_memberships(tenant_id,subject,email,role,active) VALUES(?,?,?,?,?)').run('bank-a',name,name+'@uat.invalid',role,1);
 s.prepare('INSERT INTO gcx_memberships(tenant_id,subject,email,role,active) VALUES(?,?,?,?,?)').run('bank-b','other','other@uat.invalid','data_maker',1);
 return db;
}
const roleMap={maker:'data_maker',checker:'checker',model:'climate_model_analyst',approver:'approver',viewer:'executive_viewer',other:'data_maker'};
async function api(db,path,actor,body,tenant='bank-a',enabled=true){
 const method=body===undefined?'GET':'POST',req=new Request('https://uat.invalid/api/enterprise'+path,{method,headers:body===undefined?{}:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const r=await handleSourceRegistry(req,{GC_ENTERPRISE_SOURCE_REVIEW_ENABLED:enabled?'true':'false'},db,tenant,{subject:actor,role:roleMap[actor]},path);
 return {status:r.status,data:await r.json()};
}
test('source registry is tenant-scoped, independently reviewed, immutable and NEVER automatically bank production approved',async()=>{
 const db=fixture();try{
  const payload={sourceKind:'cbs',sourceSystem:'BANK_CBS_UAT',sourceUrl:'https://cbs.bank.example.id/approved/export',fileSha256:sha(bankCsv),verificationArtifactSha256:'a'.repeat(64),asOf:'2026-09-30',version:'BANK-v1-UAT',licenseReference:'SYNTHETIC BANK TEST EVIDENCE'};
  await assert.rejects(()=>api(db,'/source-registry','viewer',payload),e=>e.code==='SOURCE_ROLE_DENIED');
  await assert.rejects(()=>api(db,'/source-registry','maker',payload,'bank-a',false),e=>e.code==='SOURCE_REGISTRY_DISABLED');
  const created=await api(db,'/source-registry','maker',payload);assert.equal(created.status,201);
  const id=created.data.id;assert.equal((await api(db,'/source-registry/'+id,'viewer')).data.dataValidatedForBankProduction,false);
  await assert.rejects(()=>api(db,'/source-registry/'+id+'/reviews','maker',{function:'data_quality',outcome:'approved',confirmedFileSha256:payload.fileSha256,evidenceSha256:'a'.repeat(64),evidenceReference:'SYNTHETIC TEST',attestation:'I reviewed the independent source and verified the sample source bytes.'}),e=>e.code==='SOURCE_ROLE_DENIED');
  for(const [functionName,actor] of [['data_quality','checker'],['model_validation','model'],['authorization','approver']]){
   const rv=await api(db,'/source-registry/'+id+'/reviews',actor,{function:functionName,outcome:'approved',confirmedFileSha256:payload.fileSha256,evidenceSha256:'a'.repeat(64),evidenceReference:'SYNTHETIC UAT review evidence',attestation:'Independent synthetic UAT review only; no bank source approval granted.'});
   assert.equal(rv.status,201);
  }
  const detail=(await api(db,'/source-registry/'+id,'viewer')).data;
  assert.equal(detail.attestationsComplete,true);
  assert.equal(detail.dataValidatedForBankProduction,false);
  assert.equal(detail.reviews.length,3);
  await assert.rejects(()=>api(db,'/source-registry/'+id,'other',undefined,'bank-b'),e=>e.code==='SOURCE_NOT_FOUND');
  assert.throws(()=>db.sqlite.exec('DELETE FROM gcx_source_attestations'),/immutable/);
  assert.throws(()=>db.sqlite.exec("UPDATE gcx_verified_source_candidates SET status='pending_evidence_review'"),/immutable/);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM gcx_events WHERE action LIKE 'source.%'").get().n,4);
 }finally{db.sqlite.close();}
});
