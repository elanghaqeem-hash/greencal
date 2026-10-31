// Buku 6 Kertas Kerja CRMS Perbankan OJK 2026 — internal workpaper schema.
// Source: user-supplied OJK Buku 6 pp. 5-6, 8-20, 24-37, 42, 46, 50-57, 62, 66-69.
// The separate original OJK .xlsx template is NOT included. Never claim workbook parity.
import {ApiError} from './policy.js';
const fail=message=>{throw new ApiError(400,'BOOK6_INVALID_INPUT',message);};
const text=(v,max=1000)=>typeof v==='string'&&v.trim().length>0&&v.length<=max?v.trim():fail('Teks wajib diisi dan tidak boleh melebihi '+max+' karakter.');
const opt=(v,max=200)=>v==null||v===''?'':text(v,max);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const pad=(a,n)=>[...a,...Array(Math.max(0,n-a.length)).fill('Lihat pertanyaan asli pada Buku 6')];
const groups=[
 ['Panduan Umum','Panduan Umum',14,[
 'Pengawasan Direksi/Dewan Komisaris dan penanggung jawab risiko iklim','Pemahaman Direksi tentang risiko iklim','Integrasi tiga lini pertahanan','Integrasi risiko iklim ke strategi bisnis','Persetujuan Direksi atas kerangka risiko iklim','Pengembangan data, alat, dan metodologi','Integrasi penilaian risiko iklim ke keseluruhan risiko Bank','Pemantauan dan pengendalian konsentrasi risiko fisik/transisi','Transmisi risiko iklim pada jenis risiko bank','Rencana transisi dan perubahan model bisnis','Desain skenario dan penilaian ketahanan bisnis','Relevansi, horizon, dan proporsionalitas skenario','Pengungkapan keuangan berkelanjutan','Rencana implementasi, target, realisasi dan persetujuan'
 ]],
 ['A.1.1','Umum',10,[
 'Ruang lingkup partisipasi dan tingkat penerapan CRSA','Pilihan skenario, spesifikasi dan horizon','Cakupan perspektif kredit, likuiditas, dan pasar','Kecukupan waktu penyampaian CRMS','Kerja sama pihak ketiga','Dampak pada kelayakan kredit dan rebalancing portofolio','Portofolio investasi dan strategi rebalancing','LCR/Loan to Deposit dan strategi pendanaan','Strategi stabilitas simpanan','Pemakaian CRMS dalam strategi bisnis'
 ]],
 ['A.1.2','Tantangan dan Mitigasi',4,[
 'Standardisasi estimasi risiko iklim segmen UMKM','Kesenjangan data, alat, dan strategi mitigasi','Kualitas/kedalaman data portofolio pasar termasuk reksa dana','Estimasi dampak arus kas iklim terhadap likuiditas'
 ]],
 ['A.1.3','Skenario',1,['Kecukupan variabel iklim, makroekonomi, dan keuangan']],
 ['A.1.4','Ruang Lingkup',3,['Pertimbangan kelompok usaha di luar negeri','Pengelompokan sektor non-carbon intensive','Cakupan portofolio CRSA dan usulan penyempurnaan']],
 ['A.1.5','Data dan Metodologi',12,[
 'Usulan sumber data eksternal','Usulan bahaya iklim lain di Indonesia','Penggunaan solusi metode Buku 7','Usulan dataset/proyeksi dan metodologi bank','Perbedaan usaha, lokasi, dan kapasitas debitur','Penggabungan risiko transisi dan fisik serta korelasi','Metodologi emisi portofolio properti','Penilaian mitigasi dan adaptasi debitur','Neraca statis/dinamis jangka pendek','Neraca statis/dinamis jangka panjang','Rencana pengembangan model kuantitatif','Metodologi model di luar Buku 7'
 ]],
 ['A.2.1','Tata Kelola',6,[
 'Struktur organisasi/tupoksi dan kebijakan pengawasan iklim','Kompetensi Direksi','Frekuensi pelaporan kepada Direksi dan Komisaris','Pertimbangan iklim dalam keputusan strategis dan trade-off','Penetapan target dan pemantauan termasuk remunerasi','Delegasi tanggung jawab dan komite'
 ]],
 ['A.2.2','Strategi',3,[
 'Dampak pada model bisnis dan value chain','Respons strategi, rencana transisi dan target emisi','Ketahanan strategi dan model bisnis terhadap iklim'
 ]],
 ['A.2.3','Manajemen Risiko',5,[
 'Dampak kondisi keuangan dan arus kas lintas horizon','Proses identifikasi, penilaian, prioritisasi, dan sumber data','Pelatihan dan pengembangan kompetensi pegawai','Kolaborasi dengan pakar/industri','Integrasi risiko iklim ke manajemen risiko menyeluruh'
 ]],
 ['A.3.1','Pengungkapan — Tata Kelola',2,['Manfaat pengungkapan dalam transparansi risiko','Standar internasional acuan pengungkapan']],
 ['A.3.2','Pengungkapan — Strategi',8,[
 'Kegunaan persyaratan kuantitatif','Metrik alternatif paparan iklim','Financed emissions sektoral sebagai indikator transisi','Pengungkapan risiko transisi tambahan','NPL dan pencadangan sektor terpapar','Proyeksi jangka pendek/panjang','Kegunaan informasi proyeksi','Tahapan pengungkapan'
 ]],
 ['A.3.3','Pengungkapan — Manajemen Risiko',6,[
 'Tantangan pengungkapan risiko kredit','Metrik tambahan selain NPL/CKPN','Tantangan pengungkapan konsentrasi iklim','Manfaat perincian bahaya fisik','Kegunaan struktur template','Keterbandingan antarbanks'
 ]],
 ['A.3.4','Pengungkapan — Metrik dan Target',7,[
 'Kegiatan yang perlu diungkap secara kuantitatif','Tantangan utama pengungkapan kuantitatif','Kualitas data sektor/aktivitas/wilayah/debitur','Peran pihak ketiga dalam financed emissions','Paparan risiko fisik sebagai indikator','Alternatif klasifikasi geografi rentan','Parameter pengungkapan risiko fisik tambahan'
 ]]
];
export const BOOK6_QUESTIONS=Object.freeze(groups.flatMap(([prefix,title,count,items])=>
 pad(items,count).slice(0,count).map((topic,i)=>Object.freeze({id:prefix+'.'+(i+1),group:prefix,groupTitle:title,topic,officialText:false}))));
