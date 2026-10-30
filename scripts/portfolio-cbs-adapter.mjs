// Offline CBS/GL file adapter. NO network, NO database writes. Bank must authorize input/processing.
// Expects anonymized bank-approved CSV with strict header and independent GL control JSON.
import {createHash} from 'node:crypto';
import {readFile,stat,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {reconcilePortfolio} from '../src/enterprise/quant.js';
const columns=['facilityRef','obligorRef','assetClass','currency','asOf','outstanding','attributionDenominator','denominatorCurrency','denominatorBasis','scope1','scope2','scope3','dataQualityScore','evidenceReference','emissionSourceVintage'];
function parseCsv(text){
 const rows=[];let row=[],field='',quote=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quote){
   if(c==='"'&&text[i+1]==='"'){field+='"';i++;}
   else if(c==='"')quote=false;
   else field+=c;
  }else if(c==='"'){
   if(field)throw Error('Unexpected CSV quote');quote=true;
  }else if(c===','){row.push(field);field='';}
  else if(c==='\n'){row.push(field);rows.push(row);row=[];field='';}
  else if(c==='\r'){if(text[i+1]!=='\n')throw Error('Invalid CR sequence');}
  else field+=c;
 }
 if(quote)throw Error('Unclosed CSV quote');
 if(field||row.length){row.push(field);rows.push(row);}
 return rows;
}
function scale(v){if(typeof v!=='string'||!/^(?:0|[1-9]\d{0,14})(?:\.\d{1,6})?$/.test(v))throw Error('Invalid decimal amount');const [w,f='']=v.split('.');return BigInt(w)*1000000n+BigInt(f.padEnd(6,'0'));}
function format(v){return String(v/1000000n)+(v%1000000n?'.'+String(v%1000000n).padStart(6,'0').replace(/0+$/,''):'');}
export function convertCsvToBatches(csv,control){
 if(!control||typeof control!=='object'||Array.isArray(control))throw Error('Independent GL control file required.');
 const rows=parseCsv(csv.replace(/^\uFEFF/,''));
 if(!rows.length||JSON.stringify(rows[0])!==JSON.stringify(columns))throw Error('CSV header mismatch: unknown/missing fields, PII columns prohibited.');
 if(rows.length<2)throw Error('No portfolio rows.');
 const data=rows.slice(1).map((row,index)=>{
  if(row.length!==columns.length)throw Error('CSV column mismatch row '+(index+2));
  const d=Object.fromEntries(columns.map((column,i)=>[column,row[i]]));
  return {...d,dataQualityScore:Number(d.dataQualityScore),emissions:{scope1:d.scope1===''?null:d.scope1,scope2:d.scope2===''?null:d.scope2,scope3:d.scope3===''?null:d.scope3}};
 });
 if(!Number.isSafeInteger(control.glControlCount)||control.glControlCount!==data.length)throw Error('GL independent count mismatch.');
 const sum=data.reduce((n,x)=>n+scale(x.outstanding),0n);
 if(format(sum)!==format(scale(control.glControlTotal)))throw Error('GL independent outstanding mismatch.');
 const sourceSha256=createHash('sha256').update(csv).digest('hex');
 const ids=new Set(),batches=[];
 for(const item of data){if(ids.has(item.facilityRef))throw Error('Duplicate facility across CSV batches.');ids.add(item.facilityRef);}
 let i=0;
 while(i<data.length){
  // D1 JSON API limit 32 KiB. Split dynamically to ensure no batch request exceeds it.
  let count=Math.min(100,data.length-i),validated,payload;
  while(count){
   const exposures=data.slice(i,i+count),controlSum=exposures.reduce((n,x)=>n+scale(x.outstanding),0n);
   payload={asOf:control.asOf,currency:control.currency,sourceSha256,sourceSystem:control.sourceSystem,glControlTotal:format(controlSum),glControlCount:count,controlReference:control.controlReference,exposures};
   if(Buffer.byteLength(JSON.stringify(payload))<=29000){validated=reconcilePortfolio(payload);break;}
   count=Math.floor(count/2);
  }
  if(!count||!validated)throw Error('One facility exceeds safe upload size.');
  batches.push(payload);i+=count;
 }
 return {manifest:{sourceSha256,sourceSystem:control.sourceSystem,asOf:control.asOf,currency:control.currency,glControlCount:data.length,glControlTotal:format(sum),batchCount:batches.length,validation:'declared_GL_check_pass',piiPolicy:'strict_anonymized_columns_only'},batches};
}
export async function runCli(argv){
 if(argv.length!==3)throw Error('Usage: node scripts/portfolio-cbs-adapter.mjs approved-anonymous.csv bank-gl-control.json output.ndjson');
 const [inputPath,controlPath,outputPath]=argv;const inputStat=await stat(inputPath);
 if(inputStat.size>25000000)throw Error('Pilot CSV adapter supports up to 25 MB; use bank approved streaming ETL for larger loads.');
 const csv=await readFile(inputPath,'utf8'),control=JSON.parse(await readFile(controlPath,'utf8'));
 const result=convertCsvToBatches(csv,control);
 const ndjson=result.batches.map(x=>JSON.stringify(x)).join('\n')+'\n';
 await writeFile(outputPath,ndjson,{flag:'wx',mode:0o600});
 process.stdout.write(JSON.stringify({outputFile:outputPath,manifest:result.manifest})+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)runCli(process.argv.slice(2)).catch(e=>{console.error('Portfolio adapter failed:',e.message);process.exitCode=1;});
