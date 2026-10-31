import {CRE_RRE_PDF_PRESENTATION as CRE_RRE} from './book7-annex-cre-rre-data.js';
// GreenCal CRMS Book 7 annex catalog: user-uploaded OJK PDFs, not full-precision workbooks.
// All values have at most the displayed PDF precision. Only exact dimensional matches allowed.
import {ApiError} from './policy.js';
import {amount,display,times} from './quant-v2.js';
import {ANNEX_CREDIT_PDF_PRESENTATION as CREDIT} from './book7-annex-credit-data.js';
import {ANNEX_MARKET_PDF_PRESENTATION as MARKET} from './book7-annex-market-data.js';
const reject=(message)=>{throw new ApiError(400,'BOOK7_ANNEX_LOOKUP_INVALID',message)};
const years=CREDIT.years;
const scenarios=new Set(['net_zero_2050','delayed_transition','current_policies']);
const sectorMap=Object.freeze({pertanian_kehutanan:'Pertanian dan Kehutanan',pertambangan_penggalian:'Pertambangan',konstruksi:'Konstruksi',transportasi_pergudangan:'Transportasi dan Pergudangan',industri_pengolahan:'Industri Pengolahan',listrik_gas_uap_pendingin:'Listrik, Gas, Uap/Air Panas, dan Udara Dingin',lainnya_non_intensif:'Lainnya'});
function value(p,k){if(typeof p[k]!=='string'||!p[k].trim())reject(k+' wajib berupa teks pilihan.');return p[k].trim();}
function scen(p){const s=value(p,'scenario');if(!scenarios.has(s))reject('Skenario hanya net_zero_2050, delayed_transition, current_policies.');return s;}
function year(p){if(!Number.isInteger(p.year)||!years.includes(p.year))reject('Tahun harus salah satu titik sumber: '+years.join(', '));return p.year;}
function sector(p){const raw=value(p,'sector');const s=sectorMap[raw]||raw;if(!Object.values(sectorMap).includes(s))reject('Sektor bukan kategori dari lampiran.');return s;}
function size(p){const s=value(p,'size').toLowerCase();if(!['mikro','kecil','menengah','korporasi'].includes(s))reject('Ukuran tidak valid.');return s[0].toUpperCase()+s.slice(1);}
function location(p){let l=value(p,'locationRisk').toLowerCase().replace(/^risiko\s+/,'');if(!['rendah','menengah','tinggi'].includes(l))reject('Risiko lokasi harus rendah/menengah/tinggi.');return l[0].toUpperCase()+l.slice(1);}
function rating(p){const r=value(p,'rating');if(!['AA','A','BA','B','C'].includes(r))reject('Rating bucket AA/A/BA/B/C wajib.');return r;}
function collateral(p){const c=value(p,'collateralKind');if(!['Komersial','Industrial','Residensial','Lainnya'].includes(c))reject('Jenis agunan tidak dikenal.');return c;}
const provenance=(table,page)=>({table,sourceDocument:table.startsWith('B')||table.startsWith('C')?'Lampiran 2 - Risiko Pasar dan Likuiditas.pdf':'Lampiran 1 - Risiko Kredit.pdf',pdfPage:page,precision:'PDF_PUBLISHED_ROUNDED',fullPrecisionWorkbookVerified:false,modelApproval:'not_granted',officialSubmission:false});
const fractionPercent=v=>display(amount(v,'Persen')/100n); // source 0.5988% -> fraction 0.005988, exact at 6 dp
function rawLookup(p){
 if(!p||typeof p!=='object'||Array.isArray(p))reject('Objek lookup diperlukan.');
 const t=value(p,'table'),y=t==='C.2'?2026:t==='A.8'?null:t==='B.3'?p.year:year(p),s=['A.3','A.5','A.6','A.7','B.2','B.5'].includes(t)?scen(p):null;
 if(t==='A.3'||t==='B.5'){
  const k=t==='A.3'?CREDIT.A3:MARKET.B5,z=size(p),l=location(p),sec=sector(p),rat=rating(p);
  const row=k.find(r=>r[0]===s&&r[1]===z&&r[2]===l&&r[3]===sec&&r[4]===rat);
  if(!row)reject('Kombinasi skalar PD tidak ditemukan; tidak menggunakan fallback antar-bucket.');
  return {table:t,scenario:s,year:y,size:z,locationRisk:l,sector:sec,rating:rat,rawPublishedValue:row[5][years.indexOf(y)],numericMeaning:'PD_MULTIPLIER',...provenance(t,row[6])};
 }
 if(t==='A.6'){
  const z=size(p),sec=sector(p),rat=rating(p),row=CREDIT.A6.find(r=>r[0]===s&&r[1]===z&&r[2]===sec&&r[3]===rat);
  if(!row)reject('Skalar LGD transisi tidak ditemukan.');
  return {table:t,scenario:s,year:y,size:z,sector:sec,rating:rat,rawPublishedValue:row[4][years.indexOf(y)],numericMeaning:'COLLATERAL_TRANSITION_MULTIPLIER',...provenance(t,row[5])};
 }
 if(t==='A.5'){
  const c=collateral(p),l=location(p),row=CREDIT.A5.find(r=>r[0]===s&&r[1]===c&&r[2]===l);
  if(!row)reject('Haircut risiko fisik tidak ditemukan.');
  const raw=row[3][years.indexOf(y)];
  return {table:t,scenario:s,year:y,collateralKind:c,locationRisk:l,rawPublishedValue:raw,decimalFraction:fractionPercent(raw),numericMeaning:'PHYSICAL_COLLATERAL_HAIRCUT_PERCENT',...provenance(t,row[4])};
 }
 if(t==='B.2'){
  const row=MARKET.B2.find(r=>r[0]===s);if(!row)reject('Skalar obligasi Pemerintah RI tidak ditemukan.');
  return {table:t,scenario:s,year:y,rawPublishedValue:row[1][years.indexOf(y)],numericMeaning:'INDONESIAN_SOVEREIGN_BOND_PD_MULTIPLIER',...provenance(t,row[2])};
 }
 if(t==='B.3'){
  if(!Number.isInteger(y)||y<2025||y>2050)reject('B.3 menyediakan tahun 2025–2050.');
  const sc=value(p,'scenario'),order=['baseline','net_zero_2050','delayed_transition','current_policies','ndc'];
  if(!order.includes(sc))reject('B.3: skenario baseline/net_zero_2050/delayed_transition/current_policies/ndc.');
  const row=MARKET.B3.find(r=>r[0]===y);if(!row)reject('Tahun Fed Funds tidak ditemukan.');
  const raw=row[1+order.indexOf(sc)];
  return {table:t,scenario:sc,year:y,rawPublishedValue:raw,decimalFraction:fractionPercent(raw),baselinePercent:row[1],baselineFraction:fractionPercent(row[1]),numericMeaning:'FED_FUNDS_RATE_PERCENT',...provenance(t,row[6])};
 }
 if(t==='C.2'){
  if(p.year!==2026||p.scenario!=='net_zero_2050')reject('C.2 PDF hanya untuk Net Zero 2050 tahun 2026.');
  const z=size(p),l=location(p),sec=sector(p),row=MARKET.C2.find(r=>r[0]===z&&r[1]===l&&r[2]===sec);
  if(!row)reject('Shock C.2 tidak ditemukan.');
  return {table:t,scenario:'net_zero_2050',year:2026,size:z,locationRisk:l,sector:sec,depositOutflowPercent:row[3],undrawnDrawdownPercent:row[4],depositOutflowFraction:fractionPercent(row[3]),undrawnDrawdownFraction:fractionPercent(row[4]),numericMeaning:'LCR_ADDITIONAL_SHOCKS_PERCENT',...provenance(t,row[5])};
 }
 if(t==='A.7'){
  const propertyType=value(p,'propertyType'),sizeBand=value(p,'sizeBand').replace(/\\s+/g,''),euiClass=value(p,'euiClass');
  const permitted=new Set(['office','retail_mall','warehouse','mixed_use','multifamily','budget_hotel','hotel_3plus','residential']);
  if(!permitted.has(propertyType))reject('Jenis CRE/RRE A.7 tidak terdaftar.');
  const row=CRE_RRE.rows.find(r=>r[0]===s&&r[1]===propertyType&&r[2]===sizeBand&&r[3]===euiClass);
  if(!row)reject('Bucket properti A.7 tidak ditemukan. Masukkan kategori ukuran/EUI tepat sebagaimana PDF.');
  const v=row[4][years.indexOf(y)];
  if(v===null)reject('Nilai A.7 ini berisi NaN dalam sumber PDF; blokir dan periksa workbook asli.');
  return {table:t,scenario:s,year:y,propertyType,sizeBand,euiClass,transitionCost: v,
   numericMeaning:'CRE_RRE_TRANSITION_COST_IDR',unit:'IDR',...provenance(t,row[5])};
 }
 if(t==='A.8'){
  const grade=value(p,'granularRating'),row=CREDIT.A8.find(r=>r[0]===grade);
  if(!row)reject('Peringkat granular tidak tercakup di Tabel A.8.');
  return {table:t,granularRating:grade,baselineTtcPdPercent:row[1],bucket:row[2],lowerBoundPercent:row[3],upperBoundPercent:row[4],...provenance(t,row[5])};
 }
 reject('Tabel tidak terdaftar atau memerlukan workbook presisi penuh: '+t);
}
export function book7AnnexLookup(p){return rawLookup(p);}
const rate=v=>{const a=amount(v,'Probability/Rasio');if(a>1000000n)reject('Rasio lebih dari 1.');return a;};
const positive=v=>amount(v,'Outstanding/Nilai agunan');
export function book7AnnexStress(p){
 const row=rawLookup(p);
 if(['A.3','B.2','B.5'].includes(row.table)){
  const base=rate(p.baselinePD),adjusted=times(base,amount(row.rawPublishedValue,'Scalar'));
  if(adjusted>1000000n)reject('Adjusted PD >100%; tidak dilakukan clipping.');
  return {...row,baselinePD:display(base),adjustedPD:display(adjusted),method:'PDF-displayed-scalar-times-bank-baseline-PD'};
 }
 if(row.table==='A.6'){
  const base=positive(p.collateralValue),adjusted=times(base,amount(row.rawPublishedValue,'Scalar LGD transisi'));
  return {...row,collateralValue:display(base),adjustedCollateral:display(adjusted),transitionValueChange:display(adjusted-base),method:'PDF-displayed-transition-collateral-scalar'};
 }
 if(row.table==='A.5'){
  const base=positive(p.collateralValue),adjusted=times(base,1000000n-amount(row.decimalFraction,'Haircut'));
  return {...row,collateralValue:display(base),adjustedCollateral:display(adjusted),physicalValueLoss:display(base-adjusted),method:'PDF-displayed-physical-haircut-percent'};
 }
 if(row.table==='A.7'){
  const base=positive(p.collateralValue),cost=amount(row.transitionCost,'Biaya A.7 CRE/RRE');
  if(cost>base)reject('Biaya transisi melebihi nilai agunan; keputusan perhitungan perlu penelaahan Bank.');
  return {...row,collateralValue:display(base),adjustedCollateral:display(base-cost),method:'OJK-B7-A7-sourced-CRE-RRE-transition-cost'};
 }
 if(row.table==='C.2'){
  const balance=positive(p.balance),baselineRunoff=rate(p.baselineRate),fraction=amount(p.component==='undrawn'?row.undrawnDrawdownFraction:row.depositOutflowFraction,'LCR shock');
  if(!['deposit','undrawn'].includes(p.component))reject('Komponen deposit/undrawn diperlukan.');
  if(baselineRunoff+fraction>1000000n)reject('Total run-off/drawdown >100%; tidak menggunakan cap tersembunyi.');
  return {...row,component:p.component,balance:display(balance),baselineAmount:display(times(balance,baselineRunoff)),additionalAmount:display(times(balance,fraction)),adjustedAmount:display(times(balance,baselineRunoff+fraction)),method:'OJK-B7-C2-additional-LCR-shock'};
 }
 if(row.table==='B.3'){
  return {...row,rfShockFraction:display(amount(row.decimalFraction,'Fed rate')-amount(row.baselineFraction,'Baseline rate')),method:'scenario-Fed-Funds-minus-baseline-rate'};
 }
 return row;
}
export const BOOK7_ANNEX_PDF_CATALOG_STATUS=Object.freeze({
 tables:['A.3','A.5','A.6','A.7','A.8','B.2','B.3','B.5','C.2'],
 rows:{A3:1260,A5:36,A6:420,A7:369,A8:21,B2:3,B3:26,B5:1260,C2:84},
 sourcePrecision:'PDF_PUBLISHED_ROUNDED',creRreA7:'369_PDF_ROWS_STAGED_ONE_NaN_YEAR_BLOCKED_AND_FULL_PRECISION_WORKBOOK_REQUIRED',
 noExtrapolation:true,externalInstitutionApprovalRequired:true
});
