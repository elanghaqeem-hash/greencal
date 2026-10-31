// OJK CRMS Perbankan 2026 Buku 3: separate debtor emissions, financed emissions and carbon cost.
// Bank-provided source data only. No default emission factors, scenario paths or source verification claims.
import {ApiError} from './policy.js';
const S=1000000n;
const bad=(message,code='BOOK3_INVALID')=>{throw new ApiError(400,code,message);};
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function name(v,label,max=300){if(typeof v!=='string'||!v.trim()||v.length>max)bad(label+' wajib diisi.');return v.trim();}
function number(v,label){if(typeof v!=='string'||!/^(?:0|[1-9]\d{0,17})(?:\.\d{1,6})?$/.test(v))bad(label+' harus string desimal nonnegatif (maks. 6 desimal).');const [a,b='']=v.split('.');return BigInt(a)*S+BigInt(b.padEnd(6,'0'));}
function fmt(n){const v=n<0n?-n:n,r=(v%S).toString().padStart(6,'0').replace(/0+$/,'');return (n<0n?'-':'')+(v/S).toString()+(r?'.'+r:'');}
function product(a,b){const m=a*b;return (m+S/2n)/S;}
function share(a,b){if(b===0n||a>b)bad('Denominator harus positif dan >= outstanding.');return (a*S+b/2n)/b;}
function attributed(emission,os,denominator){return (emission*os+denominator/2n)/denominator;}
function validPeriod(v){if(typeof v!=='string'||!/^(?:20\d{2})$/.test(v))bad('Tahun data emisi tidak valid.');return Number(v);}
function scopes(p,{requireScope1=false}={}){
 if(!obj(p))bad('Objek emissions Scope 1, 2, 3 diperlukan.');
 const out={};for(const k of ['scope1','scope2','scope3'])out[k]=p[k]===null||p[k]===undefined?null:fmt(number(p[k],k));
 if(requireScope1&&out.scope1===null)bad('Emisi Scope 1 debitur wajib ada untuk biaya karbon.');
 if(Object.values(out).every(x=>x===null))bad('Minimal satu scope harus tersedia; null bukan nol.');
 return out;
}
export const BOOK3_ASSETS=Object.freeze({
 business_loans:'equity_plus_debt',
 listed_equity_corporate_bonds:'evic_or_equity_plus_debt',
 commercial_real_estate:'property_value',
 project_finance:'project_equity_plus_debt'
});
const SOURCE_METHODS=Object.freeze({borrower_report:[1,2],activity_calculator:[3],peer_proxy:[4]});
export function book3Debtor(p){
 if(!obj(p))bad('Input debitur harus objek.');
 const sourceMethod=name(p.sourceMethod,'Metode sumber',40);
 if(!Object.hasOwn(SOURCE_METHODS,sourceMethod))bad('Sumber harus borrower_report, activity_calculator, atau peer_proxy.');
 if(!Number.isInteger(p.ojkTier)||!SOURCE_METHODS[sourceMethod].includes(p.ojkTier))bad('Tier OJK 1–4 harus sesuai jenis sumber dan diverifikasi mengacu Buku 2.');
 if(sourceMethod==='peer_proxy')for(const k of ['peerSector','peerBusinessModel','scalingBasis','scalingEvidence'])name(p[k],k,240);
 const source={sourceMethod,ojkTier:p.ojkTier,debtorRef:name(p.debtorRef,'Kode debitur anonim',100),
  year:validPeriod(p.year),evidenceReference:name(p.evidenceReference,'Referensi sumber',500),
  sourceVersion:name(p.sourceVersion,'Versi sumber/kalkulator',100),
  sourceAssuranceStatus:name(p.sourceAssuranceStatus,'Status assurance',100)};
 if(sourceMethod==='peer_proxy')source.peerProxy={
  peerSector:p.peerSector.trim(),peerBusinessModel:p.peerBusinessModel.trim(),
  scalingBasis:p.scalingBasis.trim(),scalingEvidence:p.scalingEvidence.trim()
 };
 const e=scopes(p.emissions);
 const present=Object.entries(e).filter(([,v])=>v!==null).map(([k])=>k);
 return {debtor:source,emissionsTco2e:e,presentScopes:present,missingScopes:['scope1','scope2','scope3'].filter(k=>e[k]===null),
  pcafDataQualityScore:p.pcafDataQualityScore===undefined?null:(Number.isInteger(p.pcafDataQualityScore)&&p.pcafDataQualityScore>=1&&p.pcafDataQualityScore<=5?p.pcafDataQualityScore:bad('Skor PCAF harus 1–5.')),
  sourceStatus:'bank_declared_not_independently_verified',officialSubmission:false};
}
export function book3Financed(p){
 if(!obj(p))bad('Input financed emissions tidak valid.');
 const debtor=book3Debtor(p.debtor),assetClass=name(p.assetClass,'Kelas aset',80);
 if(!Object.hasOwn(BOOK3_ASSETS,assetClass))bad('Kelas aset tidak tercantum pada formula Buku 3; perlu pemetaan PCAF tersendiri.');
 const basis=name(p.denominatorBasis,'Basis denominator',90),allowed={
  business_loans:['equity_plus_debt'],listed_equity_corporate_bonds:['evic','equity_plus_debt'],
  commercial_real_estate:['property_value'],project_finance:['project_equity_plus_debt']
 };
 if(!allowed[assetClass].includes(basis))bad('Basis denominator tidak sesuai kelas aset.');
 const currency=name(p.currency,'Mata uang',3),denominatorCurrency=name(p.denominatorCurrency,'Mata uang denominator',3);
 if(!/^[A-Z]{3}$/.test(currency)||currency!==denominatorCurrency)bad('Outstanding dan denominator wajib dalam mata uang yang sama dengan FX tersumber.');
 const os=number(p.outstanding,'Baki debet outstanding'),d=number(p.attributionDenominator,'Denominator');
 const factor=share(os,d),e=debtor.emissionsTco2e,financed={};
 for(const k of ['scope1','scope2','scope3'])financed[k]=e[k]===null?null:fmt(attributed(number(e[k],k),os,d));
 const complete=financed.scope1!==null&&financed.scope2!==null;
 const main=complete?fmt(number(financed.scope1,'financed Scope1')+number(financed.scope2,'financed Scope2')):null;
 return {assetClass,denominatorBasis:basis,currency,attributionFactor:fmt(factor),
  attributionInputs:{outstanding:fmt(os),attributionDenominator:fmt(d),currency,denominatorCurrency,denominatorBasis:basis},
  financedTco2e:financed,mainFinancedScope1And2Tco2e:main,
  supplementaryFinancedScope3Tco2e:financed.scope3,
  mainFigureCoverage:complete?'complete':'incomplete_scope1_or_scope2',
  bankOperationalScope1And2Included:false,debtorSource:debtor.debtor,ojkTier:debtor.debtor.ojkTier,
  pcafDataQualityScore:debtor.pcafDataQualityScore,
  purpose:'bank_portfolio_disclosure_not_credit_risk_input',officialSubmission:false};
}
export function book3CarbonCost(p){
 if(!obj(p))bad('Input biaya karbon tidak valid.');
 const debtor=book3Debtor(p.debtor),e=debtor.emissionsTco2e;
 if(e.scope1===null)bad('Scope 1 penuh milik debitur wajib ada; financed emissions tidak boleh digunakan.');
 if(p.carbonPriceUnit!=='IDR/tCO2e')bad('Harga karbon harus IDR/tCO2e.');
 const rate=number(p.reductionFraction,'Fraksi emission gap');
 if(rate>S)bad('Fraksi penurunan tidak boleh di atas 1.');
 const carbonPrice=number(p.carbonPrice,'Harga karbon');
 let base=number(e.scope1,'Scope1');
 let s2included=false;
 if(p.includeScope2===true){
  name(p.scope2TariffExclusionEvidence,'Bukti Scope2 belum terinternalisasi di tarif',1000);
  if(p.scope2CarbonCostNotInEnergyTariff!==true||e.scope2===null)bad('Scope 2 memerlukan bukti biaya belum tercermin dalam tarif dan data Scope 2.');
  base+=number(e.scope2,'Scope2');s2included=true;
 }else if(p.includeScope2!==false&&p.includeScope2!==undefined)bad('includeScope2 harus boolean.');
 if(p.includeScope3===true||p.financedEmissions!==undefined)bad('Scope 3 dan financed emissions bukan basis biaya karbon debitur.');
 // Do not round the emission gap before pricing it; round only the final IDR result.
 const gap=product(base,rate),cost=(base*rate*carbonPrice+(S*S)/2n)/(S*S);
 const revenue=p.debtorRevenue===undefined?null:number(p.debtorRevenue,'Pendapatan debitur');
 const intensity=revenue===null||revenue===0n?null:fmt((cost*S*100n+revenue/2n)/revenue);
 return {debtorRef:debtor.debtor.debtorRef,year:debtor.debtor.year,
  carbonCostBaseTco2e:fmt(base),emissionGapTco2e:fmt(gap),carbonCostIDR:fmt(cost),carbonCostIntensityPct:intensity,
  scope2IncludedWithEvidence:s2included,scope3Included:false,financedEmissionsUsed:false,
  scenarioReference:name(p.scenarioReference,'Referensi skenario Buku 4',300),
  method:'book3_scope1_debtor_carbon_cost_linked_to_book2',status:'internal_sensitivity_requires_crsa_model_validation',officialSubmission:false};
}
export function book3Activity(p){
 if(!obj(p))bad('Input aktivitas tidak valid.');
 const qty=number(p.activityQuantity,'Data aktivitas'),f=number(p.factorKgCO2ePerUnit,'Faktor kgCO2e/unit');
 const unit=name(p.activityUnit,'Satuan aktivitas',60),funit=name(p.factorActivityUnit,'Satuan faktor',60);
 if(!['scope1','scope2','scope3'].includes(p.scope))bad('Scope tidak valid.');
 if(unit!==funit)bad('Satuan aktivitas dan faktor berbeda; konversi wajib eksplisit.');
 const year=validPeriod(p.reportingYear);
 if(validPeriod(p.factorYear)!==year)bad('Faktor emisi harus sesuai tahun pelaporan; pemutakhiran tidak mengubah periode lama.');
 const priority={national:1,international:2,ipcc:3},tier=name(p.factorSourceTier,'Prioritas faktor',50);
 if(!Object.hasOwn(priority,tier))bad('Faktor harus national, international, atau ipcc.');
 if(p.hasApplicableNationalFactor===true&&tier!=='national')bad('Faktor nasional yang relevan harus diprioritaskan.');
 if(p.hasApplicableInternationalFactor===true&&tier==='ipcc')bad('Sumber internasional harus diprioritaskan atas IPCC jika sesuai.');
 // Convert kg to tonnes with one final rounding, not a preliminary kg rounding.
 const kgToTonnesScale=1000n*S,tonnes=(qty*f+kgToTonnesScale/2n)/kgToTonnesScale;
 return {scope:name(p.scope,'Scope',15),activityUnit:unit,reportingYear:year,
  estimatedTco2e:fmt(tonnes),formula:'activity × kgCO2e/unit ÷ 1000',
  factor:{year,sourceTier:tier,source:name(p.factorSource,'Sumber faktor',250),
  version:name(p.factorVersion,'Versi faktor',100),reference:name(p.factorEvidence,'Referensi faktor',600)},
  status:'estimated_requires_factor_review',officialSubmission:false};
}
