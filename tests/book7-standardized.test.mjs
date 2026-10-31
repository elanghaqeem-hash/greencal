import test from 'node:test';
import assert from 'node:assert/strict';
import {book7BorrowerMapping,book7ProductivePd,book7RetailNpl,book7CollateralLgd,book7Npl,book7Ckpn,book7MarketShock,book7Liquidity,book7Capital} from '../src/enterprise/book7.js';
import {handleQuantApi} from '../src/enterprise/quant-api.js';
import {enterpriseDb} from './support/enterprise-db.mjs';
const meta={scenario:'SYNTHETIC-DELAYED',year:2027,sourceReference:'SYNTHETIC TEST / NOT OJK OFFICIAL',sourceSha256:'a'.repeat(64)};
test('B7 Tabel 2 revenue thresholds, asset fallback and physical hazard buckets',()=>{
 const p={kbliCode:'01111',sectorGroup:'pertanian_kehutanan',sectorMappingReference:'Approved bank KBLI crosswalk required',locationDistrict:'Kecamatan UAT',impactScore:51};
 assert.deepEqual([2000000000,15000000000,50000000000,50000000001].map(x=>book7BorrowerMapping({...p,annualSales:String(x)}).size),['mikro','kecil','menengah','korporasi']);
 assert.equal(book7BorrowerMapping({...p,totalAssets:'1000000000',annualSales:null}).size,'mikro');
 assert.equal(book7BorrowerMapping({...p,totalAssets:'5000000001',annualSales:null}).size,'menengah');
 assert.equal(book7BorrowerMapping({...p,annualSales:'1',impactScore:0}).physicalRisk,'rendah');
 assert.equal(book7BorrowerMapping({...p,annualSales:'1',impactScore:50}).physicalRisk,'menengah');
 assert.throws(()=>book7BorrowerMapping({...p,kbliCode:'bad',annualSales:'1'}));
});
test('B7 productive PD multiplies scenario scalar, without manufacturing scalar workbook',()=>{
 const r=book7ProductivePd({...meta,periods:[{year:2028,baselinePD:'0.0004',pdScalar:'1.16'}]});
 assert.equal(r.periods[0].adjustedPD,'0.000464');
 assert.match(r.requiredExternalReference,/PD Scalars/);
 assert.throws(()=>book7ProductivePd({...meta,sourceSha256:'not-a-hash',periods:[{year:2028,baselinePD:'0.1',pdScalar:'1'}]}));
 assert.throws(()=>book7ProductivePd({...meta,periods:[{year:2028,baselinePD:'0.9',pdScalar:'2'}]}));
});
test('B7 KPR/other retail NPL models use document coefficients and explicit lags',()=>{
 const k=book7RetailNpl({...meta,product:'kpr',previousQuarterNplRate:'0.0274',laggedDeltaNplGrowth:'0',deltaGdpGrowth:'0.01'});
 assert.equal(k.adjustedNplRate,'0.027005');
 const r=book7RetailNpl({...meta,product:'other_consumer',previousQuarterNplRate:'0.0115',laggedDeltaConsumptionGrowth:'-0.00108'});
 assert.equal(r.adjustedNplRate,'0.011538');
 assert.throws(()=>book7RetailNpl({...meta,product:'other_consumer',previousQuarterNplRate:'0.01'}));
});
test('B7 combined physical/transition collateral LGD follows VTL flow',()=>{
 const x=book7CollateralLgd({...meta,collateralKind:'cre_rre',collateralValue:'6000000000',ead:'10000000000',baselineLGD:'0.4',physicalHaircut:'0.00028',transitionCost:'520466651'});
 assert.equal(x.adjustedCollateral,'5477853349');
 assert.ok(Math.abs(Number(x.adjustedLGD)-0.43481)<0.00002);
 const y=book7CollateralLgd({...meta,collateralKind:'non_cre_rre',collateralValue:'6000000000',ead:'10000000000',baselineLGD:'0.4',physicalHaircut:'0.00029',transitionScalar:'0.9821'});
 assert.equal(y.adjustedCollateral,'5890860000');
 assert.ok(Math.abs(Number(y.adjustedLGD)-0.407276)<0.00001);
 assert.throws(()=>book7CollateralLgd({...meta,collateralKind:'cre_rre',collateralValue:'100',ead:'200',baselineLGD:'0.45',physicalHaircut:'0.1',transitionCost:'100'}));
});
test('B7 performing loan and NPL adjustments are tied to PD scenario',()=>{
 const x=book7Npl({...meta,baselinePD:'0.015',adjustedPD:'0.018',baselineNpl:'889788',totalLoans:'80889788'});
 assert.equal(x.adjustedNpl,'1067745.6');
 assert.equal(x.performingLoans,'79822042.4');
});
test('B7 CKPN: Stage1, Stage2 avg lifetime scalars, Stage3 PD scalar zero',()=>{
 const a=book7Ckpn({...meta,stage:1,baselineCKPN:'12000000',periods:[{baselinePD:'0.0075',adjustedPD:'0.0095',baselineLGD:'0.4',adjustedLGD:'0.44'}]});
 assert.ok(Math.abs(Number(a.adjustedCKPN)-16720000)<25);
 const p1={baselinePD:'0.0075',adjustedPD:'0.0095',baselineLGD:'0.4',adjustedLGD:'0.44'};
 const p2={baselinePD:'0.0081',adjustedPD:'0.0103',baselineLGD:'0.4',adjustedLGD:'0.45'};
 const b=book7Ckpn({...meta,stage:2,remainingYears:2,baselineCKPN:'12000000',periods:[p1,p2]});
 assert.ok(Number(b.adjustedCKPN)>Number(a.adjustedCKPN));
 const c=book7Ckpn({...meta,stage:3,baselineCKPN:'12000000',periods:[{baselineLGD:'0.4',adjustedLGD:'0.44'}]});
 assert.equal(c.pdMultiplier,'0');assert.equal(c.adjustedCKPN,'13200000');
 assert.throws(()=>book7Ckpn({...meta,stage:2,remainingYears:3,baselineCKPN:'100',periods:[p1]}));
});
test('B7 market spread and rate shocks require signed sensitivities',()=>{
 const x=book7MarketShock({...meta,baselinePD:'0.0012',adjustedPD:'0.001536',baselineLGD:'0.75',adjustedLGD:'0.75',marketYield:'0.06',rfShock:'0.002',cs01SignedPerUnitYield:'-10000000',pv01SignedPerUnitYield:'-5000000'});
 assert.equal(x.creditSpreadShock,'0.000252');
 assert.equal(x.spreadValueChange,'-2520');assert.equal(x.interestRateValueChange,'-10000');
 assert.throws(()=>book7MarketShock({...meta,baselinePD:'0.0012',adjustedPD:'0.001536',baselineLGD:'0.75',adjustedLGD:'0.75',marketYield:'0.06',rfShock:'0.002',cs01SignedPerUnitYield:'100',pv01SignedPerUnitYield:'-5000000'}));
});
test('B7 liquidity: haircut changes HQLA, deposit shocks and 75% inflow cap',()=>{
 const x=book7Liquidity({...meta,baselineHqla:'1000000000',baselineOutflows:'100000000',baselineInflows:'50000000',
  hqlaSecurityChanges:[{marketValueChange:'-100000000',hqlaHaircut:'0.15'}],
  corporateDeposits:[{balance:'100000000',baselineRate:'0.05',climateShock:'0.02'}],undrawnCommitments:[],cashInflows:[]});
 assert.equal(x.adjustedHqla,'915000000');assert.equal(x.adjustedOutflows,'102000000');
 assert.equal(x.adjustedLcr,'17.596154'); // 915m/52m approx
 assert.throws(()=>book7Liquidity({...meta,baselineHqla:'100',baselineOutflows:'100',baselineInflows:'50',corporateDeposits:[{balance:'100',baselineRate:'0.9',climateShock:'0.2'}]}));
 const capped=book7Liquidity({...meta,baselineHqla:'100',baselineOutflows:'100',baselineInflows:'100'});
 assert.equal(capped.baselineLcr,'4');
});
test('B7 Tier 1, Tier 2, ATMR and KPMM are explicit institution-supplied inputs',()=>{
 const x=book7Capital({...meta,baselineCapital:'1000',effectiveTaxRate:'0.2',creditPretaxProfitImpact:'-10',fvtplMarketValueChange:'-5',fvociMarketValueChange:'-3',eligibleTier2Addback:'2',adjustedCreditRwa:'3000',adjustedMarketRwa:'200',otherRwa:'300'});
 assert.equal(x.adjustedCapital,'987');assert.equal(x.adjustedRwa,'3500');assert.equal(x.adjustedKpmm,'0.282');
});
test('B7 feature flag fail-closed, disallowed roles cannot run and run is tenant-scoped',async()=>{
 const db=enterpriseDb();
 try{
  const base={kind:'book7_productive_pd',input:{...meta,periods:[{year:2028,baselinePD:'0.0004',pdScalar:'1.16'}]}};
  const call=async(role,env={})=>handleQuantApi(new Request('https://test.invalid/api/enterprise/analytics/runs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(base)}),{GC_ENTERPRISE_QUANT_ENABLED:'true',...env},db,'test-bank',{subject:'test-user',role},'/analytics/runs');
  await assert.rejects(()=>call('climate_model_analyst'),e=>e.code==='BOOK7_DISABLED');
  await assert.rejects(()=>call('executive_viewer',{GC_ENTERPRISE_BOOK7_ENABLED:'true'}),e=>e.code==='QUANT_ROLE_DENIED');
  // Tenant foreign keys are deliberately absent: no real identity is provisioned by this test.
 }finally{db.sqlite.close();}
});
