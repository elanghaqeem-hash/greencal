// OJK CRMS 2026 internal conformance gate. Never infer regulatory PASS from CI, deploy or user claims.
const MATRIX=[
[1,'Tata kelola & strategi',[['B1_REQUIREMENTS','Pemetaan ketentuan resmi per halaman disetujui'],['B1_GOVERNANCE','Governance, strategi, risk appetite dan disclosure disetujui Bank'],['B1_UAT','UAT tata kelola dan tiga lini pertahanan lulus']]],
[2,'Metodologi CRSA',[['B2_REQUIREMENTS','Seluruh rumus dan metodologi tervalidasi'],['B2_TRANSMISSION','PD, LGD, EAD, CKPN, ATMR, pasar dan likuiditas direkonsiliasi'],['B2_SCENARIOS','Skenario dan penyesuaian BUS/UUS/Buk diuji'],['B2_VALIDATION','Backtesting dan validator model independen menerima hasil']]],
[3,'Emisi & financed emissions',[['B3_FORMULAS','Seluruh 6.900 formula dari 35 worksheet cocok'],['B3_FACTORS','Faktor emisi, GWP, sumber, tahun, unit dan wilayah disetujui'],['B3_PCAF','Scope 1–3 dan attribution PCAF direkonsiliasi dengan portofolio']]],
[4,'Data makroekonomi',[['B4_TABLES','Seluruh tabel resmi Buku 4 dibandingkan sumber'],['B4_NGFS','NGFS, vintage, unit dan skenario disetujui'],['B4_MODELS','Transmisi parameter makro ke risiko bank diuji']]],
[5,'Risiko fisik',[['B5_ANNEXES','Kedua XLSX resmi dan skor risiko fisik direkonsiliasi'],['B5_EXCEPTIONS','Duplikasi data dan kode pos ambigu telah diputuskan reviewer'],['B5_GEO','Lokasi agunan, overlay, PD/LGD/CKPN tervalidasi'],['B5_DATABASE','Dataset terverifikasi telah diaktifkan di database bank']]],
[6,'Kertas kerja OJK',[['B6_WORKBOOK','Template resmi XLSX sel biru, formula dan struktur dipetakan'],['B6_COVERAGE','Seluruh bagian A–I dan bukti lengkap'],['B6_PARITY','Export/roundtrip sama dengan workbook asli'],['B6_RECON','CBS/GL/CKPN dan data laporan direkonsiliasi Bank']]],
[7,'Pendekatan standar',[['B7_PRECISION','Dua lampiran workbook presisi penuh terverifikasi'],['B7_FORMULAS','Semua contoh dan formula OJK cocok, anomali sumber terselesaikan'],['B7_CALIBRATION','PD/LGD, pasar, LCR dan KPMM terkalibrasi'],['B7_VALIDATION','Model independen dan hasil akhir masuk Buku 6']]]
];
export const OJK_2026_BOOK_CONTROLS=Object.freeze(MATRIX.map(([book,title,items])=>Object.freeze({book,title,controls:Object.freeze(items.map(([id,description])=>Object.freeze({id,description})))})));
export const OJK_2026_GLOBAL_CONTROLS=Object.freeze([
['INSTITUTION_SSO','Identitas institusi, keanggotaan dan akses disetujui'],
['BANK_DATA','Portofolio CBS/GL/CKPN tersambung serta direkonsiliasi'],
['BANK_UAT','Pengujian end-to-end dan keamanan Bank lulus'],
['DR_BACKUP','Backup/restore serta RTO/RPO bank diverifikasi'],
['SIGNED_RELEASE','Risk, Finance, Compliance, TI dan validator model independen menyetujui']
].map(([id,description])=>Object.freeze({id,description})));
const HASH=/^[a-f0-9]{64}$/;
const verified=(a,id)=>a?.controlId===id&&a.status==='verified'&&a.scope==='bank_production'&&
 typeof a.sourceSha256==='string'&&HASH.test(a.sourceSha256)&&
 typeof a.evidenceSha256==='string'&&HASH.test(a.evidenceSha256)&&
 Array.isArray(a.reviewerSubjects)&&a.reviewerSubjects.length>=2&&
 new Set(a.reviewerSubjects).size===a.reviewerSubjects.length&&
 a.reviewerSubjects.every(s=>typeof s==='string'&&s.trim()&&!s.startsWith('SYNTHETIC'))&&
 typeof a.verifiedAt==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(a.verifiedAt)&&
 Number.isFinite(Date.parse(a.verifiedAt))&&a.officialSourceVerified===true&&a.bankApproved===true;
// Attestations MUST originate from verified server-side reviewer and source registries,
// never browser requests, synthetic users, environment feature flags, or plain JSON claims.
export function evaluateOjk2026({attestations=[],bankReleaseAuthorized=false,verifyAttestation=()=>false,verifyBankRelease=()=>false}={}){
 if(!Array.isArray(attestations))throw new TypeError('Attestation collection must be server verified');
 const byId=new Map();
 for(const a of attestations)if(a&&typeof a.controlId==='string')byId.set(a.controlId,[...(byId.get(a.controlId)||[]),a]);
 const check=c=>{const items=byId.get(c.id)||[];return {...c,verified:items.length===1&&verified(items[0],c.id)&&verifyAttestation(items[0])===true};};
 const books=OJK_2026_BOOK_CONTROLS.map(b=>{
  const controls=b.controls.map(check),verifiedCount=controls.filter(c=>c.verified).length;
  return {book:b.book,title:b.title,status:verifiedCount===controls.length?'PASS':verifiedCount?'PARTIAL':'NOT_VERIFIED',
   verified:verifiedCount,total:controls.length,controls};
 });
 const global=OJK_2026_GLOBAL_CONTROLS.map(check);
 const pass=books.every(b=>b.status==='PASS')&&global.every(c=>c.verified)&&bankReleaseAuthorized===true&&verifyBankRelease()===true;
 return {framework:'OJK CRMS Perbankan 2026',status:pass?'PASS':'NOT_READY',
  officialOjkCertification:false,bankProductionReady:pass,books,global,
  counts:{booksPassed:books.filter(b=>b.status==='PASS').length,booksTotal:7,
   controlsVerified:books.reduce((n,b)=>n+b.verified,0),controlsTotal:books.reduce((n,b)=>n+b.total,0),
   globalVerified:global.filter(c=>c.verified).length,globalTotal:global.length},
  note:'PASS adalah gate internal yang terverifikasi, bukan sertifikasi/persetujuan OJK. Deploy READY bukan regulatory PASS.'};
}
export function publicOjkReadiness(){
 return {...evaluateOjk2026(),assessmentBasis:'DOCUMENTED_GAPS_ONLY',evidenceAvailableInProduction:false,
  book3Reconciliation:{worksheets:35,formulasTotal:6900,independentlyRecalculated:249,notRecalculated:6651},
  knownCriticalBlocks:['Buku 3: 6.651 formula belum direkalkulasi',
   'Buku 5: pengecualian dan dataset sumber belum disetujui Bank',
   'Buku 6: workbook resmi belum terbukti parity sel/formula',
   'Buku 7: parameter dari workbook presisi penuh belum disahkan',
   'SSO institusi, sumber portofolio, validasi model dan sign-off Bank belum lengkap']};
}
