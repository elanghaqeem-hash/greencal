// OJK CRMS 2026 Buku 5. This engine consumes source-published scores; it never generates hazard scores.
import {ApiError} from './policy.js';
export const BOOK5_HAZARDS=Object.freeze(['flood','sea_level_rise','wildfire','heat_stress','water_stress','storm','combined']);
export const BOOK5_ASSET_LINES=Object.freeze(['residential','commercial','industrial','other']);
export const BOOK5_SCENARIOS=Object.freeze(['Net Zero 2050','Delayed Transition','Current Policy']);
export const BOOK5_YEARS=Object.freeze([2020,2030,2040,2050]);
const bad=(message,code='BOOK5_INVALID_INPUT')=>{throw new ApiError(400,code,message);};
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=(v,name,max=120)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max)bad(name+' wajib diisi.');return v.trim();};
export function book5Selection(input){
 if(!isObject(input))bad('Objek penilaian diperlukan.');
 const id=text(input.datasetId,'ID dataset',80);
 if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id))bad('ID dataset tidak valid.');
 const assetLine=text(input.assetLine,'Lini agunan',40);
 if(!BOOK5_ASSET_LINES.includes(assetLine))bad('Lini agunan tidak dikenal.');
 const scenario=text(input.scenario,'Skenario',40);
 if(!BOOK5_SCENARIOS.includes(scenario))bad('Skenario harus mengikuti Buku 5.');
 const year=input.year;
 if(!Number.isInteger(year)||year<2020||year>2050)bad('Tahun harus integer dalam interval 2020–2050; ekstrapolasi dilarang.');
 const province=text(input.province,'Provinsi',120),regency=text(input.regency,'Kabupaten/kota',120);
 const method=input.locationMethod||'exact_district';
 if(!['exact_district','regency_conservative_max'].includes(method))bad('Metode pemetaan tidak dikenal.');
 const district=method==='exact_district'?text(input.district,'Kecamatan',120):null;
 return {datasetId:id,assetLine,scenario,year,province,regency,district,locationMethod:method};
}
const score=(raw,key)=>{
 if(raw===null||raw===undefined||raw==='')return null;
 if(!((typeof raw==='number'&&Number.isFinite(raw))||(typeof raw==='string'&&/^\d+(?:\.\d{1,6})?$/.test(raw))))bad('Skor '+key+' tidak numerik.');
 const n=Number(raw);if(n<0||n>100)bad('Skor '+key+' harus 0–100.');
 return n;
};
export function book5Category(value){
 const n=score(value,'dampak');
 if(n===null)return {code:'missing',label:'Data tidak tersedia'};
 if(n===0)return {code:'low',label:'Rendah'};
 if(n===50)return {code:'boundary_review',label:'Perlu review batas 50'};
 if(n<50)return {code:'medium',label:'Menengah'};
 return {code:'high',label:'Tinggi'};
}
export function book5ValidateScores(scores){
 if(!isObject(scores))bad('Tujuh skor sumber harus berupa objek.');
 const output={};
 for(const key of BOOK5_HAZARDS)output[key]=score(scores[key],key);
 return output;
}
function interpolate(a,b,weight){
 if(a===null||b===null)return null; // Missing != zero.
 if(weight===0)return a;
 if(weight===1)return b;
 // Book 5 allows linear interpolation between OJK's ten-year points, never extrapolation.
 return Math.round((a+(b-a)*weight)*1e6)/1e6;
}
export function book5Evaluate(selection,observations,source){
 const q=book5Selection(selection);
 if(!Array.isArray(observations))bad('Observasi dataset diperlukan.');
 if(!isObject(source)||!/^[a-f0-9]{64}$/i.test(source.sha256||''))bad('Provenance SHA-256 dataset harus diketahui.');
 const lower=2020+Math.floor((q.year-2020)/10)*10;
 const upper=q.year===lower?lower:lower+10;
 const byYear=new Map();
 for(const row of observations){
  if(!BOOK5_YEARS.includes(row.year)||!isObject(row.scores)||byYear.has(row.year))bad('Tahun atau baris observasi duplikat.');
  byYear.set(row.year,book5ValidateScores(row.scores));
 }
 const first=byYear.get(lower),second=byYear.get(upper);
 if(!first||!second)bad('Titik waktu resmi yang diperlukan belum tersedia.','BOOK5_SOURCE_DATA_MISSING');
 const result={},weight=lower===upper?0:(q.year-lower)/(upper-lower);
 for(const key of BOOK5_HAZARDS){
  const value=interpolate(first[key],second[key],weight);
  result[key]={score:value,category:book5Category(value)};
 }
 const missing=BOOK5_HAZARDS.filter(k=>result[k].score===null);
 const boundary=BOOK5_HAZARDS.filter(k=>result[k].category.code==='boundary_review');
 return {selection:q,scores:result,source:{datasetId:q.datasetId,sha256:source.sha256.toLowerCase(),version:source.version,
    status:source.status,latestDataConfirmed:source.latestDataConfirmed===true},
  interpolation:lower===upper?'official_point':'linear_between_official_points',
  bounds:{lower,upper},locationMethod:q.locationMethod,
  compositeMethod:'source_published_not_sum_average_or_max_of_hazards',
  limitations:{scoreIsDamagePercent:false,financialLossEstimated:false,adaptationAndInsuranceIncluded:false,
    missingHazards:missing,ambiguousThresholdAt50:boundary,
    coverage:'six_OJK_hazards_only',additionalAssetAssessmentRequired:true},
  approvalStatus:'internal_screening_only_not_approved_ojk_reporting'};
}
export function book5ConservativeDistrictMax(rows){
 if(!Array.isArray(rows)||rows.length===0)bad('Tidak ada baris kecamatan untuk fallback.','BOOK5_SOURCE_DATA_MISSING');
 const result=new Map();
 for(const row of rows){
  const yr=row.year;
  if(!BOOK5_YEARS.includes(yr))bad('Tahun data tidak dikenal.');
  const current=result.get(yr)||Object.fromEntries(BOOK5_HAZARDS.map(h=>[h,null]));
  const values=book5ValidateScores(row.scores);
  for(const k of BOOK5_HAZARDS)if(values[k]!==null)current[k]=current[k]===null?values[k]:Math.max(current[k],values[k]);
  result.set(yr,current);
 }
 return [...result.entries()].map(([year,scores])=>({year,scores}));
}
