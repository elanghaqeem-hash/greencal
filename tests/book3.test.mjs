import test from 'node:test';
import assert from 'node:assert/strict';
import {book3Debtor,book3Financed,book3CarbonCost,book3Activity} from '../src/enterprise/book3.js';
import {handleBook3Api} from '../src/enterprise/book3-api.js';
import {financedEmissions} from '../src/enterprise/quant.js';
const debtor=(overrides={})=>({debtorRef:'SIM-ABC',year:'2025',sourceMethod:'borrower_report',ojkTier:2,
 evidenceReference:'SIMULASI Buku 3 OJK halaman 26',sourceVersion:'2025',sourceAssuranceStatus:'unverified',
 emissions:{scope1:'885087',scope2:'23583',scope3:'686906'},...overrides});
const financed=()=>({assetClass:'business_loans',outstanding:'500000000000',attributionDenominator:'12000000000000',
 denominatorBasis:'equity_plus_debt',currency:'IDR',denominatorCurrency:'IDR',debtor:debtor()});
const carbon=()=>({debtor:debtor(),carbonPriceUnit:'IDR/tCO2e',carbonPrice:'800000',reductionFraction:'0.2',
 debtorRevenue:'8000000000000',scenarioReference:'SIMULASI Net Zero 2050',includeScope2:false});
test('OJK Tier 1–4 classification is independent of PCAF score',()=>{
 const x=book3Debtor({...debtor(),pcafDataQualityScore:5});
 assert.equal(x.debtor.ojkTier,2);assert.equal(x.pcafDataQualityScore,5);
 assert.equal(book3Debtor(debtor({sourceMethod:'activity_calculator',ojkTier:3})).debtor.ojkTier,3);
 assert.equal(book3Debtor(debtor({sourceMethod:'peer_proxy',ojkTier:4,peerSector:'pertanian',
  peerBusinessModel:'sama',scalingBasis:'aset',scalingEvidence:'referensi'})).debtor.ojkTier,4);
 assert.throws(()=>book3Debtor(debtor({sourceMethod:'peer_proxy',ojkTier:1})),/Tier/);
 assert.throws(()=>book3Debtor(debtor({sourceMethod:'activity_calculator',ojkTier:2})),/Tier/);
 assert.throws(()=>book3Debtor(debtor({pcafDataQualityScore:6})),/PCAF/);
});
test('Buku 3 illustration: full-precision proportional attribution and separated Scope 3',()=>{
 const r=book3Financed(financed());
 assert.equal(r.attributionFactor,'0.041667');
 assert.equal(r.financedTco2e.scope1,'36878.625');
 assert.equal(r.financedTco2e.scope2,'982.625');
 assert.equal(r.mainFinancedScope1And2Tco2e,'37861.25');
 assert.equal(r.supplementaryFinancedScope3Tco2e,'28621.083333');
 assert.equal(r.bankOperationalScope1And2Included,false);
 assert.equal(r.ojkTier,2);
 const missing=book3Financed({...financed(),debtor:debtor({emissions:{scope1:'885087',scope2:null,scope3:'686906'}})});
 assert.equal(missing.mainFinancedScope1And2Tco2e,null);
 assert.equal(missing.mainFigureCoverage,'incomplete_scope1_or_scope2');
 assert.throws(()=>book3Financed({...financed(),attributionDenominator:'0'}),/Denominator/);
 assert.throws(()=>book3Financed({...financed(),denominatorCurrency:'USD'}),/mata uang/i);
 assert.throws(()=>book3Financed({...financed(),assetClass:'motor_vehicle_loans'}),/kelas aset/i);
});
test('Portfolio old primitive now attributes from full denominator, not rounded 4.17% factor',()=>{
 const r=financedEmissions({facilityRef:'FAC-01',obligorRef:'SIM-ABC',assetClass:'business_loans',
 currency:'IDR',asOf:'2025-12-31',outstanding:'500000000000',
 attributionDenominator:'12000000000000',denominatorCurrency:'IDR',denominatorBasis:'total_equity_and_debt',
 emissions:{scope1:'885087',scope2:'23583',scope3:'686906'},
 dataQualityScore:5,ojkTier:2,emissionSourceMethod:'borrower_report',
 emissionSourceVintage:'2025',evidenceReference:'SIMULASI'});
 assert.equal(r.mainFinancedScope1And2Tco2e,'37861.25');
 assert.equal(r.supplementaryFinancedScope3Tco2e,'28621.083333');
 assert.equal(r.ojkTier,2);
 assert.throws(()=>financedEmissions({...r.input,ojkTier:3}),/Tier/);
});
test('Carbon cost uses full debtor Scope 1, never bank attribution or Scope 3',()=>{
 const c=book3CarbonCost(carbon());
 assert.equal(c.carbonCostBaseTco2e,'885087');
 assert.equal(c.emissionGapTco2e,'177017.4');
 assert.equal(c.carbonCostIDR,'141613920000');
 assert.equal(c.carbonCostIntensityPct,'1.770174');
 assert.equal(c.financedEmissionsUsed,false);
 assert.throws(()=>book3CarbonCost({...carbon(),includeScope3:true}),/Scope 3/);
 assert.throws(()=>book3CarbonCost({...carbon(),financedEmissions:'37861.25'}),/financed/);
 assert.throws(()=>book3CarbonCost({...carbon(),debtor:debtor({emissions:{scope1:null,scope2:'200',scope3:'100'}})}),/Scope 1/);
 assert.throws(()=>book3CarbonCost({...carbon(),includeScope2:true,scope2CarbonCostNotInEnergyTariff:false,scope2TariffExclusionEvidence:'SIMULASI - bukti pemisahan tarif'}),/bukti/);
 const s2=book3CarbonCost({...carbon(),includeScope2:true,scope2CarbonCostNotInEnergyTariff:true,
  scope2TariffExclusionEvidence:'Bukti bank/penyedia energi disetujui secara manual'});
 assert.equal(s2.carbonCostBaseTco2e,'908670');
});
test('Activity estimate factor vintage, source priority and units are explicit',()=>{
 const p={activityQuantity:'1000',activityUnit:'kWh',factorKgCO2ePerUnit:'0.5',factorActivityUnit:'kWh',
 scope:'scope2',reportingYear:'2025',factorYear:'2025',factorSourceTier:'national',
 factorSource:'SIMULASI: bukan faktor resmi',factorVersion:'sim',factorEvidence:'SIMULASI'};
 assert.equal(book3Activity(p).estimatedTco2e,'0.5');
 assert.throws(()=>book3Activity({...p,factorYear:'2026'}),/tahun pelaporan/);
 assert.throws(()=>book3Activity({...p,factorActivityUnit:'liter'}),/Satuan/);
 assert.throws(()=>book3Activity({...p,factorSourceTier:'ipcc',hasApplicableNationalFactor:true}),/nasional/);
 assert.throws(()=>book3Activity({...p,scope:'unknown'}),/Scope/);
});
test('Book3 API is tenant-auth inherited, role and feature gated; no persistence',async()=>{
 const req=(kind,payload)=>new Request('https://test.invalid/api/enterprise/book3/validate',{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({kind,payload})});
 const path='/book3/validate',actor={role:'risk_analyst'},env={GC_ENTERPRISE_BOOK3_ENABLED:'true'};
 let r=await handleBook3Api(req('carbon_cost',carbon()),env,null,'demo-tenant',actor,path);
 assert.equal(r.status,200);
 let data=await r.json();assert.equal(data.stored,false);assert.equal(data.result.carbonCostIDR,'141613920000');
 await assert.rejects(()=>handleBook3Api(req('carbon_cost',carbon()),{},null,'demo-tenant',actor,path),/belum diaktifkan/);
 await assert.rejects(()=>handleBook3Api(req('debtor',debtor()),env,null,'demo-tenant',{role:'external_auditor'},path),/hak/);
 r=await handleBook3Api(new Request('https://test.invalid/api/enterprise/book3/catalog'),{},null,'demo-tenant',
  {role:'external_auditor'},'/book3/catalog');
 assert.equal((await r.json()).methods.length,4);
});

