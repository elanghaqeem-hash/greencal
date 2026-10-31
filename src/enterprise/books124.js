// GreenCal OJK CRMS 2026 Books 1, 2 and 4: evidence-gated validation primitives.
// No invented OJK data, regulatory calibration or persisted bank information.
import {ApiError} from './policy.js';

export const PATHS=Object.freeze(['Reference','Current Policies','Delayed Transition','Net Zero 2050']);
export const REPORTED_PATHS=Object.freeze(PATHS.filter(p=>p!=='Reference'));
export const YEARS=Object.freeze(Array.from({length:26},(_,i)=>2025+i));
export const PILLARS=Object.freeze(['governance','strategy','risk_management','disclosure']);
export const TRANSMISSION_RISKS=Object.freeze(['credit','market','liquidity','operational']);
const SOURCE_HASHES=Object.freeze({
 book1:'3b6bde58a358076f4a53a1dc31c30e86f635f750bb52fb31570487149924dd08',
 book2:'f4bd9b28ab41f3635a890272228db65342c7b9574c8a47856a24b34930dee497',
 book4:'3a25af98cb7b1100e52b76b1f535bfe0fc2c57081d1fea6a07a84ec0d791e622'
});
export const DOCUMENTS=Object.freeze([
 {book:1,title:'Panduan Umum',pages:93,sha256:SOURCE_HASHES.book1},
 {book:2,title:'Panduan Teknis',pages:91,sha256:SOURCE_HASHES.book2},
 {book:4,title:'Data Makroekonomi',pages:81,sha256:SOURCE_HASHES.book4}
]);
const bad=(code,message)=>{throw new ApiError(400,code,message);};
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function name(v,label,max=120){
 if(typeof v!=='string'||!v.trim()||v.length>max)bad('BOOK124_INVALID',label+' tidak valid.');
 return v.trim();
}
function integer(v,label,min,max){
 if(!Number.isInteger(v)||v<min||v>max)bad('BOOK124_INVALID',label+' tidak valid.');
 return v;
}
function numeric(v,label,{signed=false}={}){
 if(typeof v!=='string'||!(signed?/^-?\d{1,15}(\.\d{1,6})?$/:/^\d{1,15}(\.\d{1,6})?$/).test(v))bad('BOOK124_INVALID',label+' harus string angka maksimum 15 digit dan 6 desimal.');
 const negative=v.startsWith('-'),parts=(negative?v.slice(1):v).split('.');
 const n=BigInt(parts[0])*1000000n+BigInt((parts[1]||'').padEnd(6,'0'));
 return negative?-n:n;
}
const fmt=n=>{
 const abs=n<0n?-n:n,s=(abs/1000000n).toString(),r=(abs%1000000n).toString().padStart(6,'0').replace(/0+$/,'');
 return (n<0n?'-':'')+s+(r?'.'+r:'');
};
function validateSeries(p){
 if(!plain(p)||!Array.isArray(p.observations))bad('BOOK4_BAD_SERIES','Dataset Book 4 wajib memiliki observations.');
 const variable=name(p.variable,'Kode variabel',80),unit=name(p.unit,'Satuan',80);
 const sourcePage=integer(p.sourcePage,'Halaman PDF sumber',1,81);
 if(typeof p.sourceSha256!=='string'||!(/^[a-f0-9]{64}$/).test(p.sourceSha256))bad('BOOK4_SOURCE_REQUIRED','SHA-256 PDF sumber diperlukan.');
 if(p.sourceSha256!==SOURCE_HASHES.book4)bad('BOOK4_UNREVIEWED_SOURCE','Hash sumber berbeda dari lampiran Buku 4 yang diperiksa; perlukan review versi sumber.');
 if(!['stock','flow','rate'].includes(p.seriesType))bad('BOOK4_BAD_FREQUENCY','Jenis seri harus stock, flow, atau rate.');
 if(p.observations.length!==26*4)bad('BOOK4_INCOMPLETE','Setiap variabel membutuhkan 26 tahun x 4 jalur (104 observasi), termasuk Reference.');
 const index=new Map();
 for(const row of p.observations){
  if(!plain(row))bad('BOOK4_BAD_SERIES','Observasi tidak valid.');
  const y=integer(row.year,'Tahun',2025,2050),scenario=row.scenario;
  if(!PATHS.includes(scenario))bad('BOOK4_BAD_SCENARIO','Jalur skenario tidak ada dalam Buku 4.');
  const key=scenario+'|'+y;
  if(index.has(key))bad('BOOK4_DUPLICATE','Duplikasi jalur dan tahun: '+key);
  const value=numeric(row.value,'Nilai observasi',{signed:true});
  index.set(key,{year:y,scenario,value:fmt(value)});
 }
 for(const s of PATHS)for(const y of YEARS)if(!index.has(s+'|'+y))bad('BOOK4_MISSING','Observasi tidak lengkap: '+s+' '+y);
 return {variable,unit,seriesType:p.seriesType,sourcePage,sourceSha256:p.sourceSha256,
  observations:[...index.values()].sort((a,b)=>PATHS.indexOf(a.scenario)-PATHS.indexOf(b.scenario)||a.year-b.year),
  sourceReview:'pending_independent_review',officialSubmission:false};
}
export function book4Validate(p){
 const x=validateSeries(p);
 return {variable:x.variable,unit:x.unit,seriesType:x.seriesType,coverage:{start:2025,end:2050,scenarios:PATHS,observations:x.observations.length},sourcePage:x.sourcePage,sourceSha256:x.sourceSha256,sourceReview:x.sourceReview,officialSubmission:false};
}
export function book4Deviation(p){
 if(!plain(p))bad('BOOK4_BAD_SERIES','Payload tidak valid.');
 const x=validateSeries(p.series);
 if(!REPORTED_PATHS.includes(p.scenario))bad('BOOK4_BAD_SCENARIO','Reference hanya pembanding, bukan skenario pelaporan.');
 const year=integer(p.year,'Tahun',2025,2050);
 const ref=numeric(x.observations.find(r=>r.scenario==='Reference'&&r.year===year).value,'Reference',{signed:true});
 const val=numeric(x.observations.find(r=>r.scenario===p.scenario&&r.year===year).value,'Skenario',{signed:true});
 const diff=val-ref;
 return {variable:x.variable,year,scenario:p.scenario,unit:x.unit,reference:fmt(ref),scenarioValue:fmt(val),absoluteDeviation:fmt(diff),
  relativeDeviationPct:ref===0n?null:fmt(diff*100000000n/ref),denominatorZero:ref===0n,
  comparison:'same_year_reference',sourceReview:x.sourceReview,officialSubmission:false};
}
export function book4Quarterly(p){
 if(!plain(p))bad('BOOK4_BAD_SERIES','Payload tidak valid.');
 const x=validateSeries(p.series),scenario=p.scenario,year=integer(p.year,'Tahun',2025,2050);
 if(!PATHS.includes(scenario))bad('BOOK4_BAD_SCENARIO','Skenario tidak valid.');
 if(x.seriesType==='rate')bad('BOOK4_RATE_INTERPOLATION','Interpolasi harus pada tingkat variabel, bukan tingkat pertumbuhan/persentase.');
 const val=numeric(x.observations.find(r=>r.scenario===scenario&&r.year===year).value,'Nilai',{signed:true});
 let quarterly;
 if(x.seriesType==='flow'){
  const q=val/4n;quarterly=[q,q,q,val-3n*q];
 }else{
  if(year===2050)bad('BOOK4_EXTRAPOLATION','Tidak boleh ekstrapolasi stock melewati 2050.');
  const next=numeric(x.observations.find(r=>r.scenario===scenario&&r.year===year+1).value,'Next',{signed:true});
  quarterly=[1n,2n,3n,4n].map(k=>val+(next-val)*k/4n);
 }
 return {year,scenario,variable:x.variable,unit:x.unit,seriesType:x.seriesType,quarters:quarterly.map((n,i)=>({quarter:i+1,value:fmt(n)})),
  aggregateCheck:x.seriesType==='flow'?fmt(quarterly.reduce((a,b)=>a+b,0n)):null,
  sourceReview:x.sourceReview,officialSubmission:false};
}
export function book2CarbonCost(p){
 if(!plain(p))bad('BOOK2_BAD_INPUT','Payload tidak valid.');
 const unit=p.carbonPriceUnit;
 if(unit!=='IDR/tCO2e')bad('BOOK2_UNIT','Satuan harga karbon eksplisit IDR/tCO2e diperlukan.');
 const price=numeric(p.carbonPrice,'Harga karbon'),reduction=numeric(p.emissionsToReduce,'Emisi yang diturunkan');
 const amount=price*reduction/1000000n;
 return {formula:'carbon_price × emissions_to_reduce',carbonPrice:fmt(price),emissionsToReduceTco2e:fmt(reduction),
  carbonCostIDR:fmt(amount),transmission:'debtor_cashflow_to_risk_metrics',calibration:'not_validated',
  modelRequired:['debtor_cash_flow','baseline_pd','climate_adjusted_pd','lgd','ead','ckpn','atmr'],
  officialSubmission:false};
}
export function book1GovernanceCoverage(p){
 if(!plain(p)||!plain(p.evidence))bad('BOOK1_BAD_INPUT','Empat pilar dan bukti harus disediakan.');
 const missing=PILLARS.filter(k=>!Array.isArray(p.evidence[k])||p.evidence[k].length===0);
 for(const k of PILLARS)if(Array.isArray(p.evidence[k])&&(p.evidence[k].length>20||p.evidence[k].some(x=>typeof x!=='string'||!x.trim()||x.length>240)))bad('BOOK1_BAD_EVIDENCE','Referensi bukti tidak valid.');
 return {pillars:PILLARS,covered:PILLARS.filter(k=>!missing.includes(k)),missing,
  assessment:missing.length?'evidence_incomplete':'evidence_declared_pending_review',
  independentReviewRequired:true,officialSubmission:false};
}
