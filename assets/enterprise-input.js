/* GreenCal CRMS input centre. Public preview is memory-only; protected records use the existing API. */
(()=>{
 'use strict';
 const catalog=[
  {name:'Buku 1 · Tata Kelola & Strategi',description:'Kebijakan, risk appetite, pemilik risiko, kontrol dan rencana mitigasi.',records:['governance','risk']},
  {name:'Buku 2 · Skenario & Metodologi',description:'Skenario NGFS/IPCC, pathway, horizon serta asumsi yang dapat ditelusuri.',records:['scenario','requirement']},
  {name:'Buku 3 · Inventaris Emisi',description:'Faktor emisi, sumber metodologi, aktivitas Scope 1–3 dan rekonsiliasi dasar.',records:['factor','emission']},
  {name:'Buku 4 · Asumsi Makroekonomi',description:'Referensi dataset dan skenario; tabel makroekonomi detail tersedia pada modul khusus.',records:['scenario']},
  {name:'Buku 5 · Risiko Fisik',description:'Screening hazard, kerentanan, mitigasi, area dan data sumber.',records:['physical','portfolio']},
  {name:'Buku 6 · Kertas Kerja & Pelaporan',description:'Periode, cakupan data, kelemahan kualitas, indeks bukti dan laporan internal.',records:['report_package','regulatory_document']},
  {name:'Buku 7 · Risiko Kredit, Pasar & Likuiditas',description:'Eksposur pembiayaan, risiko transisi dan parameter awal dampak iklim.',records:['portfolio','transition']}
 ];
 const advanced=[
  {kind:'discovery',label:'Discovery Readiness',description:'Kuesioner, 12 topik, inventaris, data quality dan hasil scoring berbukti'},
  {kind:'books124',label:'Validasi Buku 1, 2 & 4',description:'Validasi parameter, skenario dan asumsi makro'},
  {kind:'book3',label:'Kalkulator Buku 3',description:'Perhitungan emisi dan annex metodologi'},
  {kind:'book5',label:'Data Risiko Fisik Buku 5',description:'Data fisik dan mapping kode pos'},
  {kind:'analytics',label:'Financed Emissions & Quantitative',description:'PCAF, transmisi risiko dan hasil analitik'},
  {kind:'book7',label:'Pendekatan Standar Buku 7',description:'Risiko kredit, pasar dan likuiditas'},
  {kind:'book6',label:'Kertas Kerja Buku 6',description:'Form kertas kerja pelaporan CRMS'}
 ];
 const el=(tag,value,cls)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=value;if(cls)n.className=cls;return n;};
 const add=(parent,...children)=>{parent.append(...children);return parent;};
 const download=(file,data)=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const anchor=el('a');anchor.href=url;anchor.download=file;document.body.append(anchor);anchor.click();anchor.remove();URL.revokeObjectURL(url);
 };
 const kindSchema=()=>Object.fromEntries(catalog.flatMap(g=>g.records).map(k=>[k,g.name]));
 function render(root,{schema,labels,mode='preview',initial='risk',canCreate=()=>false,onOpenRecord=()=>{},onNavigate=()=>{}}){
  if(!root||!schema)throw Error('Form centre requires a container and field schema.');
  const live=mode==='live';
  root.replaceChildren();
  const hero=el('section',undefined,'panel input-hero');
  add(hero,el('div',live?'FORM INPUT TERINTEGRASI · DATA INSTITUSI':'FORM INPUT CRMS · SIMULASI BANK SAWAN','input-eyebrow'),
   el('h2',live?'Pusat Form Input CRMS':'Pusat Form Input CRMS — Simulasi'),
   el('p',live?'Gunakan form modul untuk membuat draf institusi. Setiap penyimpanan melalui API dan kontrol akses bank.':'Form di bawah dapat dicoba sekarang tanpa login. Hanya gunakan data fiktif Bank Sawan: isian tidak dikirim ke server dan tidak tersimpan setelah halaman ditutup. Unduh draf JSON untuk menguji kelengkapan input.'),
   el('p','Status simulasi atau draf internal tidak sama dengan hasil penilaian maupun kepatuhan OJK.','input-caution'));
  root.append(hero);
  const boxes=el('div',undefined,'input-book-grid');
  for(const group of catalog){
   const section=el('section',undefined,'input-book-card');
   add(section,el('h3',group.name),el('p',group.description));
   const tags=el('p',undefined,'input-tags');
   for(const kind of [...new Set(group.records)]){
    const b=el('button',labels[kind]||kind);b.type='button';
    b.onclick=()=>{if(live){onOpenRecord(kind);}else{chooser.value=kind;displayForm(kind);}};
    if(live&&!canCreate(kind))b.disabled=true;
    tags.append(b);
   }
   section.append(tags);boxes.append(section);
  }
  root.append(boxes);
  const detailed=el('section',undefined,'panel input-detail');
  const heading=el('h2',live?'Buat draf langsung di workspace':'Isi & unduh draf simulasi');
  const guide=el('p',live?'Pilih jenis record; form tersimpan di database institusi melalui menu yang sesuai.':'Semua field wajib diisi dan mengikuti tipe dasar API institusi. Tidak ada kalkulasi atau persetujuan regulatori yang dihasilkan dari preview ini.');
  const chooser=el('select');chooser.id=live?'institutionInputKind':'demoInputKind';chooser.setAttribute('aria-label','Pilih form input CRMS');
  const keys=Object.keys(schema).filter(k=>kindSchema()[k]);
  for(const kind of keys){const option=el('option',(labels[kind]||kind)+' · '+kindSchema()[kind]);option.value=kind;chooser.append(option);}
  chooser.value=keys.includes(initial)?initial:'risk';
  const selector=el('label','Jenis input CRMS');selector.append(chooser);
  const formArea=el('div',undefined,'input-form-area');
  detailed.append(heading,guide,selector,formArea);root.append(detailed);
  chooser.onchange=()=>displayForm(chooser.value);
  function displayForm(kind){
   formArea.replaceChildren();
   const def=schema[kind];if(!def)return;
   if(live){
    const info=el('p','Form '+(labels[kind]||kind)+' akan dibuka dalam modul yang terhubung dengan penyimpanan dan approval institusi.');
    const b=el('button','Buka form dan tambah draf','primary');b.type='button';b.disabled=!canCreate(kind);b.onclick=()=>onOpenRecord(kind);
    formArea.append(info,b);if(b.disabled)formArea.append(el('p','Role Anda tidak memiliki izin membuat draf modul ini.','input-caution'));return;
   }
   const form=el('form');form.autocomplete='off';
   const grid=el('div',undefined,'input-fields');
   const titleLabel=el('label','Judul record *'),title=el('input');
   title.name='title';title.required=true;title.maxLength=200;title.placeholder='Contoh: SIMULASI kebijakan risiko iklim 2026';titleLabel.append(title);titleLabel.className='input-full';grid.append(titleLabel);
   for(const [key,[label,type='text',choices]] of Object.entries(def)){
    const wrapper=el('label',label+' *');
    const field=el(type==='select'?'select':type==='textarea'?'textarea':'input');
    field.name=key;field.required=true;
    if(type==='select'){
     const option=el('option','Pilih…');option.value='';option.disabled=true;option.selected=true;field.append(option);
     for(const choice of choices){const opt=el('option',choice);opt.value=choice;field.append(opt);}
    }else if(type!=='textarea'){
     field.type=type;
     if(type==='url')field.pattern='https://.*';
     if(type==='number'){
      field.step='1';field.min=key==='horizonYear'?'2025':'1';
      if(['hazardLevel','vulnerabilityLevel','likelihood','severity'].includes(key))field.max='5';
      if(key==='book')field.max='7';
      if(key==='horizonYear')field.max='2100';
     }
     if(['quantity','value','ead','outstanding','carbonPrice'].includes(key)){
      field.inputMode='decimal';field.pattern='[0-9]{1,13}(\.[0-9]{1,6})?';
      field.title='Angka positif atau nol, maksimum 13 digit dan 6 desimal';
     }
    }
    if(type==='textarea'||['impact','transmission','mitigation','methodology','evidence'].includes(key))wrapper.className='input-full';
    wrapper.append(field);grid.append(wrapper);
   }
   form.append(grid);
   const status=el('p','Data hanya berada di memori tab ini sampai berkas diunduh.','input-status');
   status.setAttribute('role','status');status.setAttribute('aria-live','polite');
   const actions=el('div',undefined,'input-actions'),exportBtn=el('button','Validasi isian & unduh JSON','primary');exportBtn.type='submit';
   const reset=el('button','Kosongkan form');reset.type='reset';
   actions.append(reset,exportBtn);form.append(actions,status);
   form.onsubmit=event=>{
    event.preventDefault();
    if(!form.reportValidity())return;
    const payload={};
    for(const [key,[,type]] of Object.entries(def)){
     const value=form.elements.namedItem(key).value.trim();
     payload[key]=type==='number'?Number(value):value;
    }
    const data={schema:'greencal-crms-input-simulation-v1',simulationOnly:true,bank:'Bank Sawan (FIKTIF)',persisted:false,
     regulatorySubmission:false,kind,title:title.value.trim(),payload};
    download('GreenCal_CRMS_SIMULASI_'+kind+'.json',data);
    status.textContent='Berkas draf simulasi berhasil dibuat. Data tidak disimpan ke server.';
   };
   formArea.append(form);
  }
  displayForm(chooser.value);
  const next=el('section',undefined,'panel');
  add(next,el('h2','Form khusus dan metodologi Buku 1–7'),
   el('p',live?'Buka modul yang sesuai untuk memasukkan data khusus serta menjalankan validasi dan perhitungan yang diizinkan institusi.':'Form khusus berikut tersedia di workspace setelah identitas institusi, PostgreSQL, migrasi, dan izin role aktif. Demo publik tidak menyimpan atau menjalankan perhitungan bank.'));
  const list=el('div',undefined,'input-special');
  for(const item of advanced){
   const row=el('div',undefined,'input-special-row');
   add(row,el('strong',item.label),el('p',item.description));
   if(live){const b=el('button','Buka modul');b.type='button';b.onclick=()=>onNavigate(item.kind);row.append(b);}
   else row.append(el('small','Memerlukan aktivasi institusi','input-locked'));
   list.append(row);
  }
  next.append(list);root.append(next);
 }
 window.GreenCalInput={catalog,advanced,render};
})();