#!/usr/bin/env node
// Complete arithmetic audit of every source-PDF-published scalar (NOT workbook parity).
// Independent fixed-point reference calculations; fail on source loss, duplicate keys or rounding drift.
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {ANNEX_CREDIT_PDF_PRESENTATION as A} from '../../src/enterprise/book7-annex-credit-data.js';
import {ANNEX_MARKET_PDF_PRESENTATION as B} from '../../src/enterprise/book7-annex-market-data.js';
import {CRE_RRE_PDF_PRESENTATION as CRE} from '../../src/enterprise/book7-annex-cre-rre-data.js';
import {book7AnnexLookup,book7AnnexStress} from '../../src/enterprise/book7-annex.js';

const S=1000000n;
const DEC=/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/;
const INTEGER=/^(?:0|[1-9][0-9]*)$/;
const F=(n)=>{const neg=n<0n,v=neg?-n:n,frac=(v%S).toString().padStart(6,'0').replace(/0+$/,'');return (neg?'-':'')+(v/S)+(frac?'.'+frac:'');};
const D=(s)=>{if(typeof s!=='string'||!DEC.test(s))throw Error('INVALID_PUBLISHED_DECIMAL:'+s);const [whole,frac='']=s.split('.');return BigInt(whole)*S+BigInt(frac.padEnd(6,'0'));};
const mul=(a,b)=>(a*b+S/2n)/S;
const countRows=(a,n,t)=>{if(a.length!==n)throw Error('ROW_COUNT_MISMATCH:'+t+' '+a.length+' != '+n);};
const stats={tableRows:{},numericCells:0,arithmeticChecks:0,lookupChecks:0,anomalies:[],sourcePrecision:'PDF_PUBLISHED_ROUNDED',fullPrecisionOfficialWorkbookCompared:false,regulatoryProductionApproved:false};
const hashes={credit:createHash('sha256').update(JSON.stringify(A)).digest('hex'),market:createHash('sha256').update(JSON.stringify(B)).digest('hex'),cre:createHash('sha256').update(JSON.stringify(CRE)).digest('hex')};
function equal(actual,expected,key){if(actual!==expected)throw Error('RECONCILIATION_MISMATCH:'+key+' expected '+expected+' got '+actual);stats.arithmeticChecks++;}
function checkLookup(p,expected,key,field='rawPublishedValue',page){
 const result=book7AnnexLookup(p);
 if(result[field]!==expected||result.pdfPage!==page)throw Error('SOURCE_LOOKUP_MISMATCH:'+key);
 if(result.fullPrecisionWorkbookVerified!==false||result.officialSubmission!==false)throw Error('IMPROPER_REGULATORY_CLAIM:'+key);
 stats.lookupChecks++;
 return result;
}
function unique(rows,dimensions,t){
 const seen=new Set();
 for(const r of rows){const key=JSON.stringify(r.slice(0,dimensions));if(seen.has(key))throw Error('DUPLICATE_SOURCE_DIMENSIONS:'+t+key);seen.add(key);}
}
function sourceNumber(v,t,year){if(v===null){stats.anomalies.push({source:t,year,reason:'NULL_SOURCE_VALUE'});return false;}D(v);stats.numericCells++;return true;}
function series(rows,table,dim,valueIndex,pageIndex,build,run){
 stats.tableRows[table]=rows.length;unique(rows,dim,table);
 rows.forEach((r,i)=>{
  if(!Array.isArray(r[valueIndex])||r[valueIndex].length!==9)throw Error('INVALID_SOURCE_VECTOR:'+table+' row '+i);
  r[valueIndex].forEach((v,k)=>{
   const y=A.years[k],key=table+':'+i+':'+y;
   const p={table,year:y,...build(r)};
   if(!sourceNumber(v,key,y)){
    try{book7AnnexLookup(p);throw Error('NULL_SOURCE_WAS_ACCEPTED:'+key);}catch(e){if(e.code!=='BOOK7_ANNEX_LOOKUP_INVALID')throw e;}
    return;
   }
   const result=checkLookup(p,v,key,table==='A.7'?'transitionCost':'rawPublishedValue',r[pageIndex]);
   run?.(p,v,result,key);
  });
 });
}
export function reconcileBook7PublishedPdf(){
 for(const [table,rows,n,dim,vi,pi,build,run] of [
  ['A.3',A.A3,1260,5,5,6,r=>({scenario:r[0],size:r[1],locationRisk:r[2],sector:r[3],rating:r[4]}),(p,v,_,key)=>{
   const x=book7AnnexStress({...p,baselinePD:'0.0001'});
   equal(x.adjustedPD,F(mul(D('0.0001'),D(v))),key+':PD');
  }],
  ['A.5',A.A5,36,3,3,4,r=>({scenario:r[0],collateralKind:r[1],locationRisk:r[2]}),(p,v,result,key)=>{
   equal(result.decimalFraction,F(D(v)/100n),key+':PERCENT');
   const x=book7AnnexStress({...p,collateralValue:'1000000'});
   equal(x.adjustedCollateral,F(D('1000000')-mul(D('1000000'),D(v)/100n)),key+':HAIRCUT');
  }],
  ['A.6',A.A6,420,4,4,5,r=>({scenario:r[0],size:r[1],sector:r[2],rating:r[3]}),(p,v,_,key)=>{
   const x=book7AnnexStress({...p,collateralValue:'1000000'});
   equal(x.adjustedCollateral,F(mul(D('1000000'),D(v))),key+':TRANSITION');
  }],
  ['A.7',CRE.rows,369,4,4,5,r=>({scenario:r[0],propertyType:r[1],sizeBand:r[2],euiClass:r[3]}),(p,v,_,key)=>{
   if(!INTEGER.test(v))throw Error('CRE_COST_NOT_INTEGER:'+key);
   const cost=BigInt(v),base=cost+1000000n;
   const x=book7AnnexStress({...p,collateralValue:String(base)});
   equal(x.adjustedCollateral,'1000000',key+':COST');
  }],
  ['B.2',B.B2,3,1,1,2,r=>({scenario:r[0]}),(p,v,_,key)=>{
   const x=book7AnnexStress({...p,baselinePD:'0.0001'});
   equal(x.adjustedPD,F(mul(D('0.0001'),D(v))),key+':SOVEREIGN');
  }],
  ['B.5',B.B5,1260,5,5,6,r=>({scenario:r[0],size:r[1],locationRisk:r[2],sector:r[3],rating:r[4]}),(p,v,_,key)=>{
   const x=book7AnnexStress({...p,baselinePD:'0.0001'});
   equal(x.adjustedPD,F(mul(D('0.0001'),D(v))),key+':BOND');
  }]
 ]){countRows(rows,n,table);series(rows,table,dim,vi,pi,build,run);}
 stats.tableRows['A.8']=A.A8.length;countRows(A.A8,21,'A.8');unique(A.A8,1,'A.8');
 A.A8.forEach((r,i)=>{for(const v of [r[1],r[3],r[4]])sourceNumber(v,'A.8:'+i,null);
  const x=book7AnnexLookup({table:'A.8',granularRating:r[0]});
  for(const [key,value] of [['baselineTtcPdPercent',r[1]],['bucket',r[2]],['lowerBoundPercent',r[3]],['upperBoundPercent',r[4]]])
   if(x[key]!==value)throw Error('A8_RATING_MISMATCH:'+i+':'+key);
  stats.lookupChecks++;
 });
 stats.tableRows['B.3']=B.B3.length;countRows(B.B3,26,'B.3');unique(B.B3,1,'B.3');
 const labels=['baseline','net_zero_2050','delayed_transition','current_policies','ndc'];
 B.B3.forEach((r,i)=>{if(r[0]!==2025+i)throw Error('B3_YEARS_NOT_CONTIGUOUS');
  labels.forEach((sc,j)=>{const v=r[j+1],key='B.3:'+r[0]+':'+sc;
   sourceNumber(v,key,r[0]);const p={table:'B.3',scenario:sc,year:r[0]};
   const x=checkLookup(p,v,key,'rawPublishedValue',r[6]);
   equal(x.decimalFraction,F(D(v)/100n),key+':PERCENT');
   const stress=book7AnnexStress(p);
   equal(stress.rfShockFraction,F(D(v)/100n-D(r[1])/100n),key+':RF_SHOCK');
  });
 });
 stats.tableRows['C.2']=B.C2.length;countRows(B.C2,84,'C.2');unique(B.C2,3,'C.2');
 B.C2.forEach((r,i)=>{const key='C.2:'+i,p={table:'C.2',scenario:'net_zero_2050',year:2026,size:r[0],locationRisk:r[1],sector:r[2]};
  for(const v of [r[3],r[4]])sourceNumber(v,key,2026);
  const x=book7AnnexLookup(p);stats.lookupChecks++;
  if(x.pdfPage!==r[5]||x.depositOutflowPercent!==r[3]||x.undrawnDrawdownPercent!==r[4]||
    x.officialSubmission!==false||x.fullPrecisionWorkbookVerified!==false)throw Error('C2_SOURCE_MISMATCH:'+key);
  for(const [kind,v] of [['deposit',r[3]],['undrawn',r[4]]]){
   const y=book7AnnexStress({...p,component:kind,balance:'1000000',baselineRate:'0'});
   equal(y.additionalAmount,F(mul(D('1000000'),D(v)/100n)),key+':'+kind);
  }
 });
 if(stats.anomalies.length!==1||!stats.anomalies[0].source.startsWith('A.7:'))throw Error('UNEXPECTED_SOURCE_ANOMALIES');
 if(Object.values(stats.tableRows).reduce((a,b)=>a+b,0)!==3479)throw Error('ANNEX_SOURCE_INCOMPLETE');
 return {...stats,pdfCatalogSha256:hashes,arithmeticParityForPdfSource:true,officialOjkWorkbookParity:false,
  disclaimer:'PASS applies to internal published-PDF catalogue arithmetic ONLY. Not independent workbook or source-authentication verification.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log(JSON.stringify(reconcileBook7PublishedPdf(),null,2));}catch(e){console.error('BOOK7_PDF_RECONCILIATION_FAILED:',e.message);process.exitCode=1;}
}
