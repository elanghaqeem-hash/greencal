/* GreenCal protected analytics console. Volatile input fields only; no sensitive client persistence. */
(()=>{'use strict';
const specs={
 source_control:{name:'Daftar kontrol sumber CBS/GL lengkap',role:['data_maker'],url:'/analytics/sources',kind:null,help:'Langkah pertama: daftarkan SHA-256 sumber, total GL penuh, dan jumlah fasilitas sebelum mengimpor batch.',fields:['sourceSha256','asOf','currency','sourceSystem','glControlTotal','glControlCount','controlReference']},
 portfolio_import:{name:'Portofolio PCAF · impor dan rekonsiliasi',role:['data_maker'],url:'/analytics/import',kind:null,help:'Gunakan batch JSON anonim hasil adapter CBS/GL. Wajib control total dan checksum berkas sumber.',fields:['asOf','currency','sourceSha256','sourceSystem','glControlTotal','glControlCount','controlReference','exposures']},
 ngfs_interpolation:{name:'Skenario NGFS · deret waktu',role:['climate_model_analyst'],url:'/analytics/runs',kind:'ngfs_interpolation',help:'Masukkan seri resmi yang diunduh dengan izin dan metadata vintage, model, region, variabel, satuan.',fields:['scenario','model','region','variable','unit','vintage','sourceSha256','year','points']},
 geospatial_overlay:{name:'Risiko fisik · overlay geospasial',role:['risk_analyst','climate_model_analyst'],url:'/analytics/runs',kind:'geospatial_overlay',help:'Koordinat WGS84 [longitude,latitude] dan GeoJSON Polygon tersumber; tidak menghitung kerugian.',fields:['facilityRef','coordinates','hazard','hazardScore','hazardName','dataset','datasetVersion','datasetSha256']},
 physical_damage:{name:'Risiko fisik · kurva kerusakan aset',role:['risk_analyst','climate_model_analyst'],url:'/analytics/advanced/runs',kind:'physical_damage',help:'Kurva hazard dan persentase kerusakan harus berasal dari model yang dikalibrasi bank.',fields:['assetRef','hazard','hazardIntensity','assetValue','currency','vulnerabilityFraction','mitigationFraction','curve','datasetSha256','curveApprovalReference']},
 credit_transmission:{name:'PD/LGD/EAD · sensitivitas satu periode',role:['risk_analyst','climate_model_analyst'],url:'/analytics/runs',kind:'credit_transmission',help:'Perubahan PD/LGD/EAD bersumber dari kalibrasi, bukan dari prediksi tanpa data.',fields:['basePD','baseLGD','baseEAD','pdDelta','lgdDelta','eadDelta','deltaNetIncome','deltaOperatingCost','currency','modelReference','scenarioReference']},
 lifetime_ecl:{name:'PSAK 71 · sensitivitas ECL multi-periode',role:['risk_analyst','climate_model_analyst'],url:'/analytics/advanced/runs',kind:'lifetime_ecl',help:'Stage 1 = 12 bulan, Stage 2 = lifetime. Stage 3 sengaja ditolak tanpa recovery model tervalidasi.',fields:['stage','facilityRef','currency','eir','sourceSha256','modelApprovalReference','scenarios']},
 capital_bridge:{name:'Dampak laba, ATMR dan CAR',role:['risk_analyst'],url:'/analytics/advanced/runs',kind:'capital_bridge',help:'Menguji pergerakan keuangan; bukan CAR/ATMR regulator sampai dikalibrasi Finance/Risk.',fields:['currency','openingCapital','openingRwa','openingProfit','incrementalEcl','deltaNii','deltaOpex','rwaDelta','otherCapitalDelta','effectiveTaxRate','financeControlReference']},
 source_manifest:{name:'Manifest integrasi CBS, GL, GIS, CKPN',role:['data_maker'],url:'/analytics/advanced/runs',kind:'source_manifest',help:'Mencatat hash dan control total sumber yang dinyatakan. Belum menggantikan verifikasi koneksi langsung.',fields:['entries']},
 book7_standardized:{name:'Buku 7 · simulasi pendekatan standar',role:['climate_model_analyst'],url:'/analytics/runs',kind:'book7_standardized',help:'Khusus kalkulasi internal. Formula/koefisien resmi OJK 2026 masih memerlukan verifikasi.',fields:['components']},
 book7_annex_lookup:{name:'Lampiran Buku 7 · Cari scalar/parameter per bucket',role:['data_maker','risk_analyst','climate_model_analyst'],url:'/analytics/runs',kind:'book7_annex_lookup',help:'Parameter publikasi PDF empat desimal (BUKAN workbook presisi penuh). Tabel: A.3 PD produktif, A.5 haircut, A.6 LGD transisi, A.7 biaya CRE/RRE, A.8 rating, B.2 sovereign, B.3 Fed Funds, B.5 obligasi korporasi, C.2 LCR. Pilih kombinasi persis skenario/tahun/size/sector/locationRisk/rating atau granularRating.',fields:['table','scenario','year','size','locationRisk','sector','rating','collateralKind','propertyType','sizeBand','euiClass','granularRating']},
 book7_annex_stress:{name:'Lampiran Buku 7 · Kalkulasi otomatis dengan scalar PDF',role:['risk_analyst','climate_model_analyst'],url:'/analytics/runs',kind:'book7_annex_stress',help:'Pilih tabel A.3/B.2/B.5 untuk PD, A.5/A.6/A.7 untuk agunan, C.2 untuk shock LCR, B.3 untuk RF rate. Hasil internal menggunakan nilai PDF yang dibulatkan. Masukkan input bank terotorisasi, tanpa nama debitur.',fields:['table','scenario','year','size','locationRisk','sector','rating','collateralKind','propertyType','sizeBand','euiClass','baselinePD','collateralValue','balance','baselineRate','component']},
 book7_mapping:{name:"Buku 7 · Pemetaan KBLI, ukuran usaha, risiko kecamatan",role:["data_maker","climate_model_analyst"],url:'/analytics/runs',kind:"book7_mapping",help:"Buku 7 Tabel 1–3. Penjualan/aset dalam IDR string; KBLI crosswalk harus diverifikasi; skor lokasi dari Buku 5.",fields:['scenario','year','sourceReference','sourceSha256',"kbliCode","sectorGroup","sectorMappingReference","annualSales","totalAssets","locationDistrict","impactScore" ]},
 book7_productive_pd:{name:"Buku 7 · PD produktif × skalar tahunan",role:["risk_analyst","climate_model_analyst"],url:'/analytics/runs',kind:"book7_productive_pd",help:"PD term structure per tahun. Skalar resmi harus diimpor dari Lampiran 1, bukan diperkirakan.",fields:['scenario','year','sourceReference','sourceSha256',"periods" ]},
 book7_retail_npl:{name:"Buku 7 · NPL KPR / konsumer berdasarkan makro",role:["risk_analyst","climate_model_analyst"],url:'/analytics/runs',kind:"book7_retail_npl",help:"Pilih product kpr atau other_consumer; pertumbuhan GDP/konsumsi diisi sebagai fraksi dengan lag terverifikasi.",fields:['scenario','year','sourceReference','sourceSha256',"product","previousQuarterNplRate","laggedDeltaNplGrowth","deltaGdpGrowth","laggedDeltaConsumptionGrowth" ]},
 book7_collateral_lgd:{name:"Buku 7 · LGD agunan fisik dan biaya transisi",role:["risk_analyst","climate_model_analyst"],url:'/analytics/runs',kind:"book7_collateral_lgd",help:"Pilih collateralKind cre_rre atau non_cre_rre; transitionCost untuk CRE, transitionScalar untuk non-CRE. Parameter resmi Lampiran 1.",fields:['scenario','year','sourceReference','sourceSha256',"collateralKind","collateralValue","ead","baselineLGD","physicalHaircut","transitionCost","transitionScalar" ]},
 book7_frye_jacobs:{name:"Buku 7 · LGD non-fisik / tanpa agunan Frye–Jacobs",role:["risk_analyst","climate_model_analyst"],url:'/analytics/runs',kind:"book7_frye_jacobs",help:"Korelasi OJK menurut assetClass corporate/sme/mortgage/credit_card/other_consumer. Pihak penanggung risiko anonim wajib.",fields:['scenario','year','sourceReference','sourceSha256',"assetClass","ttcPD","adjustedPitPD","baselineLGD","riskBearerType","riskBearerRef" ]},
 book7_npl:{name:"Buku 7 · NPL produktif proporsional PD",role:["risk_analyst","climate_model_analyst"],url:'/analytics/runs',kind:"book7_npl",help:"Buku 7 §2.4; perubahan NPL mengikuti PD dan tidak boleh melebihi kredit.",fields:['scenario','year','sourceReference','sourceSha256',"baselinePD","adjustedPD","baselineNpl","totalLoans" ]},
 book7_ckpn:{name:"Buku 7 · CKPN Stage 1/2/3 berbasis PD dan LGD",role:["risk_analyst","climate_model_analyst"],url:'/analytics/runs',kind:"book7_ckpn",help:"Stage 2 butuh seluruh sisa tenor. Stage 3 LGD saja. Bukan jurnal atau PSAK71 tanpa validasi Finance.",fields:['scenario','year','sourceReference','sourceSha256',"stage","baselineCKPN","remainingYears","periods" ]},
 book7_market:{name:"Buku 7 · Credit spread, yield, CS01/PV01",role:["risk_analyst","climate_model_analyst"],url:'/analytics/runs',kind:"book7_market",help:"CS01/PV01 bertanda negatif dari pricing engine Bank dan didefinisikan per unit yield.",fields:['scenario','year','sourceReference','sourceSha256',"baselinePD","adjustedPD","baselineLGD","adjustedLGD","marketYield","rfShock","cs01SignedPerUnitYield","pv01SignedPerUnitYield" ]},
 book7_liquidity:{name:"Buku 7 · Climate-adjusted LCR",role:["risk_analyst","climate_model_analyst"],url:'/analytics/runs',kind:"book7_liquidity",help:"Input LCR bank setelah pembatasan HQLA dan inflow. Buku 7 §4; LDR tetap perlu Buku 6.",fields:['scenario','year','sourceReference','sourceSha256',"baselineHqla","baselineOutflows","baselineInflows","hqlaSecurityChanges","corporateDeposits","undrawnCommitments","cashInflows" ]},
 book7_capital:{name:"Buku 7 · Tier 1, Tier 2, ATMR, KPMM",role:["risk_analyst","climate_model_analyst"],url:'/analytics/runs',kind:"book7_capital",help:"Addback Tier 2 dan ATMR harus disahkan Finance/Risk; output bukan pelaporan regulator.",fields:['scenario','year','sourceReference','sourceSha256',"baselineCapital","effectiveTaxRate","creditPretaxProfitImpact","fvtplMarketValueChange","fvociMarketValueChange","eligibleTier2Addback","adjustedCreditRwa","adjustedMarketRwa","otherRwa" ]},
 ojk_reconciliation:{name:'Buku 6 · pratinjau rekonsiliasi',role:['compliance_reviewer'],url:'/analytics/runs',kind:'ojk_reconciliation',help:'Gunakan ID batch tersimpan. Output internal, bukan format dokumen resmi atau submission.',fields:['batchId']}
};
const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
const download=(name,value)=>{const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);};
function table(root,head,rows){const wrap=el('div',undefined,'tableWrap'),t=el('table'),thead=el('thead'),tr=el('tr'),body=el('tbody');head.forEach(h=>tr.append(el('th',h)));thead.append(tr);rows.forEach(items=>{const row=el('tr');items.forEach(i=>{const td=el('td');if(i instanceof Node)td.append(i);else td.textContent=String(i??'—');row.append(td);});body.append(row);});t.append(thead,body);wrap.append(t);root.append(wrap);}
window.GreenCalAnalytics={async render(root,ctx){
 const title=el('section',undefined,'panel');title.append(el('h2',ctx.mode==='book7'?'Buku 7 · Pendekatan Standar OJK 2026':'Analitik Kuantitatif & Rekonsiliasi Bank'),el('p','Semua model berjalan melalui API institusi yang dilindungi Cloudflare Access. Masukan tidak disimpan pada browser. Jangan memasukkan nama atau identitas debitur; gunakan referensi anonim.'),el('p','Hasil bertanda internal_only. Persetujuan resmi OJK, model internal bank, dan accounting sign-off tetap memerlukan verifikasi mandiri.'));root.append(title);
 if(ctx.mode==='book7')title.append(el('p','Metodologi Buku 7: gunakan hanya data bank yang telah diotorisasi. Skalar dari Excel Lampiran OJK belum diverifikasi, akses engine default nonaktif; hasil tidak boleh dipakai untuk CKPN posting, ATMR regulator, atau pelaporan resmi.'));
 const r=ctx.membership().role;
 const entry=el('section',undefined,'panel analyticPanel'),slabel=el('label','Pilih proses analitik'),select=el('select'),choices=Object.entries(specs).filter(([id,v])=>v.role.includes(r)&&(ctx.mode==='book7'?(id.startsWith('book7_')&&id!=='book7_standardized'):!(id.startsWith('book7_')&&id!=='book7_standardized')));
 for(const [id,config] of choices){const o=el('option',config.name);o.value=id;select.append(o);}
 slabel.append(select);entry.append(slabel);
 if(!choices.length){entry.append(el('p','Peran Anda hanya memiliki akses baca hasil analitik institusi.'));}else{
 const help=el('p',''),form=el('form'),field=el('textarea');field.rows=12;field.spellcheck=false;field.autocomplete='off';field.setAttribute('aria-label','Payload JSON data kuantitatif');const error=el('p','', 'error'),output=el('pre','', 'analyticsOutput'),actions=el('div',undefined,'formActions');
 const inputLabel=el('label','Data sumber (JSON)');inputLabel.className='wide';inputLabel.append(field);
 const fileLabel=el('label','Impor JSON lokal (maksimum 32 KiB, tanpa data pribadi)');const file=el('input');file.type='file';file.accept='.json,application/json';fileLabel.append(file);
 file.onchange=async()=>{const f=file.files?.[0];if(!f)return;if(f.size>32768){error.textContent='File melebihi batas 32 KiB. Pisahkan batch.';return;}field.value=await f.text();};
 const load=()=>{const x=specs[select.value];help.textContent=x.help;field.value=JSON.stringify(Object.fromEntries(x.fields.map(k=>[k,k==='entries'||k==='exposures'||k==='points'||k==='curve'||k==='components'||k==='scenarios'||k==='periods'||k==='hqlaSecurityChanges'||k==='corporateDeposits'||k==='undrawnCommitments'||k==='cashInflows'?[]:''])),null,2);error.textContent='';output.textContent='';};
 const submit=el('button','Jalankan engine');submit.className='primary';submit.type='submit';actions.append(submit);
 form.append(help,inputLabel,fileLabel,actions,error,output);entry.append(form);select.onchange=load;load();
 form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;error.textContent='';try{
  if(new TextEncoder().encode(field.value).length>29000)throw Error('Payload terlalu besar; gunakan batch maksimum 100 fasilitas dan 32 KiB request.');
  const input=JSON.parse(field.value),spec=specs[select.value],data=await ctx.api(spec.url,{method:'POST',body:JSON.stringify(spec.kind?{kind:spec.kind,input}:input)});
  output.textContent=JSON.stringify(data,null,2);download('GreenCal_Internal_'+(data.id||'batch')+'.json',data);await loadHistory();
 }catch(e){error.textContent=e.message;}finally{submit.disabled=false;}};
 }
 root.append(entry);
 const history=el('section',undefined,'panel');history.append(el('h2','Hasil analitik, bukti dan status rekonsiliasi'));root.append(history);
 async function loadHistory(){
  history.replaceChildren(el('h2','Hasil analitik, bukti dan status rekonsiliasi'));
  const messages=[];
  for(const [endpoint,label] of [['/analytics/sources','Rekonsiliasi berkas CBS/GL'],['/analytics/batches','Batch portofolio'],['/analytics/runs','Run kuantitatif'],['/analytics/advanced/runs','Run lanjutan']]){
   try{const data=await ctx.api(endpoint),rows=data.sources||data.batches||data.runs||[];
    history.append(el('h3',label));
    if(!rows.length){history.append(el('p','Belum ada hasil di institusi ini.'));continue;}
    table(history,['ID','Jenis/Periode','Status','Bukti'],rows.map(item=>{
     const link=el('button','Lihat / ekspor JSON');
     link.type='button';link.onclick=async()=>{try{
      const recordKey=item.id||item.sourceSha256;
      const route=endpoint+'/'+recordKey+(endpoint==='/analytics/sources'&&item.completed?'/report':'');
      const detail=await ctx.api(route);download('GreenCal_'+item.id+'.json',detail);
     }catch(e){ctx.notice(e.message,true);}};
     return [item.id||item.sourceSha256,item.kind||item.asOf||item.as_of||'—',item.status,link];
    }));
   }catch(e){messages.push(label+': '+e.message);}
  }
  if(messages.length)history.append(el('p',messages.join(' · '),'error'));
  else ctx.notice('Riwayat hasil hanya dari database institusi; data publik tidak digunakan.');
 }
 await loadHistory();
}};
})();
