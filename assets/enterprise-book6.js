/* GreenCal Buku 6 internal worksheet. In-memory forms only, server is source of truth. */
(()=>{'use strict';
 const make=(tag,value,cls)=>{const e=document.createElement(tag);if(value!==undefined)e.textContent=value;if(cls)e.className=cls;return e;};
 const writers=new Set(['data_maker','risk_analyst','climate_model_analyst','crms_project_administrator','compliance_reviewer']);
 const download=(name,obj)=>{const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=make('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);};
 const field=(parent,label,value='',type='text')=>{const l=make('label',label),input=make('input');input.type=type;input.value=value||'';l.append(input);parent.append(l);return input;};
 window.GreenCalBook6={async render(root,ctx){
  const enabled=writers.has(ctx.membership().role);
  let catalog,items;
  try{[catalog,items]=await Promise.all([ctx.api('/book6/catalog'),ctx.api('/book6/workpapers')]);}catch(e){const p=make('section',undefined,'panel');p.append(make('h2','Buku 6 · Kertas Kerja CRMS OJK 2026'),make('p',e.message),make('p','Modul ini hanya tersedia setelah Access institusi, ENTERPRISE_DB, dan GC_ENTERPRISE_BOOK6_ENABLED=true diaktifkan oleh bank. Kalkulator publik tidak terpengaruh.'));root.append(p);ctx.notice('Kertas kerja enterprise belum diaktifkan.');return;}
  const intro=make('section',undefined,'panel');intro.append(make('h2','Kertas Kerja Buku 6 OJK 2026'),make('p','Isian internal Bagian A–I, 81 tanggapan kualitatif, baseline dan tiga skenario, data pasar, likuiditas serta risiko operasional.'),make('p','Status: draf internal. Jangan gunakan sebagai Excel resmi OJK. Workbook asli, dataset, input sumber dan sign-off bank belum diverifikasi. Setiap angka harus punya rujukan dan SHA-256 sumber.'));root.append(intro);
  let activeId='',revision=0,owner='';
  const panel=make('section',undefined,'panel'),head=make('h2','Kertas kerja institusi'),list=make('div');panel.append(head,list);root.append(panel);
  const bankKeys=[['code','Kode Bank'],['name','Nama Bank'],['picName','Nama PIC'],['picTitle','Jabatan PIC'],['picEmail','Email PIC'],['picPhone','Nomor HP PIC']];
  const form=make('form');form.className='panel';form.autocomplete='off';
  const heading=make('h2','Draf baru');form.append(heading);
  const basic=make('div',undefined,'grid-2');const year=field(basic,'Tahun aktual t','2026','number');year.min='2026';year.max='2050';
  const bank={};for(const [k,l] of bankKeys)bank[k]=field(basic,l,k==='name'?ctx.membership().name:'',k==='picEmail'?'email':'text');form.append(basic);
  const explanations=make('p','Panduan Umum dan Bagian A (isi teks jawaban serta referensi dokumen/kebijakan; nomor pertanyaan disesuaikan dengan PDF asli).');form.append(explanations);
  const questionFields={};let group='',detail=null;
  for(const q of catalog.questions){
   if(group!==q.group){group=q.group;detail=make('details');const summary=make('summary',group+' · '+q.groupTitle);detail.append(summary);form.append(detail);}
   const box=make('div',undefined,'book6Answer');box.append(make('p',q.id+' — '+q.topic));const ta=make('textarea');ta.rows=3;ta.maxLength=8000;ta.placeholder='Jawaban institusi dan metodologi yang dapat diverifikasi';const ev=make('input');ev.placeholder='Referensi bukti (opsional; pisahkan dengan baris baru)';ev.maxLength=500;box.append(ta,ev);detail.append(box);questionFields[q.id]={ta,ev};
  }
  const n=make('p','Nilai kuantitatif Bagian B–I: gunakan kode metrik, periode, dimensi dan data sumber dari katalog. Input angka harus berupa string desimal, termasuk nol. Kosong berbeda dengan nol.');form.append(n);
  const help=make('details');help.append(make('summary','Lihat daftar metrik dan periode Buku 6'));const meta=make('pre',catalog.metrics.map(m=>m.id+' ['+m.sections.join(',')+'] '+m.unit+' / '+(m.dimensions.join(',')||'tanpa dimensi')).join('\n')+'\n\nPeriode: '+JSON.stringify(catalog.periods));meta.style.whiteSpace='pre-wrap';help.append(meta);form.append(help);
  const figuresLabel=make('label','Data kuantitatif (JSON array, tiap angka wajib sourceReference & sourceSha256)');const figs=make('textarea');figs.rows=12;figs.spellcheck=false;figs.value='[]';figuresLabel.append(figs);form.append(figuresLabel);
  const bondsLabel=make('label','Bagian H · Portofolio obligasi 13 atribut (JSON array; hanya apabila bank mempunyai instrumen)');const bonds=make('textarea');bonds.rows=5;bonds.spellcheck=false;bonds.value='[]';bondsLabel.append(bonds);form.append(bondsLabel);
  const notesLabel=make('label','Catatan metodologi, kendala, keterbatasan dan rencana tindak');const notes=make('textarea');notes.rows=4;notes.maxLength=5000;notesLabel.append(notes);form.append(notesLabel);
  const execLabel=make('label','Bagian I · Ringkasan eksekutif (11 aspek minimum pada Buku 6 halaman 66–68)');const executive=make('textarea');executive.rows=6;executive.maxLength=10000;execLabel.append(executive);form.append(execLabel);
  const actions=make('div',undefined,'formActions'),save=make('button','Simpan draf ke institusi'),newDraft=make('button','Buat draf baru'),message=make('p');save.type='submit';save.className='primary';newDraft.type='button';actions.append(save,newDraft);form.append(actions,message);root.append(form);
  function reset(){activeId='';revision=0;owner='';heading.textContent='Draf baru';year.value='2026';for(const [k] of bankKeys)bank[k].value=k==='name'?ctx.membership().name:'';for(const f of Object.values(questionFields)){f.ta.value='';f.ev.value='';}figs.value='[]';bonds.value='[]';notes.value='';executive.value='';message.textContent='';save.disabled=!enabled;}
  async function load(id){try{const r=await ctx.api('/book6/workpapers/'+id),d=r.document;activeId=r.id;revision=r.revision;owner=items.items.find(x=>x.id===id)?.created_by||'';heading.textContent='Edit draf · revisi '+revision;year.value=d.reportingYear;for(const [k] of bankKeys)bank[k].value=d.bank[k]||'';for(const [key,f] of Object.entries(questionFields)){f.ta.value=d.answers[key]?.text||'';f.ev.value=(d.answers[key]?.evidence||[]).join(' | ');}figs.value=JSON.stringify(d.figures,null,2);bonds.value=JSON.stringify(d.bonds,null,2);notes.value=d.methodologyNotes;executive.value=d.executiveSummary;save.disabled=!enabled;message.textContent='Draf institusi dimuat. Status: '+r.status+'. '+r.preview.answeredCount+'/'+r.preview.questionCount+' tanggapan terisi.';form.scrollIntoView({block:'start',behavior:'smooth'});}catch(e){message.textContent=e.message;}}
  function populateList(){list.replaceChildren();if(!items.items.length){list.append(make('p','Belum ada Kertas Kerja Buku 6.'));return;}const table=make('table'),tr=make('tr');for(const col of ['Bank','Tahun','Revisi','Terakhir diubah','Tindakan'])tr.append(make('th',col));const thead=make('thead');thead.append(tr);table.append(thead);const body=make('tbody');for(const i of items.items){const row=make('tr');for(const cell of [i.bank_code,i.reporting_year,i.revision,i.updated_at])row.append(make('td',String(cell)));const cell=make('td'),open=make('button','Buka');open.type='button';open.onclick=()=>load(i.id);cell.append(open);const exportBtn=make('button','Ekspor bukti JSON');exportBtn.type='button';exportBtn.onclick=async()=>{try{const d=await ctx.api('/book6/workpapers/'+i.id+'/export');download('GreenCal_Book6_Internal_'+i.id+'.json',d);}catch(e){message.textContent=e.message;}};cell.append(exportBtn);row.append(cell);body.append(row);}table.append(body);const wrap=make('div',undefined,'tableWrap');wrap.append(table);list.append(wrap);}
  populateList();newDraft.onclick=reset;reset();
  form.onsubmit=async e=>{e.preventDefault();if(!enabled)return;save.disabled=true;message.textContent='';
   try{
    const doc={reportingYear:Number(year.value),bank:Object.fromEntries(bankKeys.map(([k])=>[k,bank[k].value])),answers:{},figures:JSON.parse(figs.value),bonds:JSON.parse(bonds.value),methodologyNotes:notes.value,executiveSummary:executive.value};
    for(const [key,f] of Object.entries(questionFields)){if(f.ta.value.trim()||f.ev.value.trim())doc.answers[key]={text:f.ta.value,evidence:f.ev.value.trim()?f.ev.value.split('|').map(s=>s.trim()).filter(Boolean):[]};}
    const result=activeId?await ctx.api('/book6/workpapers/'+activeId,{method:'PATCH',body:JSON.stringify({revision,document:doc})}):await ctx.api('/book6/workpapers',{method:'POST',body:JSON.stringify(doc)});
    activeId=result.id;revision=result.revision;heading.textContent='Edit draf · revisi '+revision;message.textContent='Draf tersimpan. '+result.preview.warnings.slice(0,3).join(' ');
    items=await ctx.api('/book6/workpapers');owner=items.items.find(x=>x.id===activeId)?.created_by||'';populateList();
   }catch(error){message.textContent='Tidak tersimpan: '+error.message;}finally{save.disabled=!enabled;}
  };
  ctx.notice('Modul Buku 6 untuk penyusunan draf internal; belum untuk pengiriman ke OJK.');
 }};
})();