test('Tier 4 peer provenance is retained through the financed-emissions audit response',()=>{
 const peer=debtor({sourceMethod:'peer_proxy',ojkTier:4,
  peerSector:'pertanian/perkebunan',peerBusinessModel:'produksi sejenis',
  scalingBasis:'total assets of debtor and benchmark',
  scalingEvidence:'SIMULASI: reference and normalization worksheet'});
 const d=book3Debtor(peer);
 assert.deepEqual(d.debtor.peerProxy,{
  peerSector:'pertanian/perkebunan',peerBusinessModel:'produksi sejenis',
  scalingBasis:'total assets of debtor and benchmark',
  scalingEvidence:'SIMULASI: reference and normalization worksheet'
 });
 const f=book3Financed({...financed(),debtor:peer});
 assert.equal(f.debtorSource.peerProxy.scalingBasis,'total assets of debtor and benchmark');
 assert.equal(f.attributionInputs.outstanding,'500000000000');
 assert.equal(f.attributionInputs.attributionDenominator,'12000000000000');
 assert.equal(f.attributionInputs.denominatorBasis,'equity_plus_debt');
});
test('Sub-milligram activity units round exactly once after kg-to-tonne conversion',()=>{
 const p={activityQuantity:'0.000001',activityUnit:'unit',factorKgCO2ePerUnit:'499.7',
  factorActivityUnit:'unit',scope:'scope1',reportingYear:'2025',factorYear:'2025',
  factorSourceTier:'national',factorSource:'SIMULASI',factorVersion:'sim',
  factorEvidence:'SIMULASI TEST'};
 assert.equal(book3Activity(p).estimatedTco2e,'0');
 assert.equal(book3Activity({...p,factorKgCO2ePerUnit:'500.3'}).estimatedTco2e,'0.000001');
});
test('Carbon cost uses unrounded scenario emission gap while presenting rounded gap separately',()=>{
 const x=book3CarbonCost({...carbon(),debtor:debtor({emissions:{scope1:'0.000001',scope2:'0',scope3:null}}),
   reductionFraction:'0.4997'});
 assert.equal(x.emissionGapTco2e,'0');
 assert.equal(x.carbonCostIDR,'0.39976');
});
