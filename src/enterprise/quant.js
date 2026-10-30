// GreenCal CRMS quantitative primitives. All inputs are institution-supplied, never inferred.
import {ApiError} from './policy.js';
const reject=(message,code='MODEL_INPUT_INVALID')=>{throw new ApiError(400,code,message);};
const SCALE=1000000n;
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const req=(x,k)=>{if(!isObject(x))reject('Objek input diperlukan.');return x[k];};
const id=(v,name)=>{if(typeof v!=='string'||! /^[A-Za-z0-9_-]{1,100}$/.test(v))reject(name+' tidak valid.');return v;};
const label=(v,name,max=240)=>{if(typeof v!=='string'||!v.trim()||v.length>max)reject(name+' tidak valid.');return v.trim();};
const date=v=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))reject('Tanggal ISO diperlukan.');const d=new Date(v);if(!Number.isFinite(d.valueOf())||d.toISOString().slice(0,10)!==v)reject('Tanggal tidak valid.');return v;};
function dec(v,name,{signed=false}={}){if(typeof v!=='string'||!(signed?/^-?\d{1,15}(?:\.\d{1,6})?$/:/^\d{1,15}(?:\.\d{1,6})?$/).test(v))reject(name+' harus angka desimal string maksimum 6 dp.');const s=v.startsWith('-')?-1n:1n;const [a,b='']=v.replace('-','').split('.');return s*(BigInt(a)*SCALE+BigInt(b.padEnd(6,'0')));}
function format(n){const neg=n<0n?'-':'';const v=n<0n?-n:n;return neg+(v/SCALE).toString()+(v%SCALE?'.'+(v%SCALE).toString().padStart(6,'0').replace(/0+$/,''):'');}
function divide(a,b){if(b===0n)reject('Pembagi tidak boleh nol.');const n=a*SCALE;const q=n/b,r=n%b;return q+((r<0n?-r:r)*2n>=(b<0n?-b:b)?(q<0n?-1n:1n):0n);}
function multiply(a,b){const x=a*b;const mag=x<0n?-x:x;const rounded=(mag+SCALE/2n)/SCALE;return x<0n?-rounded:rounded;}
const decimalString=(v,name,opts)=>format(dec(v,name,opts));
const score=v=>{if(!Number.isInteger(v)||v<1||v>5)reject('PCAF data-quality score harus 1–5.');return v;};
export const ASSET_CLASSES=Object.freeze(['business_loans','listed_equity_corporate_bonds','project_finance','commercial_real_estate','mortgages','motor_vehicle_loans','sovereign_debt']);
export function normalizeExposure(p){
 const assetClass=label(req(p,'assetClass'),'Kelas aset');
 if(!ASSET_CLASSES.includes(assetClass))reject('Kelas aset belum didukung engine ini.');
 const currency=label(p.currency,'Mata uang',3);if(!/^[A-Z]{3}$/.test(currency))reject('Gunakan kode mata uang ISO.');
 const exposure=dec(p.outstanding,'Outstanding'),denominator=dec(p.attributionDenominator,'Denominator');
 if(denominator===0n||exposure>denominator)reject('Denominator atribusi harus positif dan tidak lebih kecil dari outstanding; tinjau nilai ekonomi/total proyek.');
 const sourceType=label(p.denominatorBasis,'Basis denominator',80);
 const expected={business_loans:['total_equity_and_debt'],listed_equity_corporate_bonds:['evic'],project_finance:['project_equity_and_debt'],commercial_real_estate:['property_value_at_origination'],mortgages:['property_value_at_origination'],motor_vehicle_loans:['vehicle_value_at_origination'],sovereign_debt:['ppp_adjusted_gdp']};
 if(!expected[assetClass].includes(sourceType))reject('Denominator tidak sesuai kelas aset. Sovereign membutuhkan GDP PPP dengan satuan sebanding.');
 const scope={};for(const k of ['scope1','scope2','scope3'])scope[k]=p.emissions?.[k]===null||p.emissions?.[k]===undefined?null:decimalString(p.emissions[k],k);
 if(Object.values(scope).every(x=>x===null))reject('Minimum satu scope emisi dari sumber teridentifikasi diperlukan.');
 const quality=score(p.dataQualityScore);
 const input={facilityRef:id(p.facilityRef,'Fasilitas anonim'),obligorRef:id(p.obligorRef,'Debitur anonim'),assetClass,currency,asOf:date(p.asOf),
  outstanding:format(exposure),attributionDenominator:format(denominator),denominatorBasis:sourceType,emissions:scope,dataQualityScore:quality,
  evidenceReference:label(p.evidenceReference,'Referensi bukti',600),emissionSourceVintage:label(p.emissionSourceVintage,'Vintage emisi',60)};
 return input;
}
export function financedEmissions(input){
 const p=normalizeExposure(input),share=divide(dec(p.outstanding,'Outstanding'),dec(p.attributionDenominator,'Denominator'));
 const financed={};for(const [k,v] of Object.entries(p.emissions))financed[k]=v===null?null:format(multiply(share,dec(v,k)));
 return {input:p,attributionFactor:format(share),financedTco2e:financed,method:'PCAF-Part-A-2025-asset-specific-attribution-v1',status:'internal_estimate_requires_methodology_signoff',excludedScopes:Object.entries(financed).filter(([,v])=>v===null).map(([k])=>k)};
}
export function reconcilePortfolio(batch){
 if(!isObject(batch)||!Array.isArray(batch.exposures)||batch.exposures.length===0||batch.exposures.length>100)reject('Batch harus berisi 1–100 fasilitas; pecah unggahan besar menjadi batch terkontrol.');
 const asOf=date(batch.asOf),currency=label(batch.currency,'Mata uang',3);
 const sourceHash=label(batch.sourceSha256,'SHA-256 sumber',64).toLowerCase();if(!/^[a-f0-9]{64}$/.test(sourceHash))reject('Hash sumber wajib SHA-256 heksadesimal.');
 const exposures=batch.exposures.map(normalizeExposure);const keys=new Set();let total=0n;
 for(const row of exposures){if(row.asOf!==asOf||row.currency!==currency)reject('Tanggal posisi atau mata uang tidak sama.');if(keys.has(row.facilityRef))reject('Fasilitas duplikat dalam batch.');keys.add(row.facilityRef);total+=dec(row.outstanding,'Outstanding');}
 const controlTotal=dec(batch.glControlTotal,'Control total GL');
 if(controlTotal!==total)reject('Outstanding tidak rekonsiliasi dengan control total GL.','RECONCILIATION_FAILED');
 if(batch.glControlCount!==exposures.length)reject('Jumlah fasilitas tidak sesuai kontrol sumber GL.','RECONCILIATION_FAILED');
 return {metadata:{asOf,currency,sourceSha256:sourceHash,sourceSystem:label(batch.sourceSystem,'Source system',120),glControlTotal:format(total),glControlCount:exposures.length,controlReference:label(batch.controlReference,'Referensi GL',240)},exposures,results:exposures.map(financedEmissions),reconciliation:'pass',reportingStatus:'internal_only'};
}
export function interpolateScenario(input){
 if(!isObject(input)||!Array.isArray(input.points)||input.points.length<2||input.points.length>200)reject('Minimal dua titik seri NGFS resmi yang dimasukkan/diotorisasi bank.');
 const meta={scenario:label(input.scenario,'Skenario',120),model:label(input.model,'IAM/model',120),region:label(input.region,'Region',100),variable:label(input.variable,'Variabel',180),unit:label(input.unit,'Satuan',80),vintage:label(input.vintage,'Vintage dataset',80),sourceSha256:label(input.sourceSha256,'Checksum',64)};
 if(!/^[a-f0-9]{64}$/i.test(meta.sourceSha256))reject('Checksum dataset NGFS tidak valid.');
 const yr=input.year;if(!Number.isInteger(yr)||yr<2020||yr>2100)reject('Tahun skenario tidak valid.');
 const pts=input.points.map(x=>({year:x.year,value:dec(x.value,'Titik seri',{signed:true})})).sort((a,b)=>a.year-b.year);
 for(let i=0;i<pts.length;i++){if(!Number.isInteger(pts[i].year)||pts[i].year<2020||pts[i].year>2100||(i&&pts[i].year===pts[i-1].year))reject('Tahun duplikat/tidak valid.');}
 const index=pts.findIndex(x=>x.year===yr);if(index>=0)return {metadata:meta,year:yr,value:format(pts[index].value),interpolation:'observed_scenario_point',status:'unverified_bank_supplied_source'};
 let upper=pts.findIndex(x=>x.year>yr);if(upper<1)reject('Ekstrapolasi skenario di luar rentang data dilarang.');
 const lo=pts[upper-1],hi=pts[upper],value=lo.value+((hi.value-lo.value)*BigInt(yr-lo.year))/BigInt(hi.year-lo.year);
 return {metadata:meta,year:yr,value:format(value),interpolation:'linear_between_published_years',status:'unverified_bank_supplied_source'};
}
function insideRing(point,ring){
 let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];
 if(!Array.isArray(a)||!Array.isArray(b)||a.length<2||b.length<2||![a[0],a[1],b[0],b[1]].every(Number.isFinite))reject('Koordinat polygon tidak valid.');
 if(((a[1]>point[1])!==(b[1]>point[1]))&&(point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0]))inside=!inside;
 }return inside;
}
export function physicalOverlay(input){
 if(!isObject(input)||!isObject(input.hazard)||!Array.isArray(input.coordinates)||input.coordinates.length!==2)reject('Lokasi dan hazard polygon GeoJSON diperlukan.');
 const [longitude,latitude]=input.coordinates;if(!Number.isFinite(longitude)||!Number.isFinite(latitude)||Math.abs(longitude)>180||Math.abs(latitude)>90)reject('WGS84 lon/lat invalid.');
 const h=input.hazard;if(h.type!=='Polygon'||!Array.isArray(h.coordinates)||h.coordinates.length<1||h.coordinates.length>10)reject('GeoJSON Polygon diperlukan (maksimum 10 rings).');
 if(h.coordinates.some(r=>!Array.isArray(r)||r.length<4||r.length>10000))reject('Ring polygon invalid.');
 const intersects=insideRing(input.coordinates,h.coordinates[0])&&!h.coordinates.slice(1).some(r=>insideRing(input.coordinates,r));
 if(!/^[a-f0-9]{64}$/i.test(input.datasetSha256||''))reject('SHA-256 dataset geospasial wajib valid.');
 const hazardScore=Number.isInteger(input.hazardScore)&&input.hazardScore>=1&&input.hazardScore<=5?input.hazardScore:null;if(hazardScore===null)reject('Skor hazard 1–5 dari dataset yang tervalidasi diperlukan.');
 return {facilityRef:id(input.facilityRef,'Fasilitas'),coordinates:[longitude,latitude],hazard:label(input.hazardName,'Hazard',120),dataset:label(input.dataset,'Dataset',180),datasetVersion:label(input.datasetVersion,'Versi',80),datasetSha256:label(input.datasetSha256,'Hash',64),insideHazard:intersects,hazardScore:intersects?hazardScore:null,method:'WGS84-point-in-polygon-screening-v1',financialLoss:null,status:'screening_only_not_validated'};
}
export function creditTransmission(input){
 const basePD=dec(input.basePD,'PD'),baseLGD=dec(input.baseLGD,'LGD'),ead=dec(input.baseEAD,'EAD');
 const pdDelta=dec(input.pdDelta,'Perubahan PD',{signed:true}),lgdDelta=dec(input.lgdDelta,'Perubahan LGD',{signed:true}),eadDelta=dec(input.eadDelta,'Perubahan EAD',{signed:true});
 const limit=SCALE;
 if(basePD>limit||baseLGD>limit||basePD+pdDelta<0n||basePD+pdDelta>limit||baseLGD+lgdDelta<0n||baseLGD+lgdDelta>limit||ead+eadDelta<0n)reject('PD/LGD dan delta di luar batas atau EAD negatif.');
 const baseline=multiply(multiply(basePD,baseLGD),ead),stressed=multiply(multiply(basePD+pdDelta,baseLGD+lgdDelta),ead+eadDelta);
 const nii=dec(input.deltaNetIncome,'Perubahan pendapatan bersih',{signed:true}),opex=dec(input.deltaOperatingCost,'Perubahan biaya operasional',{signed:true});
 const delta=stressed-baseline;
 return {baseECL:format(baseline),stressedECL:format(stressed),incrementalECL:format(delta),netProfitImpact:format(nii-opex-delta),currency:label(input.currency,'Mata uang',3),modelReference:label(input.modelReference,'Referensi kalibrasi/validasi model',400),scenarioReference:label(input.scenarioReference,'Referensi skenario',400),method:'one-period-sensitivity-PD-LGD-EAD-ECL-not-PSAK71',status:'internal_sensitivity_only_not_capital_or_accounting'};
}
export function standardizedApproach(input){
 if(!isObject(input)||!Array.isArray(input.components)||input.components.length<1||input.components.length>30)reject('Komponen pendekatan standar yang dipetakan bank diperlukan.');
 const items=input.components.map(c=>({factor:label(c.factor,'Faktor',160),exposure:decimalString(c.exposure,'Eksposur'),weight:decimalString(c.weight,'Bobot model'),reference:label(c.reference,'Sumber koefisien resmi/approved bank',400)}));
 let sum=0n;for(const x of items)sum+=multiply(dec(x.exposure,'Eksposur'),dec(x.weight,'Bobot'));
 return {totalWeightedExposure:format(sum),components:items,method:'configurable-book7-mapping-not-verified-against-official-template',status:'draft_only_requires_exact_book7_formula_validation'};
}
export function reconcileOjkDraft(input){
 if(!isObject(input)||!Array.isArray(input.items)||!input.items.length)reject('Item laporan diperlukan.');
 const expected=dec(input.glControlTotal,'GL'),rows=input.items.map(x=>({facilityRef:id(x.facilityRef,'Fasilitas'),outstanding:decimalString(x.outstanding,'Outstanding'),financed:decimalString(x.financed,'Emisi')}));
 const seen=new Set();let total=0n,emissions=0n;for(const row of rows){if(seen.has(row.facilityRef))reject('Duplikat fasilitas dalam laporan.');seen.add(row.facilityRef);total+=dec(row.outstanding,'Outstanding');emissions+=dec(row.financed,'Emisi');}
 if(total!==expected)reject('Total laporan berbeda dengan GL.','RECONCILIATION_FAILED');
 return {rowCount:rows.length,totalOutstanding:format(total),financedTco2e:format(emissions),glControlTotal:format(expected),reconciled:true,status:'internal_ojk_mapping_draft_not_submission',note:'Belum menggantikan format kertas kerja Buku 6 OJK.'};
}
