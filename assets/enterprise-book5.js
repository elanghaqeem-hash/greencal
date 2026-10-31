/* GreenCal CRMS OJK Buku 5 — source-linked physical risk screening. No client persistence. */
(()=>{'use strict';
const E=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
const label=(root,title,kind='input')=>{const wrap=E('label',title),field=E(kind);if(kind==='input')field.type='text';wrap.append(field);root.append(wrap);return field;};
function option(select,value,text){const o=E('option',text||value);o.value=value;select.append(o);}
const explain=(section,t)=>section.append(E('p',t));
function table(root,result){
 const t=E('table'),head=E('tr');
 for(const x of ['Bahaya iklim','Skor 0–100','Kategori'])head.append(E('th',x));
 const thead=E('thead');thead.append(head);const tbody=E('tbody');
 const names={flood:'Banjir',sea_level_rise:'Kenaikan muka air laut',wildfire:'Kebakaran hutan/lahan',
  heat_stress:'Heat stress',water_stress:'Water stress',storm:'Badai',combined:'Gabungan (skor sumber)'};
 for(const [k,v] of Object.entries(result.scores)){
  const tr=E('tr');for(const cell of [names[k],v.score===null?'Tidak tersedia':String(v.score),v.category.label])tr.append(E('td',cell));tbody.append(tr);
 }
 t.append(thead,tbody);const wrap=E('div');wrap.className='tableWrap';wrap.append(t);root.append(wrap);
}
window.GreenCalBook5={async render(root,{api,notice}){
 root.replaceChildren();
 const catalog=await api('/book5/catalog');
 const intro=E('section',undefined,'panel');intro.append(E('h2','Buku 5 OJK 2026 · Risiko Fisik'));
 explain(intro,'Data kecamatan × 4 lini agunan × 3 skenario NGFS Phase 5 × 2020/2030/2040/2050. Nilai 0 valid; nilai kosong tidak dianggap 0. Skor gabungan tidak dihitung ulang dari skor bahaya.');
 explain(intro,'Skor dampak bukan persen kerusakan atau haircut otomatis. Penyesuaian PD/LGD/CKPN memerlukan kalibrasi dan persetujuan terpisah. Batas skor 50 dalam PDF beririsan sehingga ditandai untuk review.');
 explain(intro,'Dataset resmi Excel dan pemetaan kode pos merupakan lampiran terpisah dari PDF. Tanpa verifikasi data yang diimpor, modul tidak akan menghasilkan skor.');
 root.append(intro);
 const panel=E('section',undefined,'panel');panel.append(E('h2','Screening lokasi agunan / fasilitas'));
 const ds=label(panel,'Versi data resmi yang sudah diverifikasi','select');
 for(const s of catalog.datasets.filter(x=>x.status==='validated'))option(ds,s.id,s.version+' · '+s.id+' · SHA '+s.sha256.slice(0,12));
 if(!ds.options.length){panel.append(E('p','Belum ada dataset Buku 5 berstatus validated untuk institusi ini. Admin data perlu memuat lampiran XLSX OJK yang sah, memvalidasi cakupan dan versi, serta mengaktifkan modul.','empty'));root.append(panel);notice('Buku 5: dataset terverifikasi belum tersedia.');return;}
 const q=label(panel,'Cari kecamatan, kabupaten atau provinsi (tanpa alamat nasabah)');
 q.placeholder='Ketik nama kecamatan atau wilayah';const lookup=E('button','Cari wilayah');lookup.type='button';panel.append(lookup);
 const region=label(panel,'Pilih wilayah dari dataset','select');
 const asset=label(panel,'Kelompok agunan','select');const names={residential:'Residensial',commercial:'Komersial',industrial:'Industri',other:'Lainnya'};
 catalog.assetLines.forEach(k=>option(asset,k,names[k]||k));
 const scenario=label(panel,'Skenario NGFS','select');catalog.scenarios.forEach(k=>option(scenario,k));
 const year=label(panel,'Tahun proyeksi (2020–2050)');year.type='number';year.min='2020';year.max='2050';year.step='1';year.value='2030';
 const method=label(panel,'Tingkat pemetaan','select');option(method,'exact_district','Kecamatan dipilih');option(method,'regency_conservative_max','Kabupaten/kota — skor tertinggi antar kecamatan');
 lookup.onclick=async()=>{
  lookup.disabled=true;region.replaceChildren();
  try{
   const r=await api('/book5/locations?datasetId='+encodeURIComponent(ds.value)+'&q='+encodeURIComponent(q.value.trim()));
   r.regions.forEach(row=>{const o=E('option',row.province+' · '+row.regency+' · '+row.district);
    o.value=JSON.stringify(row);region.append(o);});
   notice(r.regions.length?'Pilih salah satu hasil wilayah.':'Wilayah belum ditemukan.');
  }catch(e){notice(e.message,true);}finally{lookup.disabled=false;}
 };
 const run=E('button','Evaluasi risiko fisik');run.type='button';run.className='primary';panel.append(run);
 const output=E('div');panel.append(output);root.append(panel);
 run.onclick=async()=>{
  run.disabled=true;output.replaceChildren();
  try{
   if(!region.value)throw Error('Cari dan pilih wilayah dari dataset terlebih dahulu.');
   const loc=JSON.parse(region.value);
   const r=await api('/book5/screen',{method:'POST',body:JSON.stringify({
    datasetId:ds.value,province:loc.province,regency:loc.regency,district:loc.district,
    locationMethod:method.value,assetLine:asset.value,scenario:scenario.value,year:Number(year.value)
   })});
   output.append(E('h3','Hasil screening — '+loc.regency));
   table(output,r.result);
   const x=r.result;explain(output,'Sumber: '+x.source.version+' · SHA-256 '+x.source.sha256+' · '+x.interpolation+' · '+x.locationMethod);
   if(x.limitations.missingHazards.length)explain(output,'Skor tanpa data: '+x.limitations.missingHazards.join(', ')+'. Tidak diperlakukan sebagai nol.');
   if(x.limitations.ambiguousThresholdAt50.length)explain(output,'Kategori nilai 50 memerlukan penetapan batas oleh metodologi Bank.');
   explain(output,'Hasil internal untuk penapisan. Tidak otomatis menjadi hasil perhitungan PD/LGD/EAD, kerugian agunan, atau laporan OJK.');
   notice('Screening Buku 5 selesai; hasil belum disimpan sebagai bukti pelaporan.');
  }catch(e){notice(e.message,true);}
  finally{run.disabled=false;}
 };
 notice('Buku 5 siap melakukan lookup dari dataset yang disahkan bank.');
}};
})();
