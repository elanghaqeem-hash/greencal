// OJK CRMS 2026 Book 7 — source-traceable standard approach primitives.
// No embedded Moody's/OJK scalar workbook. All scalar inputs MUST come from separately approved sources.
// Decimal strings use six fractional places via the existing BigInt quant-v2 primitives.
import {ApiError} from './policy.js';
import {amount,display,times,ratio} from './quant-v2.js';
const ONE=1000000n;
function fail(m){throw new ApiError(400,'BOOK7_INPUT_INVALID',m);}
const positive=(x,n)=>{const v=amount(x,n);if(v<=0n)fail(n+' harus >0.');return v;};
const nonnegative=(x,n)=>amount(x,n);
const rate=(x,n)=>{const v=amount(x,n);if(v>ONE)fail(n+' harus dalam 0..1.');return v;};
const signed=(x,n)=>amount(x,n,{signed:true});
const text=(x,n)=>{if(typeof x!=='string'||!x.trim()||x.length>240)fail(n+' wajib ada.');return x.trim();};
const whole=(x,n,min,max)=>{if(!Number.isInteger(x)||x<min||x>max)fail(n+' tidak valid.');return x;};
const divide=(x,y,n)=>{if(!y)fail(n+' tidak boleh nol.');return ratio(x,y);};
const fmt=display;
const clampZero=x=>x<0n?0n:x;
function meta(p){if(!p||typeof p!=='object'||Array.isArray(p))fail('Payload objek diperlukan.');
 const scenario=text(p.scenario,'Skenario'),year=whole(p.year,'Tahun skenario',2025,2100);
 const sourceReference=text(p.sourceReference,'Referensi sumber'),sourceSha256=text(p.sourceSha256,'SHA-256 sumber');
 if(!/^[a-fA-F0-9]{64}$/.test(sourceSha256))fail('SHA-256 sumber harus 64 digit hex.');
 return {scenario,year,sourceReference,sourceSha256:sourceSha256.toLowerCase(),modelStatus:'bank_input_unverified',officialSubmission:false};
}
export const SECTORS=Object.freeze(['pertanian_kehutanan','pertambangan_penggalian','konstruksi','transportasi_pergudangan','industri_pengolahan','listrik_gas_uap_pendingin','lainnya_non_intensif']);
export function book7BorrowerMapping(p){
 const kbliCode=text(p.kbliCode,'KBLI');
 if(!/^\d{5}$/.test(kbliCode))fail('Kode KBLI 5 digit wajib diisi.');
 if(!SECTORS.includes(p.sectorGroup))fail('Kelompok sektor Buku 7 harus berasal dari crosswalk KBLI yang diverifikasi Bank.');
 const sale=p.annualSales===null||p.annualSales===undefined?null:nonnegative(p.annualSales,'Penjualan tahunan');
 const assets=p.totalAssets===null||p.totalAssets===undefined?null:nonnegative(p.totalAssets,'Aset');
 if(sale===null&&assets===null)fail('Penjualan tahunan atau aset wajib tersedia.');
 // Tabel 2 Buku 7: penjualan <=2/<=15/<=50 miliar; aset <=1/<=5/<=10 miliar.
 const v=sale===null?assets:sale,limit=(sale===null?[1000000000n,5000000000n,10000000000n]:[2000000000n,15000000000n,50000000000n]).map(x=>x*ONE);
 const size=v<=limit[0]?'mikro':v<=limit[1]?'kecil':v<=limit[2]?'menengah':'korporasi';
 const impact=whole(p.impactScore,'Skor dampak Buku 5',0,100);
 return {kbliCode,sectorGroup:p.sectorGroup,sectorMappingReference:text(p.sectorMappingReference,'Bukti KBLI crosswalk'),
  size,sizeBasis:sale===null?'assets_fallback':'annual_sales',locationDistrict:text(p.locationDistrict,'Kecamatan'),
  impactScore:impact,physicalRisk:impact===0?'rendah':impact<=50?'menengah':'tinggi',
  method:'OJK-CRMS-B7-1.4-Tables-1-3',status:'mapping_pending_independent_source_verification'};
}
export function book7ProductivePd(p){
 const m=meta(p); if(!Array.isArray(p.periods)||!p.periods.length||p.periods.length>30)fail('Periode PD 1..30 diperlukan.');
 const seen=new Set(),periods=p.periods.map(x=>{
  const year=whole(x.year,'Tahun PD',2025,2100);if(seen.has(year))fail('Tahun PD duplikat.');seen.add(year);
  const baseline=rate(x.baselinePD,'PD baseline'),scalar=nonnegative(x.pdScalar,'PD skalar');
  const adjusted=times(baseline,scalar);if(adjusted>ONE)fail('PD teradjust >100%; tidak dilakukan cap diam-diam.');
  return {year,baselinePD:fmt(baseline),pdScalar:fmt(scalar),adjustedPD:fmt(adjusted)};
 }).sort((a,b)=>a.year-b.year);
 return {...m,periods,method:'OJK-CRMS-B7-2.1-PD-baseline-times-PD-scalar',
  requiredExternalReference:'Lampiran 1 Risiko Kredit / PD Scalars / Pemetaan Rating'};
}
export function book7RetailNpl(p){
 const m=meta(p),product=p.product;
 if(!['kpr','other_consumer'].includes(product))fail('Jenis portofolio konsumer tidak didukung.');
 const base=rate(p.previousQuarterNplRate,'Rasio NPL triwulan sebelumnya');
 let result;
 if(product==='kpr')result=base+times(amount('0.009029','koefisien'),signed(p.laggedDeltaNplGrowth,'Delta NPL pertumbuhan lag1'))-times(amount('0.039462','koefisien'),signed(p.deltaGdpGrowth,'Delta pertumbuhan PDB'));
 else result=base-times(amount('0.03496','koefisien'),signed(p.laggedDeltaConsumptionGrowth,'Delta pertumbuhan konsumsi lag1'));
 if(result<0n||result>ONE)fail('Proyeksi NPL di luar 0..1; perlu review model tanpa cap.');
 return {...m,product,previousQuarterNplRate:fmt(base),adjustedNplRate:fmt(result),method:product==='kpr'?'OJK-CRMS-B7-2.2.4-quarterly-KPR':'OJK-CRMS-B7-2.2.5-quarterly-other-consumer',note:'Input pertumbuhan adalah fraksi, mis. 5% = 0.05; tidak menghitung lag dari data yang hilang.'};
}
export function book7CollateralLgd(p){
 const m=meta(p),kind=p.collateralKind;
 if(!['cre_rre','non_cre_rre'].includes(kind))fail('Jenis agunan harus CRE/RRE atau agunan fisik lain.');
 const base=positive(p.collateralValue,'Nilai agunan'),ead=positive(p.ead,'EAD');
 const baselineLgd=rate(p.baselineLGD,'LGD baseline'),physicalHaircut=rate(p.physicalHaircut,'Haircut risiko fisik');
 let adjusted=times(base,ONE-physicalHaircut),transition;
 if(kind==='cre_rre'){transition=nonnegative(p.transitionCost,'Biaya transisi CRE/RRE');adjusted-=transition;}
 else {const scalar=rate(p.transitionScalar,'LGD skalar transisi');transition=times(base,ONE-scalar);adjusted-=transition;}
 if(adjusted<0n)fail('Nilai agunan menjadi negatif; perlu penanganan metodologi bank, bukan cap.');
 const vtlBase=ratio(base,ead),vtlAdj=ratio(adjusted,ead),coverage=ratio(adjusted,base);
 const lgdAdjusted=times(baselineLgd,ONE+(ONE-coverage));
 if(lgdAdjusted>ONE)fail('LGD adjusted >1; butuh metode cap yang disetujui Bank.');
 return {...m,collateralKind:kind,baseCollateral:fmt(base),physicalLoss:fmt(times(base,physicalHaircut)),
  transitionLoss:fmt(transition),adjustedCollateral:fmt(adjusted),baselineVtl:fmt(vtlBase),
  adjustedVtl:fmt(vtlAdj),baselineLGD:fmt(baselineLgd),adjustedLGD:fmt(lgdAdjusted),
  method:'OJK-CRMS-B7-2.3.1-to-2.3.3-VTL',requiredExternalReference:'Lampiran 1 Risiko Kredit LGD haircut / LGD Scalars / Matrix Biaya CRE-RRE'};
}
export function book7Npl(p){
 const m=meta(p),basePd=positive(p.baselinePD,'PD baseline'),climatePd=rate(p.adjustedPD,'PD adjusted');
 if(basePd>ONE)fail('PD baseline >1.');const baseNpl=nonnegative(p.baselineNpl,'NPL awal'),total=positive(p.totalLoans,'Total kredit');
 const adjusted=times(baseNpl,divide(climatePd,basePd,'PD baseline'));
 if(adjusted>total)fail('NPL adjusted melebihi total kredit.');
 return {...m,adjustedNpl:fmt(adjusted),adjustedNplRate:fmt(ratio(adjusted,total)),performingLoans:fmt(total-adjusted),
  method:'OJK-CRMS-B7-2.4-PD-proportional-NPL-scalar'};
}
export function book7Ckpn(p){
 const m=meta(p),stage=whole(p.stage,'Stage',1,3);
 const baseline=nonnegative(p.baselineCKPN,'CKPN baseline');
 if(!Array.isArray(p.periods)||p.periods.length!==(stage===2?p.remainingYears:1))fail('Jumlah periode CKPN tidak sesuai stage atau sisa tenor.');
 if(stage===2)whole(p.remainingYears,'Sisa tenor',1,30);
 let sumPd=0n,sumLgd=0n;
 for(const x of p.periods){
  const baseLgd=positive(x.baselineLGD,'LGD baseline'),adjLgd=rate(x.adjustedLGD,'LGD adjusted');
  if(baseLgd>ONE)fail('LGD baseline >1.');
  sumLgd+=divide(adjLgd-baseLgd,baseLgd,'LGD baseline');
  if(stage!==3){const bp=positive(x.baselinePD,'PD baseline'),ap=rate(x.adjustedPD,'PD adjusted');
   if(bp>ONE)fail('PD baseline >1.');sumPd+=divide(ap-bp,bp,'PD baseline');}
 }
 const count=BigInt(p.periods.length),pdMultiplier=stage===3?0n:sumPd/count,lgdMultiplier=sumLgd/count;
 const adjusted=times(times(baseline,ONE+pdMultiplier),ONE+lgdMultiplier);
 if(adjusted<0n)fail('CKPN adjusted negatif, review kalibrasi.');
 return {...m,stage,pdMultiplier:fmt(pdMultiplier),lgdMultiplier:fmt(lgdMultiplier),adjustedCKPN:fmt(adjusted),
  incrementalCKPN:fmt(adjusted-baseline),method:'OJK-CRMS-B7-2.5-stage-specific-scalar',
  note:'Indikator skenario, bukan jurnal otomatis atau pengganti proses akuntansi Bank.'};
}
export function book7MarketShock(p){
 const m=meta(p),pdBase=rate(p.baselinePD,'PD dasar'),lgdBase=rate(p.baselineLGD,'LGD dasar'),pd=rate(p.adjustedPD,'PD adjusted'),lgd=rate(p.adjustedLGD,'LGD adjusted');
 const marketYield=signed(p.marketYield,'Market yield'),rfShock=signed(p.rfShock,'RF shock');
 const shock=times(pd,lgd)-times(pdBase,lgdBase);
 const cs01=signed(p.cs01SignedPerUnitYield,'CS01 signed'),pv01=signed(p.pv01SignedPerUnitYield,'PV01 signed');
 if(cs01>0n||pv01>0n)fail('CS01/PV01 harus sensitivitas bertanda negatif terhadap kenaikan yield (per unit yield).');
 const spreadChange=times(shock,cs01),rateChange=times(rfShock,pv01);
 return {...m,creditSpreadShock:fmt(shock),creditSpreadAdjustedYield:fmt(marketYield+shock),
  interestRateAdjustedYield:fmt(marketYield+rfShock),
  spreadValueChange:fmt(spreadChange),interestRateValueChange:fmt(rateChange),totalValueChange:fmt(spreadChange+rateChange),
  method:'OJK-CRMS-B7-3.4-CS-shock-plus-RF-shock',
  limitations:'Sensitivitas signed per unit yield harus disediakan pricing engine Bank. Tidak menghitung modified duration atau ATMR dari nol.'};
}
export function book7Liquidity(p){
 const m=meta(p);const hqla=nonnegative(p.baselineHqla,'HQLA baseline setelah batas Level2'),
  out=positive(p.baselineOutflows,'Outflows baseline'),inflow=nonnegative(p.baselineInflows,'Inflows baseline');
 const securityChanges=Array.isArray(p.hqlaSecurityChanges)?p.hqlaSecurityChanges:[];
 if(securityChanges.length>300)fail('Terlalu banyak surat berharga.');
 let hqlaChange=0n;
 for(const s of securityChanges)hqlaChange+=times(signed(s.marketValueChange,'Perubahan nilai surat berharga'),ONE-rate(s.hqlaHaircut,'Haircut HQLA'));
 const deposits=Array.isArray(p.corporateDeposits)?p.corporateDeposits:[],commitments=Array.isArray(p.undrawnCommitments)?p.undrawnCommitments:[];
 if(deposits.length>300||commitments.length>300)fail('Terlalu banyak item likuiditas.');
 let extraOut=0n;
 for(const [rows,label] of [[deposits,'deposits'],[commitments,'commitments']])for(const x of rows){
  const bal=nonnegative(x.balance,label+' balance'),base=rate(x.baselineRate,label+' baseline rate'),shock=rate(x.climateShock,label+' climate shock');
  if(base+shock>ONE)fail('Runoff/drawdown melebihi 100% saldo.');extraOut+=times(bal,shock);
 }
 const cashflows=Array.isArray(p.cashInflows)?p.cashInflows:[];
 if(cashflows.length>300)fail('Terlalu banyak inflows.');
 let inflowReduction=0n;
 for(const c of cashflows)inflowReduction+=times(nonnegative(c.contractualCashflow,'Cashflow kontraktual'),rate(c.climateCkpnRatio,'Rasio CKPN iklim'));
 const stressedHqla=hqla+hqlaChange,stressedOutflows=out+extraOut,stressedInflows=clampZero(inflow-inflowReduction);
 if(stressedHqla<0n)fail('HQLA adjusted negatif.');
 const net=(o,i)=>o-(i<times(o,amount('0.75','inflow cap'))?i:times(o,amount('0.75','inflow cap')));
 const baseNet=net(out,inflow),adjNet=net(stressedOutflows,stressedInflows);
 return {...m,baselineLcr:fmt(ratio(hqla,baseNet)),adjustedLcr:fmt(ratio(stressedHqla,adjNet)),
  adjustedHqla:fmt(stressedHqla),adjustedOutflows:fmt(stressedOutflows),adjustedInflows:fmt(stressedInflows),
  inflowCap:'0.75',method:'OJK-CRMS-B7-4.4-HQLA-outflow-inflow',
  limitation:'HQLA Level 2/2B caps must first be calculated in bank-certified LCR engine; LDR requires Buku 6 fields.'};
}
export function book7Capital(p){
 const m=meta(p),capital=nonnegative(p.baselineCapital,'Modal awal'),tax=rate(p.effectiveTaxRate,'Tarif pajak efektif');
 const creditProfit=signed(p.creditPretaxProfitImpact,'Dampak laba kredit sebelum pajak');
 const fvtpl=signed(p.fvtplMarketValueChange,'Perubahan FVTPL'),fvoci=signed(p.fvociMarketValueChange,'Perubahan FVOCI');
 const tier1Credit=times(creditProfit,ONE-tax),tier1Market=times(fvtpl,ONE-tax)+fvoci;
 const tier2=nonnegative(p.eligibleTier2Addback,'Addback Tier 2 yang memenuhi syarat');
 const rwaCredit=nonnegative(p.adjustedCreditRwa,'ATMR kredit'),rwaMarket=nonnegative(p.adjustedMarketRwa,'ATMR pasar'),rwaOther=nonnegative(p.otherRwa,'ATMR lainnya');
 const adjustedCapital=capital+tier1Credit+tier1Market+tier2,rwa=rwaCredit+rwaMarket+rwaOther;
 if(adjustedCapital<0n||rwa<=0n)fail('KPMM tidak dapat dihitung; modal atau ATMR tidak valid.');
 return {...m,tier1CreditImpact:fmt(tier1Credit),tier1MarketImpact:fmt(tier1Market),eligibleTier2Addback:fmt(tier2),
  adjustedCapital:fmt(adjustedCapital),adjustedRwa:fmt(rwa),adjustedKpmm:fmt(ratio(adjustedCapital,rwa)),
  method:'OJK-CRMS-B7-5.1-to-5.3-Tier1-Tier2-RWA',
  limitation:'Addback Tier 2 dan ATMR adalah input yang telah diverifikasi Bank; bukan mesin ATMR peraturan.'};
}

