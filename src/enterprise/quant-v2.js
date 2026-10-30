// GreenCal v4 bank-controlled analytics. These are sensitivity engines, NOT unapproved official OJK formulas.
// Never use defaults for bank/scenario/hazard/PD/LGD/EAD/calibration data.
import {ApiError} from './policy.js';
const SCALE=1000000n;
function fail(message,code='MODEL_INPUT_INVALID'){throw new ApiError(400,code,message);}
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function amount(v,name,{signed=false}={}){
 if(typeof v!=='string'||!(signed?/^-?(?:0|[1-9]\d{0,14})(?:\.\d{1,6})?$/:/^(?:0|[1-9]\d{0,14})(?:\.\d{1,6})?$/).test(v))fail(name+' harus string desimal, maksimum 6 angka pecahan.');
 const negative=v.startsWith('-'),[whole,part='']=v.replace('-','').split('.');
 return (negative?-1n:1n)*(BigInt(whole)*SCALE+BigInt(part.padEnd(6,'0')));
}
export function display(v){const neg=v<0n,mag=neg?-v:v;return (neg?'-':'')+String(mag/SCALE)+(mag%SCALE?'.'+String(mag%SCALE).padStart(6,'0').replace(/0+$/,''):'');}
export function ratio(a,b){if(b===0n)fail('Pembagi nol.');const n=a*SCALE;const negative=(n<0n)!==(b<0n);const mag=n<0n?-n:n,den=b<0n?-b:b;const out=(mag+den/2n)/den;return negative?-out:out;}
export function times(a,b){const n=a*b,mag=n<0n?-n:n;const out=(mag+SCALE/2n)/SCALE;return n<0n?-out:out;}
const whole=v=>{if(!Number.isInteger(v)||v<0||v>2100)fail('Tahun/periode harus integer valid.');return v;};
const name=(v,label,max=180)=>{if(typeof v!=='string'||!v.trim()||v.length>max)fail(label+' wajib diisi.');return v.trim();};
const hash=(v,label='SHA-256')=>{if(typeof v!=='string'||!/^[a-f0-9]{64}$/i.test(v))fail(label+' wajib 64 karakter heksadesimal.');return v.toLowerCase();};
const rate=(v,label)=>{const n=amount(v,label);if(n>SCALE)fail(label+' harus 0–1.');return n;};
const iso=v=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))fail('Tanggal ISO tidak valid.');const d=new Date(v);if(!Number.isFinite(d.valueOf())||d.toISOString().slice(0,10)!==v)fail('Tanggal ISO tidak valid.');return v;};
export function physicalDamageModel(p){
 if(!object(p)||!Array.isArray(p.curve)||p.curve.length<2||p.curve.length>40)fail('Kurva intensitas dan rasio kerusakan minimal dua titik.');
 const exposure=amount(p.assetValue,'Nilai aset'),mitigation=rate(p.mitigationFraction,'Mitigasi'),vulnerability=rate(p.vulnerabilityFraction,'Kerentanan'),hazard=amount(p.hazardIntensity,'Intensitas hazard');
 const points=p.curve.map(x=>({intensity:amount(x.intensity,'Intensitas kurva'),damage:rate(x.damageFraction,'Rasio kerusakan')}));
 for(let i=1;i<points.length;i++)if(points[i].intensity<=points[i-1].intensity||points[i].damage<points[i-1].damage)fail('Kurva harus intensitas naik, damage nonmenurun.');
 if(hazard<points[0].intensity||hazard>points.at(-1).intensity)fail('Hazard di luar rentang; ekstrapolasi dilarang.');
 let fraction=points.find(x=>x.intensity===hazard)?.damage;
 if(fraction===undefined)for(let i=1;i<points.length;i++)if(points[i].intensity>hazard){const a=points[i-1],b=points[i];fraction=a.damage+times(ratio(hazard-a.intensity,b.intensity-a.intensity),b.damage-a.damage);break;}
 const grossLoss=times(times(exposure,fraction),vulnerability);
 const netLoss=times(grossLoss,SCALE-mitigation);
 return {hazard:name(p.hazard,'Hazard'),assetRef:name(p.assetRef,'ID aset anonim'),assetValue:display(exposure),hazardIntensity:display(hazard),damageRatio:display(fraction),grossDamage:display(grossLoss),netDamage:display(netLoss),currency:name(p.currency,'Mata uang',3),datasetSha256:hash(p.datasetSha256),curveApprovalReference:name(p.curveApprovalReference,'Persetujuan kurva',250),method:'linear-depth-damage-v1',status:'illustrative_bank_calibrated_not_regulatory'};
}
function checkScenarios(scenarios){
 if(!Array.isArray(scenarios)||!scenarios.length||scenarios.length>10)fail('Diperlukan 1–10 skenario terkalibrasi.');
 let sum=0n,refs=new Set();
 for(const s of scenarios){if(!object(s)||!Array.isArray(s.periods)||!s.periods.length||s.periods.length>30)fail('Skenario wajib memiliki 1–30 periode.');
  s.key=name(s.key,'Skenario');if(refs.has(s.key))fail('Skenario duplikat.');refs.add(s.key);
  sum+=rate(s.weight,'Bobot skenario');
  s.periods.forEach((v,i)=>{if(!Number.isInteger(v.year)||v.year!==i+1)fail('Periode 1..N wajib kontigu, tanpa gap.');rate(v.conditionalPD,'Conditional PD');rate(v.lgd,'LGD');amount(v.ead,'EAD');});
 }
 if(sum!==SCALE)fail('Bobot skenario harus tepat berjumlah 1.');
}
export function lifetimeCreditEcl(input){
 if(!object(input))fail('Data model harus objek.');
 const stage=input.stage;if(![1,2].includes(stage))fail('Stage 3 perlu metode recovery cash-flow tersendiri.');
 const eir=amount(input.eir,'Effective interest rate');if(eir>SCALE)fail('EIR 0–1 diperlukan.');
 if(!/^[A-Z]{3}$/.test(input.currency||''))fail('Mata uang ISO wajib.');
 const sourceHash=hash(input.sourceSha256),calibration=name(input.modelApprovalReference,'Approval model',250);
 const scenarios=structuredClone(input.scenarios);checkScenarios(scenarios);
 let overall=0n;const results=[];
 for(const s of scenarios){
  if(stage===1&&s.periods.length!==1)fail('Stage 1 hanya 12-month ECL; satu periode tahun pertama.');
  let survival=SCALE,discount=SCALE,ecl=0n;
  const periods=[];
  for(const x of s.periods){
   const pd=rate(x.conditionalPD,'PD'),lgd=rate(x.lgd,'LGD'),ead=amount(x.ead,'EAD');
   const marginal=times(survival,pd);discount=ratio(discount,SCALE+eir);
   const loss=times(times(times(ead,lgd),marginal),discount);
   periods.push({year:x.year,marginalPD:display(marginal),discountFactor:display(discount),ecl:display(loss)});
   ecl+=loss;survival=times(survival,SCALE-pd);
  }
  overall+=times(ecl,rate(s.weight,'Bobot'));
  results.push({scenario:s.key,weight:s.weight,ecl:display(ecl),remainingSurvival:display(survival),periods});
 }
 return {facilityRef:name(input.facilityRef,'Fasilitas anonim'),stage,currency:input.currency,eir:display(eir),expectedCreditLoss:display(overall),scenarios:results,sourceSha256:sourceHash,modelApprovalReference:calibration,method:'stage1-12m-stage2-discounted-conditional-PD-ECL-v1',limitations:'For sensitivity and model validation; not booked PSAK 71 until accounting review and bank model UAT.',status:'unapproved_accounting_estimate'};
}
export function capitalAndProfitBridge(p){
 if(!object(p)||!/^[A-Z]{3}$/.test(p.currency||''))fail('Mata uang wajib.');
 const capital=amount(p.openingCapital,'Modal awal'),rwa=amount(p.openingRwa,'ATMR awal'),openingProfit=amount(p.openingProfit,'Laba awal',{signed:true});
 if(rwa===0n)fail('ATMR tidak boleh nol.');
 const deltaEcl=amount(p.incrementalEcl,'Perubahan ECL',{signed:true}),deltaNii=amount(p.deltaNii,'Perubahan NII',{signed:true});
 const deltaOpex=amount(p.deltaOpex,'Perubahan OPEX',{signed:true}),rwaDelta=amount(p.rwaDelta,'Perubahan ATMR',{signed:true});
 const otherCapital=amount(p.otherCapitalDelta,'Perubahan modal lain',{signed:true}),tax=rate(p.effectiveTaxRate,'Tarif pajak');
 if(rwa+rwaDelta<=0n)fail('ATMR setelah shock harus positif.');
 const pretax=deltaNii-deltaOpex-deltaEcl;
 const taxImpact=times(pretax,SCALE-tax);
 const closingProfit=openingProfit+taxImpact,closingCapital=capital+taxImpact+otherCapital;
 if(closingCapital<0n)fail('Modal sesudah shock negatif; lakukan analisis restrukturisasi/solvabilitas.');
 return {currency:p.currency,openingCapital:display(capital),closingCapital:display(closingCapital),openingProfit:display(openingProfit),closingProfit:display(closingProfit),pretaxImpact:display(pretax),afterTaxImpact:display(taxImpact),openingCar:display(ratio(capital,rwa)),closingCar:display(ratio(closingCapital,rwa+rwaDelta)),carDelta:display(ratio(closingCapital,rwa+rwaDelta)-ratio(capital,rwa)),rwaAfter:display(rwa+rwaDelta),financeControlReference:name(p.financeControlReference,'Referensi GL/ALCO',250),method:'capital-profit-stress-bridge-v1',status:'management_sensitivity_only_not_regulatory_capital'};
}
export function sourceManifest(input){
 if(!object(input)||!Array.isArray(input.entries)||!input.entries.length||input.entries.length>30)fail('Manifest sumber memerlukan 1–30 berkas.');
 const keys=new Set(),entries=input.entries.map(x=>{
 const source=name(x.sourceSystem,'Sistem sumber',100),dataset=name(x.dataset,'Dataset',100),asOf=iso(x.asOf),sha256=hash(x.sha256);
 if(keys.has(source+'|'+dataset+'|'+asOf))fail('Dataset duplikat untuk sistem dan tanggal sama.');keys.add(source+'|'+dataset+'|'+asOf);
 const rows=whole(x.rowCount);if(rows<1)fail('Source row count harus positif.');
 return {sourceSystem:source,dataset,asOf,sha256,rowCount:rows,schemaVersion:name(x.schemaVersion,'Schema version',80),controlTotal:x.controlTotal===null?null:display(amount(x.controlTotal,'Control total')),approvalReference:name(x.approvalReference,'Source approval',200)};
 });
 return {entries,format:'bank-source-manifest-v1',status:'source_asserted_awaiting_independent_ingestion_verification'};
}
