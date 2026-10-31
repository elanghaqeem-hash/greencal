/* Enterprise UI: no localStorage, tokens, bank data, or provider secrets. */
(()=>{'use strict';
 const $=s=>document.querySelector(s),el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
 const labels={overview:'Ringkasan workspace',discovery:'Discovery Readiness',analytics:'Analitik kuantitatif',book7:'Buku 7 · Pendekatan Standar',book6:'Buku 6 · Kertas Kerja OJK',books124:'Buku 1, 2 & 4 · Integrasi CRMS',book3:'Buku 3 · Metode Penghitungan Emisi',release:'Persetujuan rilis Bank',risk:'Register risiko iklim',factor:'Faktor emisi',emission:'Aktivitas & kalkulasi',regulatory_document:'Pustaka dokumen OJK',requirement:'Pemetaan persyaratan',governance:'Kebijakan & risk appetite',portfolio:'Eksposur pembiayaan',scenario:'Katalog skenario iklim',physical:'Screening risiko fisik',transition:'Asesmen risiko transisi',report_package:'Paket laporan internal',audit:'Audit institusi',manual:'Panduan pengguna'};
 // label, control type, choices; all values sent through server validation.
 const schema={
 governance:{policyArea:['Area kebijakan','select',['strategy','risk_appetite','governance','sharia','disclosure']],owner:['Pemilik kebijakan'],riskAppetite:['Risk appetite / ambang toleransi','textarea'],controls:['Kontrol & mitigasi','textarea'],shariaConsiderations:['Pertimbangan risiko syariah','textarea'],approvalReference:['Rujukan persetujuan internal'],effectiveFrom:['Mulai berlaku','date'],reviewDate:['Tanggal review','date']},
 portfolio:{facilityRef:['Kode fasilitas anonim (tanpa NIK/nama nasabah)'],obligorRef:['Kode debitur anonim'],sector:['Sektor usaha / KBLI'],region:['Wilayah / kode wilayah'],product:['Produk / akad','select',['murabahah','musyarakah','mudharabah','ijarah','sukuk','conventional_loan','other']],currency:['Mata uang (ISO 4217, contoh IDR)'],ead:['EAD, nilai desimal'],outstanding:['Outstanding, nilai desimal'],asOf:['Tanggal posisi','date'],maturityDate:['Tanggal jatuh tempo','date'],evidence:['Referensi sumber data','textarea']},
 scenario:{framework:['Kerangka skenario','select',['NGFS','IPCC','bank_internal']],scenarioName:['Nama skenario'],vintage:['Vintage / rilis sumber'],pathway:['Pathway skenario'],horizonYear:['Horizon tahun','number'],sourceUrl:['URL sumber HTTPS','url'],sourceVersion:['Versi dataset'],assumptions:['Asumsi, satuan & periode','textarea'],limitations:['Batasan & ketidakpastian','textarea']},
 physical:{portfolioId:['ID portofolio disetujui'],scenarioId:['ID skenario disetujui'],hazard:['Ancaman fisik','select',['flood','drought','heat','landslide','coastal','storm','wildfire','other']],hazardSource:['Dataset & referensi lokasi','textarea'],hazardLevel:['Level bahaya (1–5)','number'],vulnerabilityLevel:['Level kerentanan (1–5)','number'],mitigation:['Mitigasi / kapasitas adaptasi','textarea'],evidence:['Bukti & hasil verifikasi','textarea']},
 transition:{portfolioId:['ID portofolio disetujui'],scenarioId:['ID skenario disetujui'],driver:['Pendorong transisi','select',['policy_legal','technology','market','reputation','mixed']],channel:['Saluran dampak ke debitur','textarea'],carbonPrice:['Asumsi harga karbon, angka desimal'],carbonPriceUnit:['Satuan harga (contoh IDR/tCO2e)'],shockAssumption:['Asumsi guncangan & data dasar','textarea'],adaptation:['Rencana adaptasi debitur','textarea'],evidence:['Sumber / referensi','textarea']},
 report_package:{periodStart:['Awal periode','date'],periodEnd:['Akhir periode','date'],reportingBasis:['Basis laporan','select',['management','internal_crms','ojk_mapping_draft']],contentScope:['Cakupan unit, portofolio dan modul','textarea'],evidenceIndex:['Indeks rekonsiliasi & bukti','textarea'],dataQualityIssues:['Kelemahan kualitas data','textarea'],modelLimitations:['Keterbatasan model & ketidakpastian','textarea'],reviewNote:['Catatan reviewer','textarea']},
 risk:{category:['Jenis risiko','select',['physical','transition']],sector:['Sektor'],location:['Lokasi'],event:['Peristiwa','textarea'],cause:['Penyebab','textarea'],transmission:['Saluran transmisi','textarea'],impact:['Dampak bisnis','textarea'],owner:['Pemilik risiko'],likelihood:['Likelihood (1–5)','number'],severity:['Impact (1–5)','number'],controls:['Kontrol yang tersedia','textarea'],mitigation:['Rencana mitigasi','textarea'],dueDate:['Target penyelesaian','date']},
 factor:{value:['Faktor kgCO₂e per satuan aktivitas'],activityUnit:['Satuan aktivitas, contoh kWh'],sourceUrl:['URL sumber primer','url'],sourceDocument:['Dokumen sumber'],page:['Halaman referensi','number'],methodology:['Metodologi dan batasan','textarea'],geography:['Wilayah penerapan'],effectiveFrom:['Berlaku mulai','date'],effectiveTo:['Berlaku sampai','date'],version:['Versi faktor'],gwpBasis:['Basis GWP']},
 emission:{quantity:['Kuantitas aktivitas (maks. 6 desimal)'],activityUnit:['Satuan aktivitas (harus sama dengan faktor)'],activityDate:['Tanggal aktivitas','date'],scope:['Scope','select',['scope1','scope2','scope3']],factorId:['ID faktor yang disetujui'],evidence:['Referensi bukti aktivitas'],branch:['Cabang/unit kerja']},
 regulatory_document:{book:['Nomor buku (1–7)','number'],officialTitle:['Judul resmi'],publicationDate:['Tanggal publikasi','date'],version:['Versi'],sourceUrl:['URL PDF resmi OJK','url'],sha256:['SHA-256 file sumber'],pageCount:['Jumlah halaman','number']},
 requirement:{documentId:['ID dokumen yang disetujui'],chapter:['Bab'],section:['Bagian'],page:['Halaman','number'],requirement:['Persyaratan sumber','textarea'],module:['Modul GreenCal'],data:['Data yang dibutuhkan','textarea'],businessRule:['Aturan bisnis / formula','textarea'],testCase:['Test case dan expected result','textarea'],evidence:['Referensi bukti pengujian','textarea'],implementationStatus:['Status implementasi','select',['not_assessed','gap_identified','planned','in_development','implemented']]}
 };
 let session=null,tenant='',view='overview',page=1,rows=[],generation=0;
 function notice(text,error=false){$('#notice').textContent=text;$('#notice').classList.toggle('error',error);}
 async function api(path,options={}){
  const response=await fetch('/api/enterprise'+path,{...options,credentials:'same-origin',cache:'no-store',headers:{...(options.body?{'Content-Type':'application/json'}:{}),'X-GreenCal-Tenant':tenant,...options.headers}});
  const data=await response.json();if(!response.ok)throw Error(data.message||'Permintaan gagal ('+response.status+').');return data;
 }
 const membership=()=>session?.tenants.find(t=>t.tenant_id===tenant);
 async function start(){
  $('#retry').disabled=true;
  try{
   session=await api('/session');
   if(!session.tenants.length)throw Error('Identitas terverifikasi tetapi belum memiliki keanggotaan institusi aktif.');
   const select=$('#tenant');select.replaceChildren();session.tenants.forEach(t=>{const o=el('option',t.name);o.value=t.tenant_id;select.append(o);});
   tenant=session.tenants[0].tenant_id;$('#workspace').hidden=false;$('#unavailable').hidden=true;$('#logout').hidden=false;await render();
  }catch(e){session=null;tenant='';generation++;$('#content').replaceChildren();$('#workspace').hidden=true;$('#unavailable').hidden=false;notice(e.message,true);}
  finally{$('#retry').disabled=false;}
 }
 function table(heads,items){const wrap=el('div',undefined,'tableWrap'),t=el('table'),thead=el('thead'),hr=el('tr'),body=el('tbody');heads.forEach(h=>hr.append(el('th',h)));thead.append(hr);items.forEach(cells=>{const r=el('tr');cells.forEach(c=>{const td=el('td');if(c instanceof Node)td.append(c);else td.textContent=String(c??'—');r.append(td);});body.append(r);});t.append(thead,body);wrap.append(t);return wrap;}
 const button=(label,handler)=>{const b=el('button',label);b.type='button';b.onclick=async()=>{b.disabled=true;try{await handler();}catch(e){notice(e.message,true);}finally{b.disabled=false;}};return b;};
 async function render(){
  const current=++generation,selectedTenant=tenant;$('#pageTitle').textContent=labels[view];$('#identity').textContent=session.user.email+' · '+membership().role;
  document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.hidden=b.dataset.view==='audit'&&!membership().permissions.audit;});
  const root=$('#content');root.replaceChildren();notice('Memuat data institusi…');
  try{
   if(view==='discovery'){
    if(!window.GreenCalDiscovery)throw Error('Komponen Discovery Readiness belum tersedia.');
    await window.GreenCalDiscovery.render(root,{api,membership,notice,subject:session.user.subject});return;
   }
   if(view==='manual'){
    const section=el('section',undefined,'panel');section.append(el('h2','Alur penggunaan foundation'));
    ['Administrator menyiapkan identitas Access dan keanggotaan pada database enterprise terpisah. Tidak ada akun atau data contoh produksi.','Maker membuat draf sesuai peran. Simpan, muat ulang, lalu periksa detail dan riwayat revisi.','Faktor harus memiliki sumber, halaman, satuan, basis GWP, masa berlaku, dan melewati review tiga orang sebelum digunakan.','Aktivitas emisi menggunakan faktor yang disetujui. Server menghitung kuantitas × kgCO₂e/satuan ÷ 1000 dan membekukan salinan faktor. Nilai nol berbeda dari isian kosong.','Pembuat mengajukan → checker berbeda melakukan pemeriksaan → approver ketiga menyetujui. Tolak wajib beralasan. Record disetujui terkunci; koreksi memerlukan record pengganti.','Ekspor JSON menyediakan snapshot internal, riwayat, dan SHA-256. Ini belum merupakan kertas kerja resmi OJK.','Portofolio menggunakan ID fasilitas dan debitur anonim; jangan memasukkan NIK, nama nasabah, alamat detail atau data pribadi.','Katalog skenario mencatat metadata, vintage, horizon, dan sumber data; tidak menghasilkan proyeksi risiko sampai data dan model divalidasi.','Screening fisik memakai skor ordinal 5×5 untuk prioritas telaah saja; bukan probabilitas gagal bayar, kerugian finansial, atau perhitungan risiko resmi.','Asesmen transisi menginventarisasi pendorong, jalur transmisi, dan asumsi harga karbon tanpa klaim hasil PD/LGD/EAD.','Paket laporan internal mengatur indeks bukti dan kualitas data; belum menghasilkan dokumen pelaporan resmi.','Pustaka dan mapping mencatat sumber dan bukti; persetujuan record tidak berarti patuh OJK. Verifikasi tujuh buku, model, reporting, dan UAT bank masih menjadi gate berikutnya.','Gunakan Keluar untuk mengakhiri sesi Access. Data tidak disimpan di localStorage. Konflik revisi: muat ulang sebelum mencoba kembali.'].forEach(s=>section.append(el('p',s)));root.append(section);notice('Panduan foundation. Modul lanjutan mengikuti roadmap dan validasi sumber.');return;
   }
   if(view==='release'){
    if(!window.GreenCalRelease)throw Error('Komponen release gate belum tersedia.');
    await window.GreenCalRelease.render(root,{api,membership,notice});return;
   }
   if(view==='book3'){
    if(!window.GreenCalBook3)throw Error('Komponen Buku 3 belum tersedia; periksa paket deployment.');
    await window.GreenCalBook3.render(root,{api,membership,notice});return;
   }
   if(view==='books124'){
    if(!window.GreenCalBooks124)throw Error('Komponen Buku 1/2/4 belum tersedia.');
    await window.GreenCalBooks124.render(root,{api,membership,notice});return;
   }
   if(view==='book6'){
    if(!window.GreenCalBook6)throw Error('Komponen Buku 6 belum tersedia; periksa paket deployment.');
    await window.GreenCalBook6.render(root,{api,membership,notice});return;
   }
   if(view==='analytics'||view==='book7'){
    if(!window.GreenCalAnalytics)throw Error('Komponen analitik tidak ditemukan; periksa aset deployment.');
    await window.GreenCalAnalytics.render(root,{api,membership,notice,mode:view});return;
   }
   if(view==='overview'){
    const data=await api('/summary');if(current!==generation||tenant!==selectedTenant)return;
    const cards=el('div',undefined,'cards');Object.keys(schema).forEach(k=>{const c=el('div',undefined,'card');c.append(el('span',labels[k]));c.append(el('b',String(data.counts.filter(r=>r.kind===k).reduce((n,r)=>n+r.count,0))));cards.append(c);});root.append(cards);
    const p=el('section',undefined,'panel');p.append(el('h2','CRMS Enterprise: modul tercatat & dapat ditelusuri'),el('p','Kebijakan, data eksposur pembiayaan, skenario, screening fisik, asesmen transisi, register risiko, faktor emisi dan paket laporan internal terhubung dengan otorisasi server, tiga tahap review, dan bukti revisi. Hasil stress testing, PD/LGD/EAD dan dokumen OJK resmi tetap terkunci sampai model serta sumber disahkan.'));root.append(p);notice('Status penerimaan regulasi: belum divalidasi. Jumlah record bukan ukuran kepatuhan.');return;
   }
   if(view==='audit'){
    const data=await api('/audit');if(current!==generation)return;root.append(data.events.length?table(['Waktu','Aktor','Aksi','Record'],data.events.map(e=>[e.occurred_at,e.actor,e.action,e.target])):el('p','Belum ada audit event.','empty'));notice('100 event terbaru. Audit perubahan disimpan dalam transaksi database yang sama.');return;
   }
   const data=await api('/records?kind='+view+'&page='+page);if(current!==generation)return;rows=data.records;
   const bar=el('div',undefined,'sectionHead');bar.append(el('p','Draf → Diajukan → Diperiksa → Disetujui'));
   if(membership().permissions.create.includes(view))bar.append(button('Tambah draf',()=>openForm()));root.append(bar);
   if(!rows.length)root.append(el('p','Belum ada record. Data institusi dimulai kosong.','empty'));
   else root.append(table(['Judul / ID','Status','Revisi','Hasil / sumber','Tindakan'],rows.map(r=>{
    const actions=el('div');actions.append(button('Rincian',()=>detail(r)));
    const own=r.created_by===session.user.subject,editable=own&&['draft','rejected'].includes(r.status)&&membership().permissions.create.includes(r.kind);
    if(editable){actions.append(button('Edit',()=>openForm(r)),button('Ajukan',()=>workflow(r,'submit')),button('Arsipkan',()=>workflow(r,'archive')));}
    if(r.status==='submitted'&&!own&&membership().permissions.check)actions.append(button('Periksa',()=>workflow(r,'check')));
    if(r.status==='checked'&&!own&&r.checked_by!==session.user.subject&&membership().permissions.approve)actions.append(button('Setujui',()=>workflow(r,'approve')));
    if(['submitted','checked'].includes(r.status)&&!own&&(membership().permissions.check||membership().permissions.approve))actions.append(button('Tolak',()=>workflow(r,'reject')));
    if(r.status==='approved')actions.append(button('Ekspor bukti',()=>exportRecord(r)));
    const title=el('div');title.append(el('strong',r.title),el('p',r.id));
    return [title,r.status,r.revision,r.payload.calculation?r.payload.calculation.result+' tCO₂e':r.payload.sourceDocument||r.payload.implementationStatus||r.payload.category||'—',actions];
   })));
   const pager=el('div',undefined,'pager');if(page>1)pager.append(button('Sebelumnya',async()=>{page--;await render();}));pager.append(el('span','Halaman '+page));if(data.hasMore)pager.append(button('Berikutnya',async()=>{page++;await render();}));root.append(pager);notice('Record institusi '+membership().name+'. Persetujuan internal tidak memberikan status regulator-approved.');
  }catch(e){if(current===generation){root.replaceChildren();notice(e.message,true);}}
 }
 async function openForm(record){
  const form=$('#recordForm');form.reset();form.elements.recordId.value=record?.id||'';form.elements.revision.value=record?.revision||'';form.elements.title.value=record?.title||'';$('#dialogTitle').textContent=(record?'Edit draf · ':'Tambah · ')+labels[view];$('#formError').textContent='';const fields=$('#fields');fields.replaceChildren();
  Object.entries(schema[view]).forEach(([key,[label,type='text',choices]])=>{const l=el('label',label);if(type==='textarea')l.className='wide';const input=el(type==='select'?'select':type==='textarea'?'textarea':'input');input.name=key;input.required=true;if(type==='select')choices.forEach(value=>{const o=el('option',value);o.value=value;input.append(o);});else if(type!=='textarea')input.type=type;if(type==='number'){input.step='1';input.min='1';}input.value=record?.payload[key]??(type==='select'?choices[0]:'');l.append(input);fields.append(l);});
  if(['physical','transition'].includes(view)){
   for(const [field,kind] of [['portfolioId','portfolio'],['scenarioId','scenario']]){
    const inp=form.elements[field];inp.placeholder='Pilih saran atau tempel ID record disetujui';const list=el('datalist');list.id='enterprise-ref-'+kind;inp.setAttribute('list',list.id);inp.parentElement.append(list);
    const fill=async()=>{const response=await api('/references?kind='+kind+'&q='+encodeURIComponent(''));list.replaceChildren();response.records.forEach(item=>{const option=el('option');option.value=item.id;option.label=item.title;list.append(option);});};
    try{await fill();}catch(e){$('#formError').textContent='Referensi '+kind+': '+e.message;}
   }
  }
  $('#recordDialog').showModal();
 }
 async function workflow(record,action){
  let reason='';if(['reject','archive'].includes(action)){reason=prompt('Masukkan alasan '+(action==='reject'?'penolakan':'pengarsipan')+':');if(!reason?.trim())return;}
  if(action==='approve'&&!confirm('Setujui dan kunci record ini beserta hasil kalkulasinya?'))return;
  await api('/records/'+record.id+'/workflow',{method:'POST',body:JSON.stringify({revision:record.revision,action,reason})});await render();
 }
 async function detail(record){
  const token=generation;const data=await api('/records/'+record.id+'/history');if(token!==generation)return;
  $('#detailTitle').textContent=record.title;const root=$('#detailBody');root.replaceChildren();
  Object.entries(record.payload).forEach(([key,value])=>{const d=el('div',undefined,'detailField');d.append(el('b',schema[record.kind][key]?.[0]||key),el('pre',typeof value==='object'?JSON.stringify(value,null,2):String(value)));root.append(d);});root.append(el('h3','Riwayat revisi'));
  data.versions.forEach(v=>root.append(el('p','r'+v.revision+' · '+v.status+' · '+v.actor+' · '+v.occurred_at+(v.reason?' · '+v.reason:''),'history')));$('#detailDialog').showModal();
 }
 async function exportRecord(record){const data=await api('/records/'+record.id+'/export'),blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='GreenCal_Evidence_'+record.id+'.json';a.click();URL.revokeObjectURL(url);}
 $('#recordForm').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,submit=form.querySelector('[type=submit]');submit.disabled=true;
  const requestGeneration=generation;
  try{const payload={};Object.entries(schema[view]).forEach(([key,[,type]])=>{const v=form.elements[key].value;payload[key]=type==='number'?Number(v):v;});const id=form.elements.recordId.value;await api('/records'+(id?'/'+id:''),{method:id?'PATCH':'POST',body:JSON.stringify({kind:view,title:form.elements.title.value,payload,...(id?{revision:Number(form.elements.revision.value)}:{})})});$('#recordDialog').close();if(requestGeneration===generation)await render();}catch(e){$('#formError').textContent=e.message;}finally{submit.disabled=false;}
 };
 $('#tenant').onchange=async e=>{tenant=e.target.value;page=1;$('#detailDialog').close();$('#recordDialog').close();$('#detailBody').replaceChildren();await render();};
 document.querySelectorAll('[data-view]').forEach(b=>b.onclick=async()=>{view=b.dataset.view;page=1;document.body.classList.remove('navOpen');$('#menuToggle').setAttribute('aria-expanded','false');await render();});
 $('#menuSearch').oninput=e=>document.querySelectorAll('[data-view]').forEach(b=>b.hidden=!b.textContent.toLowerCase().includes(e.target.value.toLowerCase())||(b.dataset.view==='audit'&&!membership()?.permissions.audit));
 $('#menuToggle').onclick=()=>{if(window.matchMedia('(max-width:800px)').matches){document.body.classList.remove('navCollapsed');const open=document.body.classList.toggle('navOpen');$('#menuToggle').setAttribute('aria-expanded',String(open));}else{document.body.classList.remove('navOpen');const collapsed=document.body.classList.toggle('navCollapsed');$('#menuToggle').setAttribute('aria-expanded',String(!collapsed));}};
 $('#closeDialog').onclick=$('#cancelDialog').onclick=()=>$('#recordDialog').close();$('#closeDetail').onclick=()=>$('#detailDialog').close();$('#retry').onclick=start;start();
})();