const ASSET_CORRELATION=Object.freeze({corporate:0.18,sme:0.14,mortgage:0.15,credit_card:0.04,other_consumer:0.095});
function normalCdf(x){
 // Abramowitz-Stegun normal tail approximation, maximum absolute error approx 7.5e-8.
 const t=1/(1+0.2316419*Math.abs(x)),d=0.3989422804014327*Math.exp(-x*x/2);
 const upper=d*t*(0.319381530+t*(-0.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));
 return x>=0?1-upper:upper;
}
function normalInv(p){
 if(!(p>0&&p<1))fail('PD untuk inverse normal harus di antara 0 dan 1, eksklusif.');
 let low=-9,high=9;
 for(let i=0;i<75;i++){const mid=(low+high)/2;if(normalCdf(mid)<p)low=mid;else high=mid;}
 return (low+high)/2;
}
export function book7FryeJacobs(p){
 const m=meta(p);
 if(!Object.hasOwn(ASSET_CORRELATION,p.assetClass))fail('Kategori aset untuk korelasi Frye-Jacobs tidak dikenali.');
 const tc=rate(p.ttcPD,'TTC PD'),pit=rate(p.adjustedPitPD,'Climate-adjusted PIT PD'),lgd=rate(p.baselineLGD,'Baseline LGD');
 if(tc<=0n||tc>=ONE||pit<=0n||pit>=ONE||lgd<=0n||lgd>=ONE)fail('TTC PD, PIT PD dan LGD harus berada di antara 0 dan 1.');
 if(!['debtor','guarantor','underlying_obligor'].includes(p.riskBearerType))fail('Jenis pihak penanggung risiko harus debtor/guarantor/underlying_obligor.');
 const rho=ASSET_CORRELATION[p.assetClass],pd=Number(fmt(tc)),stressedPd=Number(fmt(pit)),baseLg=Number(fmt(lgd));
 const inside=normalInv(stressedPd)-(normalInv(pd)-normalInv(pd*baseLg))/Math.sqrt(1-rho);
 const adjusted=normalCdf(inside)/stressedPd;
 if(!Number.isFinite(adjusted)||adjusted<0||adjusted>1)fail('LGD Frye-Jacobs di luar 0..1; perlu kebijakan batas/kalibrasi Bank.');
 return {...m,assetClass:p.assetClass,riskBearerType:p.riskBearerType,
  riskBearerRef:text(p.riskBearerRef,'Referensi pihak penanggung risiko anonim'),
  rho:String(rho),ttcPD:fmt(tc),adjustedPitPD:fmt(pit),baselineLGD:fmt(lgd),
  adjustedLGD:adjusted.toFixed(6),method:'OJK-CRMS-B7-2.3.3.2-Frye-Jacobs',
  numericalMethod:'normal-CDF-Abramowitz-Stegun-bisection-inverse',
  status:'approximation_requires_independent_numeric_validation'};
}
