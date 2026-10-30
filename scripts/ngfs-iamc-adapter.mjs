// Offline NGFS IAMC time-series adapter. This script does not download or invent NGFS data.
import {createHash} from 'node:crypto';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {parseCsv} from './portfolio-cbs-adapter.mjs';
import {interpolateScenario} from '../src/enterprise/quant.js';
const keys=['Model','Scenario','Region','Variable','Unit'];
const required=['model','scenario','region','variable','unit','vintage','year','sourceUrl'];
export function ingestIamcCsv(csv,selection){
 if(!selection||typeof selection!=='object'||required.some(k=>typeof selection[k]==='undefined'))throw Error('Selection requires exact model,scenario,region,variable,unit,vintage,year,sourceUrl.');
 if(typeof selection.sourceUrl!=='string'||!/^https:\/\//.test(selection.sourceUrl))throw Error('Verified official source HTTPS required.');
 const rows=parseCsv(csv.replace(/^\uFEFF/,''));
 if(rows.length<2||!keys.every((k,i)=>rows[0][i]===k))throw Error('Expected IAMC columns Model,Scenario,Region,Variable,Unit and year columns.');
 const years=rows[0].slice(5).map(y=>Number(y));
 if(years.length<2||years.some(y=>!Number.isInteger(y)||y<2020||y>2100)||new Set(years).size!==years.length)throw Error('Invalid year columns.');
 const matched=rows.slice(1).filter(row=>keys.every((k,i)=>row[i]===selection[k.toLowerCase()]));
 if(matched.length!==1)throw Error('Expected exactly one exact-match NGFS series; check model/region/units/vintage.');
 const row=matched[0];if(row.length!==rows[0].length)throw Error('IAMC data column count mismatch.');
 const points=years.map((year,i)=>({year,value:row[i+5]})).filter(v=>v.value!=='');
 if(points.length<2)throw Error('Insufficient nonempty published points.');
 if(points.some(p=>!/^-?\d{1,13}(?:\.\d{1,6})?$/.test(p.value)))throw Error('Non-numeric or over-precision IAMC value; do not silently round.');
 const data={model:selection.model,scenario:selection.scenario,region:selection.region,variable:selection.variable,unit:selection.unit,vintage:selection.vintage,year:selection.year,
  sourceSha256:createHash('sha256').update(csv).digest('hex'),points};
 const result=interpolateScenario(data);
 return {input:data,sourceUrl:selection.sourceUrl,sourceFileSha256:data.sourceSha256,result,reviewStatus:'bank_source_and_model_review_required'};
}
export async function runCli(argv){
 if(argv.length!==3)throw Error('Usage: node scripts/ngfs-iamc-adapter.mjs NGFS-source.csv selection.json output.json');
 const [inputPath,selectionPath,outputPath]=argv;
 if((await stat(inputPath)).size>25000000)throw Error('Pilot NGFS CSV adapter max 25MB.');
 const csv=await readFile(inputPath,'utf8'),selection=JSON.parse(await readFile(selectionPath,'utf8'));
 const data=ingestIamcCsv(csv,selection);
 await writeFile(outputPath,JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});
 process.stdout.write(JSON.stringify({outputFile:outputPath,sourceFileSha256:data.sourceFileSha256,model:data.input.model,scenario:data.input.scenario,variable:data.input.variable,year:data.result.year})+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)runCli(process.argv.slice(2)).catch(e=>{console.error('NGFS adapter failed:',e.message);process.exitCode=1;});
