// Bank-owned HTTPS connector, executed only within bank-controlled network; NEVER in public Worker.
// Endpoint, expected SHA-256 and bearer secret are externally supplied/approved; no secrets are logged or stored.
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {convertCsvToBatches} from './portfolio-cbs-adapter.mjs';
import {reconcileCkpn} from './ckpn-reconciliation.mjs';

const sources=['CBS','GL','CKPN'];
const HEX=/^[a-f0-9]{64}$/i;
export function validateBankConnection(config){
 if(!config||typeof config!=='object'||Array.isArray(config))throw Error('Bank connector manifest required.');
 if(!sources.includes(config.source))throw Error('Source must be CBS, GL or CKPN.');
 let url;try{url=new URL(config.url);}catch{throw Error('Invalid bank URL');}
 if(url.protocol!=='https:'||url.username||url.password||url.hash||url.port&&url.port!=='443'||!url.pathname.startsWith('/'))throw Error('TLS HTTPS bank endpoint required.');
 if(/^(localhost|127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|169\.254\.|0\.)/.test(url.hostname))throw Error('Private endpoint must be accessed from bank-controlled agent, not via public Worker');
 if(!Array.isArray(config.allowedHosts)||config.allowedHosts.length<1||!config.allowedHosts.includes(url.hostname)||config.allowedHosts.some(h=>typeof h!=='string'||! /^[a-z0-9.-]+$/.test(h)))throw Error('Bank-approved exact HTTPS host allowlist required.');
 if(!HEX.test(config.expectedSha256||''))throw Error('Signed source SHA-256 expected digest required.');
 if(!/^[A-Za-z][A-Za-z0-9_]{4,100}$/.test(config.secretEnv||''))throw Error('Name of local bank service-account environment secret required.');
 if(config.approvedPurpose!=='CRMS_BANK_AUTHORIZED_DATA_EXTRACTION')throw Error('Approved data-processing purpose required.');
 if(!Number.isInteger(config.maxBytes)||config.maxBytes<1||config.maxBytes>25_000_000)throw Error('Max body bytes must be bounded <=25MB.');
 if(config.method!==undefined&&config.method!=='GET')throw Error('Only GET approved.');
 return {source:config.source,url:url.href,host:url.hostname,secretEnv:config.secretEnv,expectedSha256:config.expectedSha256.toLowerCase(),maxBytes:config.maxBytes};
}
export async function retrieveApprovedBankSource(config,{fetchImpl=fetch,secrets=process.env}={}){
 const manifest=validateBankConnection(config);
 const token=secrets[manifest.secretEnv];
 if(typeof token!=='string'||token.length<24||/[\r\n]/.test(token))throw Error('Service credential missing or invalid in bank agent environment.');
 let response;
 try{response=await fetchImpl(manifest.url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{authorization:'Bearer '+token,accept:'text/csv,application/csv,text/plain'}});}
 catch{throw Error('Bank source connection failed; no payload was accepted.');}
 if(!response||response.status!==200||response.redirected||new URL(response.url||manifest.url).origin!==new URL(manifest.url).origin||new URL(response.url||manifest.url).pathname!==new URL(manifest.url).pathname)throw Error('Bank endpoint response not authentic; redirects and non-200 rejected.');
 const type=(response.headers?.get?.('content-type')||'').split(';')[0].trim().toLowerCase();
 if(!['text/csv','application/csv','text/plain'].includes(type))throw Error('Unexpected source content-type');
 const declared=Number(response.headers?.get?.('content-length')||0);
 if(declared>manifest.maxBytes)throw Error('Content length exceeds policy limit');
 const reader=response.body?.getReader?.();if(!reader)throw Error('Streamed source response required');
 let count=0;const chunks=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>manifest.maxBytes)throw Error('Actual file exceeds policy limit');chunks.push(value);}}finally{reader.releaseLock();}
 const buffer=Buffer.concat(chunks.map(x=>Buffer.from(x)),count);
 const digest=createHash('sha256').update(buffer).digest('hex');
 if(digest!==manifest.expectedSha256)throw Error('Actual source bytes SHA-256 do not match bank-approved expected hash');
 const body=new TextDecoder('utf-8',{fatal:true}).decode(buffer);
 if(body.includes('\0'))throw Error('Binary/invalid export is prohibited');
 return {source:manifest.source,text:body,sha256:digest,sizeBytes:count,sourceUrl:new URL(manifest.url).origin+'/[redacted-approved-endpoint]',status:'bytes_verified_pending_business_and_bank_acceptance'};
}
export function prepareBankPackage({cbs,glControl,ckpn,ckpnControl,eclResults}){
 if(!cbs||cbs.source!=='CBS'||!cbs.text||!HEX.test(cbs.sha256||''))throw Error('Byte-verified CBS source required');
 if(!glControl||typeof glControl!=='object'||!glControl.controlReference||!glControl.glControlTotal)throw Error('Approved GL control required');
 if(!ckpn||ckpn.source!=='CKPN'||!ckpn.text||!HEX.test(ckpn.sha256||''))throw Error('Byte-verified CKPN source required');
 const portfolio=convertCsvToBatches(cbs.text,glControl);
 if(portfolio.manifest.sourceSha256!==cbs.sha256)throw Error('CBS source bytes changed after retrieval');
 const accounting=reconcileCkpn(ckpn.text,eclResults,ckpnControl);
 if(accounting.ckpnSourceSha256!==ckpn.sha256)throw Error('CKPN source bytes changed after retrieval');
 return {sources:{CBS:cbs.sha256,CKPN:ckpn.sha256,GL:glControl.sourceSha256||null},portfolio:portfolio.manifest,ckpn:accounting,status:'bank_internal_review_not_approved',regulatedPostingAllowed:false,uploadBatches:portfolio.batches};
}
export async function cli(args){
 if(args.length!==2)throw Error('Usage: node scripts/bank-secure-fetch.mjs connector.private.json output.private.csv');
 const [configFile,outputFile]=args,config=JSON.parse(await readFile(configFile,'utf8'));
 const result=await retrieveApprovedBankSource(config);
 await writeFile(outputFile,result.text,{flag:'wx',mode:0o600});
 process.stdout.write(JSON.stringify({source:result.source,sha256:result.sha256,sizeBytes:result.sizeBytes,status:result.status,outputFile})+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)cli(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});
