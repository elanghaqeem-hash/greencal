// Offline CKPN/PSAK71 reconciliation: no CBS connection, customer identifiers or production booking.
// Bank-approved anonymous facility references only. No default tolerance.
import {createHash} from 'node:crypto';
import {parseCsv} from './portfolio-cbs-adapter.mjs';
function dec(x,field){if(typeof x!=='string'||!/^(?:0|[1-9]\d{0,14})(?:\.\d{1,6})?$/.test(x))throw Error(field+' must be a decimal string');const [a,b='']=x.split('.');return BigInt(a)*1000000n+BigInt(b.padEnd(6,'0'));}
function fmt(x){return (x<0n?'-':'')+String((x<0n?-x:x)/1000000n)+((x<0n?-x:x)%1000000n?'.'+String((x<0n?-x:x)%1000000n).padStart(6,'0').replace(/0+$/,''):'');}
function sha(s){return createHash('sha256').update(s).digest('hex');}
export function reconcileCkpn(ckpnCsv,modelResults,control){
 if(!control||typeof control!=='object'||!/^[A-Z]{3}$/.test(control.currency||'')||!/^\d{4}-\d{2}-\d{2}$/.test(control.asOf||''))throw Error('Currency and position date control required');
 if(!Array.isArray(modelResults)||!modelResults.length||modelResults.length>10000)throw Error('1..10000 model results required');
 const header=['facilityRef','currency','asOf','stage','bookedCKPN'];
 const rows=parseCsv(ckpnCsv.replace(/^\uFEFF/,''));
 if(!rows.length||JSON.stringify(rows[0])!==JSON.stringify(header))throw Error('Unexpected/PII CKPN CSV columns');
 const source=new Map(),computed=new Map();let bookedTotal=0n,modelTotal=0n;
 for(const [i,row] of rows.slice(1).entries()){
  if(row.length!==header.length)throw Error('CKPN CSV row '+(i+2)+' invalid');
  const [facilityRef,currency,asOf,stageRaw,booked]=row;
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(facilityRef)||currency!==control.currency||asOf!==control.asOf||!['1','2'].includes(stageRaw))throw Error('CKPN row invalid ID/currency/date/stage');
  if(source.has(facilityRef))throw Error('Duplicate CKPN facility');
  const value=dec(booked,'booked CKPN');source.set(facilityRef,{stage:Number(stageRaw),value});bookedTotal+=value;
 }
 for(const item of modelResults){
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(item.facilityRef||'')||!['1','2'].includes(String(item.stage))||item.currency!==control.currency||computed.has(item.facilityRef))throw Error('Model result duplicate or unmatched currency/stage');
  const value=dec(item.expectedCreditLoss,'model ECL');computed.set(item.facilityRef,{stage:item.stage,value});modelTotal+=value;
 }
 if(source.size!==computed.size||source.size!==control.rowCount)throw Error('Facility or row-count mismatch');
 if(bookedTotal!==dec(control.glCkpnControlTotal,'GL CKPN control'))throw Error('Booked CKPN and GL do not reconcile');
 const tolerance=dec(control.approvedTolerance,'Bank-approved tolerance');
 const differences=[];
 for(const [ref,row] of source){
  const other=computed.get(ref);
  if(!other||other.stage!==row.stage)throw Error('Unmatched facility or SICR stage');
  const delta=other.value-row.value;
  if(delta!==0n)differences.push({facilityRef:ref,delta:fmt(delta),withinApprovedTolerance:(delta<0n?-delta:delta)<=tolerance});
 }
 const allWithin=differences.every(x=>x.withinApprovedTolerance);
 return {currency:control.currency,asOf:control.asOf,rowCount:source.size,ckpnSourceSha256:sha(ckpnCsv),bookedCkpnTotal:fmt(bookedTotal),modelEclTotal:fmt(modelTotal),totalVariance:fmt(modelTotal-bookedTotal),exceptions:differences,tolerance:fmt(tolerance),withinTolerance:allWithin,glReconciled:true,status:allWithin?'internal_model_reconciled_requires_finance_signoff':'exceptions_require_bank_review',postingAllowed:false,regulatoryApproved:false};
}
