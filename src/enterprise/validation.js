import {ApiError} from './policy.js';
const bad=message=>{throw new ApiError(400,'INVALID_INPUT',message);};
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v);
export const text=(v,name,max=500)=>{if(typeof v!=='string'||!v.trim()||v.length>max)bad(name+' wajib diisi (maksimum '+max+' karakter).');return v.trim();};
const one=(v,choices,name)=>{if(!choices.includes(v))bad(name+' tidak valid.');return v;};
export const date=(v,name)=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)bad(name+' harus tanggal ISO yang valid.');return v;};
const url=v=>{let u;try{u=new URL(v);}catch{bad('URL sumber tidak valid.');}if(u.protocol!=='https:'||u.username||u.password||u.hash)bad('Sumber harus URL HTTPS tanpa kredensial.');return u.href;};
export function decimal(v,name){if(typeof v!=='string'||!/^\d{1,13}(\.\d{1,6})?$/.test(v))bad(name+' harus teks angka non-negatif, maksimum 13 digit dan 6 desimal.');return v.replace(/^0+(?=\d)/,'');}
const integer=(v,min,max,name)=>{if(!Number.isInteger(v)||v<min||v>max)bad(name+' di luar rentang.');return v;};
export function validatePayload(kind,p){
 if(!obj(p))bad('Payload harus objek.');
 // Only allowlisted fields survive validation; calculated fields and claimed approvals are discarded.
 if(kind==='risk')return {category:one(p.category,['physical','transition'],'Kategori'),sector:text(p.sector,'Sektor'),location:text(p.location,'Lokasi'),event:text(p.event,'Peristiwa',2000),cause:text(p.cause,'Penyebab',2000),transmission:text(p.transmission,'Transmisi',2000),impact:text(p.impact,'Dampak',2000),owner:text(p.owner,'Pemilik risiko'),likelihood:integer(p.likelihood,1,5,'Likelihood'),severity:integer(p.severity,1,5,'Impact'),controls:text(p.controls,'Kontrol',2000),mitigation:text(p.mitigation,'Mitigasi',2000),dueDate:date(p.dueDate,'Target'),scale:'bank-internal-5x5-v1',inherentScore:p.likelihood*p.severity};
 if(kind==='factor'){
  const start=date(p.effectiveFrom,'Berlaku mulai'),end=date(p.effectiveTo,'Berlaku sampai');if(start>end)bad('Rentang tanggal faktor terbalik.');
  return {value:decimal(p.value,'Faktor'),activityUnit:text(p.activityUnit,'Satuan aktivitas',40),factorUnit:'kgCO2e/activity-unit',sourceUrl:url(p.sourceUrl),sourceDocument:text(p.sourceDocument,'Dokumen sumber'),page:integer(p.page,1,100000,'Halaman'),methodology:text(p.methodology,'Metodologi',2000),geography:text(p.geography,'Wilayah'),effectiveFrom:start,effectiveTo:end,version:text(p.version,'Versi',80),gwpBasis:text(p.gwpBasis,'Basis GWP',200)};
 }
 if(kind==='emission')return {quantity:decimal(p.quantity,'Kuantitas'),activityUnit:text(p.activityUnit,'Satuan',40),activityDate:date(p.activityDate,'Tanggal aktivitas'),scope:one(p.scope,['scope1','scope2','scope3'],'Scope'),factorId:text(p.factorId,'ID faktor',80),evidence:text(p.evidence,'Referensi bukti',1000),branch:text(p.branch,'Cabang',200)};
 if(kind==='regulatory_document'){
  if(!/^[a-f0-9]{64}$/.test(p.sha256||''))bad('SHA-256 wajib 64 karakter heksadesimal.');
  const u=url(p.sourceUrl);if(!['ojk.go.id','www.ojk.go.id','iru.ojk.go.id'].includes(new URL(u).hostname))bad('Dokumen CRMS harus berasal dari domain resmi OJK.');
  return {book:integer(p.book,1,7,'Nomor buku'),officialTitle:text(p.officialTitle,'Judul resmi'),publicationDate:date(p.publicationDate,'Tanggal publikasi'),version:text(p.version,'Versi',80),sourceUrl:u,sha256:p.sha256,pageCount:integer(p.pageCount,1,100000,'Jumlah halaman'),verification:'declared-metadata-pending-source-review'};
 }
 if(kind==='requirement')return {documentId:text(p.documentId,'ID dokumen',80),chapter:text(p.chapter,'Bab'),section:text(p.section,'Bagian'),page:integer(p.page,1,100000,'Halaman'),requirement:text(p.requirement,'Persyaratan',4000),module:text(p.module,'Modul'),data:text(p.data,'Data',2000),businessRule:text(p.businessRule,'Aturan bisnis',4000),testCase:text(p.testCase,'Test case',2000),evidence:text(p.evidence,'Bukti',2000),implementationStatus:one(p.implementationStatus,['not_assessed','gap_identified','planned','in_development','implemented'],'Status implementasi'),acceptanceStatus:'not_validated'};
 if(kind==='governance'){
  const from=date(p.effectiveFrom,'Mulai berlaku'),review=date(p.reviewDate,'Tanggal review');
  if(review<from)bad('Tanggal review harus setelah mulai berlaku.');
  return {policyArea:one(p.policyArea,['strategy','risk_appetite','governance','sharia','disclosure'],'Area kebijakan'),owner:text(p.owner,'Pemilik kebijakan',200),riskAppetite:text(p.riskAppetite,'Kriteria / risk appetite',3000),controls:text(p.controls,'Pengendalian',3000),shariaConsiderations:text(p.shariaConsiderations,'Pertimbangan syariah',2000),approvalReference:text(p.approvalReference,'Referensi persetujuan internal',250),effectiveFrom:from,reviewDate:review,regulatoryStatus:'not_validated'};
 }
 if(kind==='portfolio'){
  const ead=decimal(p.ead,'EAD'),outstanding=decimal(p.outstanding,'Outstanding');
  if(!/^[A-Z]{3}$/.test(p.currency||''))bad('Mata uang harus kode ISO tiga huruf.');
  const asOf=date(p.asOf,'Tanggal posisi'),maturity=date(p.maturityDate,'Jatuh tempo');
  return {facilityRef:text(p.facilityRef,'Kode fasilitas anonim',120),obligorRef:text(p.obligorRef,'Kode debitur anonim',120),sector:text(p.sector,'Sektor/KBLI',200),region:text(p.region,'Wilayah',200),product:one(p.product,['murabahah','musyarakah','mudharabah','ijarah','sukuk','conventional_loan','other'],'Produk'),currency:p.currency,ead,outstanding,asOf,maturityDate:maturity,evidence:text(p.evidence,'Referensi sumber',1000),dataQuality:'operator_declared_pending_reconciliation'};
 }
 if(kind==='scenario'){
  return {framework:one(p.framework,['NGFS','IPCC','bank_internal'],'Sumber skenario'),scenarioName:text(p.scenarioName,'Nama skenario',200),vintage:text(p.vintage,'Rilis / vintage',80),pathway:text(p.pathway,'Pathway',200),horizonYear:integer(p.horizonYear,2025,2100,'Horizon'),sourceUrl:url(p.sourceUrl),sourceVersion:text(p.sourceVersion,'Versi data',120),assumptions:text(p.assumptions,'Asumsi dan satuan',4000),limitations:text(p.limitations,'Batasan',3000),modelReadiness:'metadata_only_not_validated'};
 }
 if(kind==='physical'){
  const hazardLevel=integer(p.hazardLevel,1,5,'Tingkat bahaya'),vulnerabilityLevel=integer(p.vulnerabilityLevel,1,5,'Tingkat kerentanan');
  return {portfolioId:text(p.portfolioId,'ID portofolio',80),scenarioId:text(p.scenarioId,'ID skenario',80),hazard:one(p.hazard,['flood','drought','heat','landslide','coastal','storm','wildfire','other'],'Jenis bahaya'),hazardSource:text(p.hazardSource,'Dataset/lokasi sumber',1000),hazardLevel,vulnerabilityLevel,mitigation:text(p.mitigation,'Resiliensi/mitigasi',2000),evidence:text(p.evidence,'Rujukan validasi',1000),screenScore:hazardLevel*vulnerabilityLevel,screeningMethod:'ordinal-5x5-screening-only-not-a-financial-loss-model'};
 }
 if(kind==='transition'){
  return {portfolioId:text(p.portfolioId,'ID portofolio',80),scenarioId:text(p.scenarioId,'ID skenario',80),driver:one(p.driver,['policy_legal','technology','market','reputation','mixed'],'Pendorong'),channel:text(p.channel,'Saluran transmisi',2000),carbonPrice:decimal(p.carbonPrice,'Asumsi harga karbon'),carbonPriceUnit:text(p.carbonPriceUnit,'Mata uang per tCO2e',80),shockAssumption:text(p.shockAssumption,'Asumsi dampak',3000),adaptation:text(p.adaptation,'Mitigasi transisi',2000),evidence:text(p.evidence,'Referensi asumsi',1000),financialImpact:'not_calculated_model_validation_required'};
 }
 if(kind==='report_package'){
  const start=date(p.periodStart,'Awal periode'),end=date(p.periodEnd,'Akhir periode');if(start>end)bad('Periode pelaporan terbalik.');
  return {periodStart:start,periodEnd:end,reportingBasis:one(p.reportingBasis,['management','internal_crms','ojk_mapping_draft'],'Basis laporan'),contentScope:text(p.contentScope,'Cakupan',2000),evidenceIndex:text(p.evidenceIndex,'Indeks bukti',4000),dataQualityIssues:text(p.dataQualityIssues,'Kesenjangan data',3000),modelLimitations:text(p.modelLimitations,'Batasan model',3000),reviewNote:text(p.reviewNote,'Catatan telaah',2000),submissionStatus:'internal_only_not_ojk_submission'};
 }
 bad('Jenis record tidak didukung.');
}
function scaled(s){const [whole,fraction='']=s.split('.');return BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));}
export function calculateEmission(input,factorRecord){
 if(factorRecord.status!=='approved'||factorRecord.kind!=='factor')bad('Faktor belum disetujui.');
 const factor=JSON.parse(factorRecord.payload);
 if(input.activityUnit!==factor.activityUnit)bad('Satuan aktivitas berbeda dari faktor; konversi implisit ditolak.');
 if(input.activityDate<factor.effectiveFrom||input.activityDate>factor.effectiveTo)bad('Faktor tidak berlaku pada tanggal aktivitas.');
 const product=scaled(input.quantity)*scaled(factor.value); // 10^12 kgCO2e; divide by 1000 => 10^15 tCO2e.
 const digits=product.toString().padStart(16,'0');
 const result=(digits.slice(0,-15)+'.'+digits.slice(-15)).replace(/\.?0+$/,'')||'0';
 return {...input,calculation:{engine:'activity-factor-kg-to-tonne-v1',formula:'quantity × factor_kgCO2e_per_activity_unit ÷ 1000',conversion:'1000 kgCO2e = 1 tCO2e',result,unit:'tCO2e',factorId:factorRecord.id,factorRevision:factorRecord.revision,factorSnapshot:factor,precision:'exact-decimal-inputs-6dp-product-15dp',regulatoryValidation:'not_validated'}};
}
export async function readJson(request){
 if((request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()!=='application/json')throw new ApiError(415,'CONTENT_TYPE','Gunakan application/json.');
 const reader=request.body?.getReader();if(!reader)bad('Body kosong.');
 const chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>32768){await reader.cancel();throw new ApiError(413,'PAYLOAD_TOO_LARGE','Payload maksimum 32 KiB.');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 let data;try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{bad('JSON tidak valid.');}if(!obj(data))bad('Body harus objek.');return data;
}