export const BOOK6_SECTORS=Object.freeze([
 ['NR1','Pertanian, Kehutanan, dan Perikanan'],
 ['NR2','Pertambangan dan Penggalian'],
 ['NR3','Pengadaan Listrik, Gas, Uap/Air Panas, dan Udara Dingin'],
 ['NR4','Konstruksi'],
 ['NR5','Transportasi dan Pergudangan'],
 ['NR6','Industri Pengolahan'],
 ['NR7','Selain Sektor 1 s.d. 6'],
 ['R1','Kredit/Pembiayaan Konsumtif Kepemilikan Properti'],
 ['R2','Ritel Lainnya']
].map(([code,name])=>Object.freeze({code,name})));
export const BOOK6_SCENARIOS=Object.freeze({C:'Net Zero 2050',D:'Delayed Transition',E:'Current Policies'});
export const BOOK6_PERIODS=Object.freeze({B:['t','t+1','t+2','t+3'],C:['t','t+1','t+2','t+3','2030','2040','2050'],D:['t','t+1','t+2','t+3','2030','2040','2050'],E:['t','t+1','t+2','t+3','2030','2040','2050'],F:['baseline','climate'],G:['t+1','2030'],H:['t'],I:['t']});
const spec=(id,sections,unit,dimensions=[],additive=false)=>({id,sections,unit,dimensions,additive});
export const BOOK6_METRICS=Object.freeze([
 spec('scope1',['B'],'tCO2e',['sector']),spec('scope2',['B'],'tCO2e',['sector']),spec('scope3',['B'],'tCO2e',['sector']),
 spec('financed_emissions',['B'],'tCO2e',['sector']),spec('financed_share',['B'],'pct',['sector']),
 spec('debtor_assets',['B'],'million_idr',['sector']),spec('projected_emissions_2050',['B'],'tCO2e',['sector']),
 spec('ead_by_tenor',['B'],'million_idr',['sector','tenor'],true),spec('weighted_maturity',['B'],'years',['sector']),
 spec('ckpn',['B','C','D','E'],'million_idr',['sector'],true),spec('interest_income',['B','C','D','E'],'million_idr',['sector'],true),
 spec('credit_rwa',['B','C','D','E'],'million_idr',['sector'],true),spec('pd',['B','C','D','E'],'pct',['sector']),
 spec('lgd',['B','C','D','E'],'pct',['sector']),spec('outstanding',['B','C','D','E'],'million_idr',['sector','stage'],true),
 spec('bond_exposure',['B'],'million_idr',['instrument','currency'],true),spec('market_capital_charge',['B','C','D','E'],'million_idr',['riskClass'],true),
 spec('market_rwa',['B','C','D','E'],'million_idr',['riskClass'],true),
 spec('collateral_physical_postshock',['C','D','E'],'million_idr',['districtCode'],true),
 spec('collateral_transition_postshock',['C','D','E'],'million_idr',['collateralUse'],true),
 spec('collateral_transition_cre_rre',['C','D','E'],'million_idr',['propertyClass','sizeBand'],true),
 spec('top10_counterparty_credit',['C','D','E'],'million_idr',['sector','counterpartyRef','measure'],true),
 spec('bond_fair_value_change',['C','D','E'],'million_idr',['instrument','currency'],true),
 spec('total_capital',['C','D','E'],'million_idr',[],true),spec('other_rwa',['C','D','E'],'million_idr',[],true),
 spec('car',['C','D','E'],'pct',[]),
 spec('lcr_component',['F'],'million_idr',['lcrComponent'],true),spec('lcr',['F'],'pct',[]),
 spec('loan_to_deposit_component',['F'],'million_idr',['ltdComponent'],true),spec('loan_to_deposit',['F'],'pct',[]),
 spec('operational_transition_cost',['G'],'million_idr',['expenseType'],true),
 spec('operational_physical_loss',['G'],'million_idr',['assetType'],true),
 spec('bond_position',['H'],'million_idr',['instrument'],true)
].map(Object.freeze));
export const BOOK6_BOND_FIELDS=Object.freeze(['isin','name','issuerType','rating','maturityDate','couponRate','couponFrequency','acquisitionValue','marketValue','kbli','currency','accountingClass','hqlaClass']);
const metricMap=new Map(BOOK6_METRICS.map(m=>[m.id,m])), questionSet=new Set(BOOK6_QUESTIONS.map(q=>q.id)),sectorSet=new Set(BOOK6_SECTORS.map(s=>s.code));
export function book6Catalog(){return {version:'ojk-crms-book6-2026-internal-v1',source:'OJK Buku 6 2026',officialWorkbookAvailable:false,templateParity:'unverified',questions:BOOK6_QUESTIONS,sectors:BOOK6_SECTORS,scenarios:BOOK6_SCENARIOS,periods:BOOK6_PERIODS,metrics:BOOK6_METRICS,bondFields:BOOK6_BOND_FIELDS,officialSubmission:false};}
export function validateBook6Draft(body){
 if(!object(body))fail('Dokumen harus berupa objek.');
 const y=body.reportingYear;if(!Number.isInteger(y)||y<2026||y>2050)fail('Tahun laporan tidak valid.');
 if(!object(body.bank))fail('Informasi bank wajib objek.');
 const bank={code:text(body.bank.code,40),name:text(body.bank.name,200),picName:text(body.bank.picName,150),picTitle:text(body.bank.picTitle,150),picEmail:text(body.bank.picEmail,200),picPhone:text(body.bank.picPhone,60)};
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bank.picEmail))fail('Email PIC tidak valid.');
 if(!object(body.answers||{}))fail('Jawaban harus objek.');
 const answers={};for(const [id,value] of Object.entries(body.answers||{})){
  if(!questionSet.has(id))fail('Kode pertanyaan tidak dikenal: '+id);
  if(!object(value))fail('Jawaban harus mencakup teks dan referensi bukti.');
  const response=opt(value.text,8000),evidence=value.evidence||[];
  if(!Array.isArray(evidence)||evidence.length>10)fail('Jumlah referensi bukti tidak valid.');
  answers[id]={text:response,evidence:evidence.map(v=>text(v,500))};
 }
 const data=body.figures||[];if(!Array.isArray(data)||data.length>10000)fail('Maksimum 10.000 baris angka.');
 const figures=[],unique=new Set();
 for(const r of data){
  if(!object(r)||!Object.hasOwn(BOOK6_PERIODS,r.section))fail('Bagian angka tidak valid.');
  const m=metricMap.get(r.metric);if(!m||!m.sections.includes(r.section))fail('Metrik tidak sesuai bagian Buku 6.');
  if(!BOOK6_PERIODS[r.section].includes(r.period))fail('Horizon angka tidak sesuai bagian.');
  if(!object(r.dimensions||{}))fail('Dimensi harus objek.');
  const dimensions={};for(const [k,v] of Object.entries(r.dimensions||{})){
   if(!m.dimensions.includes(k))fail('Dimensi tidak sesuai metrik.');
   dimensions[k]=text(v,120);
   if(k==='sector'&&!sectorSet.has(dimensions[k]))fail('Kode sektor tidak dikenal.');
  }
  if(m.dimensions.some(k=>!Object.hasOwn(dimensions,k)))fail('Dimensi wajib belum terisi.');
  const value=r.value;
  if(typeof value!=='string'||!/^[-]?\d{1,17}(\.\d{1,6})?$/.test(value))fail('Nilai harus angka string tepat, maksimum 17 integer dan 6 desimal.');
  if(value.startsWith('-')&&!['bond_fair_value_change'].includes(r.metric))fail('Nilai negatif hanya boleh untuk perubahan harga surat berharga.');
  if(m.unit==='pct'&&['pd','lgd','financed_share'].includes(r.metric)&&Number(value)>100)fail('PD, LGD dan persentase dibiayai maksimum 100%.');
  if(r.section==='G'&&r.metric==='operational_transition_cost'&&r.period!=='t+1')fail('Risiko operasional transisi hanya diproyeksikan pada t+1.');
  if(r.metric==='top10_counterparty_credit'&&!['NR1','NR2','NR3','NR4','NR5','NR6'].includes(dimensions.sector))fail('Top 10 counterparty hanya untuk enam sektor nonritel.');
  if(Object.hasOwn(dimensions,'stage')&&!['1','2','3','PL','NPL'].includes(dimensions.stage))fail('Stage/kolektibilitas tidak valid.');
  const sourceReference=text(r.sourceReference,250),sourceSha256=text(r.sourceSha256,64);
  if(!/^[a-f0-9]{64}$/.test(sourceSha256))fail('SHA-256 sumber diperlukan pada setiap angka.');
  const key=[r.section,r.metric,r.period,JSON.stringify(Object.entries(dimensions).sort())].join('|');
  if(unique.has(key))fail('Baris angka duplikat.');unique.add(key);
  figures.push({section:r.section,metric:r.metric,period:r.period,dimensions,value,sourceReference,sourceSha256,modelRunId:opt(r.modelRunId,80)});
 }
 if(!Array.isArray(body.bonds||[])||(body.bonds||[]).length>10000)fail('Portofolio obligasi tidak valid.');
 const bonds=(body.bonds||[]).map(b=>{
  if(!object(b))fail('Data obligasi harus objek.');
  const out={};for(const k of BOOK6_BOND_FIELDS)out[k]=text(b[k],k==='name'?200:120);
  if(!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(out.isin))fail('ISIN obligasi tidak valid.');
  if(!['AC','FVOCI','FVTPL'].includes(out.accountingClass))fail('Klasifikasi akuntansi obligasi tidak valid.');
  return out;
 });
 const sanitized={schema:'greencal-book6-draft-v1',reportingYear:y,bank,answers,figures,bonds,methodologyNotes:opt(body.methodologyNotes,5000),executiveSummary:opt(body.executiveSummary,10000)};
 if(JSON.stringify(sanitized).length>1700000)fail('Dokumen terlalu besar.');
 return sanitized;
}
export function book6Preview(doc){
 const answered=BOOK6_QUESTIONS.filter(q=>doc.answers[q.id]?.text).length;
 const sections=Object.keys(BOOK6_PERIODS).map(section=>({section,figures:doc.figures.filter(f=>f.section===section).length}));
 const warnings=[];
 if(answered<BOOK6_QUESTIONS.length)warnings.push('Tanggapan kualitatif belum lengkap: '+answered+'/'+BOOK6_QUESTIONS.length+'.');
 for(const s of sections)if(s.figures===0&&s.section!=='I')warnings.push('Tidak ada angka yang dicatat untuk Bagian '+s.section+'.');
 if(!doc.bonds.length)warnings.push('Bagian H belum memiliki inventaris obligasi; konfirmasi status nil/exposure dengan bank.');
 warnings.push('Sumber SHA-256 hanya deklarasi pengguna; belum diverifikasi ke dokumen/GL asli.');
 warnings.push('Workbook .xlsx OJK asli belum tersedia: struktur sel, rumus dan integritas format tidak bisa dinyatakan cocok.');
 return {questionCount:BOOK6_QUESTIONS.length,answeredCount:answered,sectionCounts:sections,warnings,officialSubmission:false,templateParity:'unverified',readyForBankUse:false};
}
