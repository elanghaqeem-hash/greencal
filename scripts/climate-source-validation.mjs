// GeoJSON hazard validation for bank-controlled licensed maps; never infer bank approval.
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {ingestIamcCsv} from './ngfs-iamc-adapter.mjs';

const HEX=/^[a-f0-9]{64}$/i;
const official={
 ngfs_iamc:new Set(['ngfs.net','www.ngfs.net','data.ene.iiasa.ac.at','www.iiasa.ac.at']),
 hazard_geojson:new Set(['gis.bnpb.go.id','inarisk.bnpb.go.id','gis.bmkg.go.id','www.bmkg.go.id'])
};
const required=(s,name,max=300)=>{if(typeof s!=='string'||!s.trim()||s.length>max)throw Error(name+' required.');return s.trim();};
const urlOfficial=(str,kind)=>{let u;try{u=new URL(str);}catch{throw Error('Official source URL must be valid');}if(u.protocol!=='https:'||u.username||u.password||u.hash||u.port&&u.port!=='443'||!official[kind]?.has(u.hostname))throw Error('Source host not in official allowlist.');return u.href;};
function ring(r){
 if(!Array.isArray(r)||r.length<4||r.length>10000)throw Error('Polygon ring is invalid.');
 for(const c of r){if(!Array.isArray(c)||c.length!==2||!Number.isFinite(c[0])||!Number.isFinite(c[1])||Math.abs(c[0])>180||Math.abs(c[1])>90)throw Error('Invalid WGS84 GeoJSON longitude-latitude coordinate');}
 if(r[0][0]!==r.at(-1)[0]||r[0][1]!==r.at(-1)[1])throw Error('Polygon ring must be closed.');
 const xs=r.map(c=>c[0]),ys=r.map(c=>c[1]);if(Math.max(...xs)-Math.min(...xs)<1e-10||Math.max(...ys)-Math.min(...ys)<1e-10)throw Error('Degenerate polygon');
}
function polygon(c){if(!Array.isArray(c)||c.length<1||c.length>50)throw Error('Polygon rings exceed expected data contract');for(const x of c)ring(x);}
export function validateGeoJsonSource(raw,config){
 if(typeof raw!=='string'||raw.length<2||raw.length>25_000_000)throw Error('GeoJSON must be 1..25MB of UTF8');
 if(!config||typeof config!=='object')throw Error('GeoJSON provenance manifest required');
 const sourceUrl=urlOfficial(config.sourceUrl,'hazard_geojson'),expected=required(config.expectedSha256,'approved geodata source SHA-256',64).toLowerCase();
 if(!HEX.test(expected))throw Error('Source SHA-256 invalid.');
 const actual=createHash('sha256').update(raw).digest('hex');if(actual!==expected)throw Error('GeoJSON bytes do not match approved checksum.');
 if(config.crs!=='EPSG:4326')throw Error('GeoJSON must be reprojected to WGS84 EPSG:4326 under approved GIS workflow.');
 const data=JSON.parse(raw);
 if(data.type!=='FeatureCollection'||!Array.isArray(data.features)||!data.features.length||data.features.length>500)throw Error('GeoJSON FeatureCollection 1..500 Polygon features required');
 for(const feature of data.features){
  if(feature.type!=='Feature'||!feature.geometry||typeof feature.properties!=='object'||feature.properties===null||Array.isArray(feature.properties))throw Error('Invalid GeoJSON Feature');
  const g=feature.geometry;
  if(g.type==='Polygon')polygon(g.coordinates);
  else if(g.type==='MultiPolygon'){if(!Array.isArray(g.coordinates)||g.coordinates.length<1||g.coordinates.length>200)throw Error('MultiPolygon count invalid');g.coordinates.forEach(polygon);}
  else throw Error('Raster, Point and LineString hazards require a separate validated renderer.');
  if(feature.id===undefined||!['string','number'].includes(typeof feature.id))throw Error('Stable hazard feature ID required for reproducibility');
 }
 return {kind:'hazard_geojson',sha256:actual,featureCount:data.features.length,sourceUrl,version:required(config.version,'Dataset version'),licenseReference:required(config.licenseReference,'Data license/permission reference',500),hazard:required(config.hazard,'Hazard type',120),crs:config.crs,provenanceStatus:'official_host_and_bytes_verified',businessApproval:'not_granted',modelApproval:'not_granted',financialLossModelApproved:false};
}
export function validateNgfsApprovedExtract(raw,selection){
 if(typeof raw!=='string'||raw.length>25_000_000)throw Error('NGFS CSV exceeds 25MB');
 urlOfficial(selection?.sourceUrl,'ngfs_iamc');
 const expected=required(selection.expectedSha256,'Expected NGFS whole-file SHA-256',64).toLowerCase();if(!HEX.test(expected))throw Error('NGFS hash invalid');
 const actual=createHash('sha256').update(raw).digest('hex');if(actual!==expected)throw Error('NGFS downloaded content hash differs from approved version.');
 const series=ingestIamcCsv(raw,selection);
 if(series.sourceFileSha256!==actual)throw Error('NGFS source changed during parse');
 return {kind:'ngfs_iamc',fileSha256:actual,sourceUrl:selection.sourceUrl,series,integrity:'verified_full_file_sha256',businessApproval:'not_granted',modelApproval:'not_granted',constraints:'NGFS scenario not probability-weighted forecast, physical-impact uncertainties need independent review'};
}
export async function cli(args){
 if(args.length!==4)throw Error('Usage: node scripts/climate-source-validation.mjs ngfs_iamc|hazard_geojson source.file approved-manifest.private.json result.private.json');
 const [kind,file,manifestFile,out]=args;
 const raw=await readFile(file,'utf8'),manifest=JSON.parse(await readFile(manifestFile,'utf8'));
 const result=kind==='ngfs_iamc'?validateNgfsApprovedExtract(raw,manifest):kind==='hazard_geojson'?validateGeoJsonSource(raw,manifest):(()=>{throw Error('Unsupported source type')})();
 await writeFile(out,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 process.stdout.write(JSON.stringify({kind,hash:result.sha256||result.fileSha256,status:'integrity_verified_not_bank_approved'})+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)cli(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});
