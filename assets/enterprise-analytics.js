/* GreenCal protected analytics console. No localStorage/sessionStorage, secrets, or PII in browser storage. */
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
 ojk_reconciliation:{name:'Buku 6 · pratinjau rekonsiliasi',role:['compliance_reviewer'],url:'/analytics/runs',kind:'ojk_reconciliation',help:'Gunakan ID batch tersimpan. Output internal, bukan format dokumen resmi atau submission.',fields:['batchId']}
};
const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
const download=(name,value)=>{const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);};
function table(root,head,rows){const wrap=el('div',undefined,'tableWrap'),t=el('table'),thead=el('thead'),tr=el('tr'),body=el('tbody');head.forEach(h=>tr.append(el('th',h)));thead.append(tr);rows.forEach(items=>{const row=el('tr');items.forEach(i=>{const td=el('td');if(i instanceof Node)td.append(i);else td.textContent=String(i??'—');row.append(td);});body.append(row);});t.append(thead,body);wrap.append(t);root.append(wrap);}
window.GreenCalAnalytics={async render(root,ctx){
 const title=el('section',undefined,'panel');title.append(el('h2','Analitik Kuantitatif & Rekonsiliasi Bank'),el('p','Semua model berjalan melalui API institusi yang dilindungi Cloudflare Access. Masukan tidak disimpan pada browser. Jangan memasukkan nama atau identitas debitur; gunakan referensi anonim.'),el('p','Hasil bertanda internal_only. Persetujuan resmi OJK, model internal bank, dan accounting sign-off tetap memerlukan verifikasi mandiri.'));root.append(title);
 const r=ctx.membership().role;
 const entry=el('section',undefined,'panel analyticPanel'),slabel=el('label','Pilih proses analitik'),select=el('select'),choices=Object.entries(specs).filter(([,v])=>v.role.includes(r));
 for(const [id,config] of choices){const o=el('option',config.name);o.value=id;select.append(o);}
 slabel.append(select);entry.append(slabel);
 if(!choices.length){entry.append(el('p','Peran Anda hanya memiliki akses baca hasil analitik institusi.'));}else{
 const help=el('p',''),form=el('form'),field=el('textarea');field.rows=12;field.spellcheck=false;field.autocomplete='off';field.setAttribute('aria-label','Payload JSON data kuantitatif');const error=el('p','', 'error'),output=el('pre','', 'analyticsOutput'),actions=el('div',undefined,'formActions');
 const inputLabel=el('label','Data sumber (JSON)');inputLabel.className='wide';inputLabel.append(field);
 const fileLabel=el('label','Impor JSON lokal (maksimum 32 KiB, tanpa data pribadi)');const file=el('input');file.type='file';file.accept='.json,application/json';fileLabel.append(file);
 file.onchange=async()=>{const f=file.files?.[0];if(!f)return;if(f.size>32768){error.textContent='File melebihi batas 32 KiB. Pisahkan batch.';return;}field.value=await f.text();};
 const load=()=>{const x=specs[select.value];help.textContent=x.help;field.value=JSON.stringify(Object.fromEntries(x.fields.map(k=>[k,k==='entries'||k==='exposures'||k==='points'||k==='curve'||k==='components'||k==='scenarios'?[]:''])),null,2);error.textContent='';output.textContent='';};
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
      const route=endpoint+'/'+recordKey;
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
