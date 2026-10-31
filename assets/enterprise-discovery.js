/* GreenCal enterprise Discovery Readiness, 2026. Server-side evidence and scoring only. */
(()=>{'use strict';
const e=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
const writers=new Set(['institution_administrator','crms_project_administrator','risk_analyst','climate_model_analyst','data_maker','compliance_reviewer']);
const checkers=new Set(['checker','compliance_reviewer','sharia_governance_reviewer']);
const approvers=new Set(['approver','risk_management_head']);
const input=(type,value='',max)=>{const x=e('input');x.type=type;x.value=value??'';if(max)x.maxLength=max;return x;};
const select=(values,value='')=>{const s=e('select');for(const [v,label] of values){const op=e('option',label);op.value=v;s.append(op);}s.value=value??'';return s;};
const field=(host,label,control,cls)=>{const l=e('label',undefined,cls||'');l.append(e('span',label),control);host.append(l);return control;};
const textarea=(value='',max=1500)=>{const t=e('textarea');t.rows=2;t.value=value??'';t.maxLength=max;return t;};
const btn=(text,handler,cls)=>{const b=e('button',text,cls);b.type='button';b.onclick=async()=>{b.disabled=true;try{await handler();}catch(err){alert(err.message);}finally{b.disabled=false;}};return b;};
const paragraph=(host,s)=>host.append(e('p',s));
const choice=(items,value)=>select([['','Belum dinilai'],...items.map(x=>[String(x),String(x)])],value);
const clamp=(x)=>x===null||x===undefined?'—':String(x);
const allowEdit=(record,member,subject)=>record?.created_by===subject&&writers.has(member.role)&&['draft','rejected'].includes(record.status);
const bar=(name,report)=>{const c=e('div',undefined,'discovery-kpi');c.append(e('span',name),e('strong',report.score===null?'—':report.score.toFixed(2)+' / 4'),e('small',report.level+' · cakupan '+report.coveragePct+'%'));const p=e('progress');p.max=100;p.value=report.coveragePct;p.setAttribute('aria-label','Cakupan '+name);c.append(p);return c;};
const error=(area,text)=>{area.replaceChildren(e('p',text,'discovery-error'));};
window.GreenCalDiscovery={async render(root,ctx){
 const intro=e('section',undefined,'panel discovery-hero');
 intro.append(e('div','Discovery & Climate Risk Readiness','discovery-eyebrow'),e('h2','Ukur kesiapan CRMS institusi berdasarkan bukti'),e('p','6 dimensi berbobot, 12 topik feasibility, 111 pertanyaan discovery, 35 kebutuhan inventaris data, dan 20 uji kualitas. Hasil adalah indikator internal: bukan sertifikasi OJK atau persetujuan produksi.'));
 const header=e('div',undefined,'discovery-head');intro.append(header);root.append(intro);
 let cat,list,active=null,activePage='summary',lastReport=null;
 const stage=e('div',undefined,'discovery-stage');root.append(stage);
 try{[cat,list]=await Promise.all([ctx.api('/discovery/catalog'),ctx.api('/discovery/assessments')]);}
 catch(err){error(stage,'Menu tersedia tetapi database enterprise belum dimigrasikan atau akses institusi belum aktif: '+err.message);ctx.notice('Discovery Readiness memerlukan ENTERPRISE_DB dan migrasi 0100.');return;}
 const member=ctx.membership();
 // Subject is supplied by the authenticated /session response; never infer an author's identity from text input.
 const canCreate=writers.has(member.role);
 const refreshList=async()=>{list=await ctx.api('/discovery/assessments');populateList();};
 const sel=select([['','Pilih assessment institusi']],''),createTitle=input('text','',160);
 const actions=e('div',undefined,'discovery-controls');
 const selectorBox=e('div'),newBox=e('div');field(selectorBox,'Assessment',sel);field(newBox,'Judul assessment baru',createTitle);actions.append(selectorBox,newBox);
 if(canCreate){const create=btn('Buat assessment',async()=>{
  const title=createTitle.value.trim();if(title.length<3){alert('Isi judul minimal 3 karakter.');return;}
  const result=await ctx.api('/discovery/assessments',{method:'POST',body:JSON.stringify({title,payload:{scope:'',asOf:'',interviewer:'',notes:'',dimensions:{},topics:{},answers:{},inventory:{},quality:{}}})});
  await refreshList();sel.value=result.assessment.id;await open(result.assessment.id);
 },'primary');actions.append(create);}
 header.append(actions);
 function populateList(){const previous=sel.value;sel.replaceChildren(e('option','Pilih assessment institusi'));sel.firstElementChild.value='';for(const r of list.records){const o=e('option',r.title+' · '+r.status+' · '+r.updated_at.slice(0,10));o.value=r.id;sel.append(o);}sel.value=[...sel.options].some(o=>o.value===previous)?previous:'';}
 populateList();
 const introFoot=e('p','Jangan mengisi NIK, nama debitur, data nasabah, atau koordinat individu. Gunakan referensi bukti yang telah diotorisasi institusi; pengunggahan dokumen sensitif tidak tersedia dalam modul discovery.','discovery-hint');intro.append(introFoot);
 sel.onchange=()=>open(sel.value);
 if(!list.records.length){stage.append(e('p',canCreate?'Belum ada assessment. Buat assessment untuk memulai wawancara dan penilaian.':'Belum tersedia assessment yang dapat dilihat peran Anda.','empty'));ctx.notice('Discovery Readiness: belum ada data institusi; tidak ada nilai contoh.');return;}
 if(!canCreate&&list.records.length===1){sel.value=list.records[0].id;await open(sel.value);}
 else{stage.append(e('p','Pilih assessment dari daftar, atau buat yang baru.','empty'));ctx.notice('Katalog Discovery Readiness tersedia; pilih assessment.');}
 async function open(id){
  stage.replaceChildren();active=null;lastReport=null;
  if(!id){stage.append(e('p','Pilih assessment.','empty'));return;}
  try{const result=await ctx.api('/discovery/assessments/'+id);active=result.assessment;lastReport=active.analysis;renderAssessment();}
  catch(err){error(stage,err.message);ctx.notice('Gagal membuka assessment.',true);}
 }
 function renderAssessment(){
  stage.replaceChildren();const editable=active&&writers.has(member.role)&&active.created_by===ctxUserSubject()&&['draft','rejected'].includes(active.status);
  const title=e('section',undefined,'panel');
  const top=e('div',undefined,'sectionHead');top.append(e('h2',active.title));
  top.append(e('span',active.status+' · revisi '+active.revision,'badge'));
  title.append(top,e('p','ID '+active.id+' · penilaian terverifikasi hanya setelah review independen atas bukti. Persetujuan assessment tidak mengizinkan pemrosesan data bank atau rilis model.'));
  const tool=e('div',undefined,'discovery-actions');
  if(editable){tool.append(btn('Ajukan untuk diperiksa',async()=>flow('submit'),'primary'));}
  if(active.status==='submitted'&&active.created_by!==ctxUserSubject()&&checkers.has(member.role))tool.append(btn('Tandai telah diperiksa',async()=>flow('check'),'primary'));
  if(active.status==='checked'&&active.created_by!==ctxUserSubject()&&active.checked_by!==ctxUserSubject()&&approvers.has(member.role))tool.append(btn('Setujui hasil assessment',async()=>flow('approve'),'primary'));
  if(['submitted','checked'].includes(active.status)&&active.created_by!==ctxUserSubject()&&(checkers.has(member.role)||approvers.has(member.role)))tool.append(btn('Tolak / minta perbaikan',async()=>flow('reject')));
  if(active.status==='approved')tool.append(btn('Ekspor bukti JSON + SHA-256',download));
  tool.append(btn('Riwayat revisi',history));title.append(tool);stage.append(title);
  const tabs=[['summary','Dashboard & gap'],['dimensions','Scorecard 6 dimensi'],['topics','Asesmen 12 topik'],['answers','Questionnaire 111'],['inventory','Inventaris 35 data'],['quality','Data quality 20 tes']];
  const nav=e('div',undefined,'discovery-tabs');stage.append(nav);
  const area=e('div');stage.append(area);
  function changePage(p){activePage=p;for(const node of nav.querySelectorAll('button'))node.classList.toggle('active',node.dataset.page===p);for(const section of Object.values(sections))section.hidden=section.dataset.page!==p;}
  const sections={};
  for(const [key,label] of tabs){const b=btn(label,()=>changePage(key));b.dataset.page=key;nav.append(b);const sec=e('section',undefined,'panel discovery-form-section');sec.dataset.page=key;sections[key]=sec;area.append(sec);}
  const dashboard=sections.summary;
  const kpis=e('div',undefined,'discovery-grid');kpis.append(bar('Kesiapan utama',active.analysis.headline),bar('Readiness topik',active.analysis.topics));
  const completeness=e('div',undefined,'discovery-kpi');completeness.append(e('span','Kelengkapan 12 topik'),e('strong',active.analysis.topicCompleteness.averagePct===null?'—':active.analysis.topicCompleteness.averagePct+'%'),e('small',active.analysis.topicCompleteness.assessed+' dari 12 topik memiliki ukuran kelengkapan'));kpis.append(completeness);
  const blocker=e('div',undefined,'discovery-kpi');blocker.append(e('span','Critical blocker'),e('strong',String(active.analysis.blockers.length)),e('small',active.analysis.blockers.length?'Ada dependency yang perlu ditutup':'Belum ada yang secara eksplisit ditandai'));kpis.append(blocker);
  dashboard.append(e('h3','Ringkasan hasil asesmen'),kpis);
  dashboard.append(e('h3','Kelengkapan discovery & bukti'));
  const evidenceGrid=e('div',undefined,'discovery-grid');
  for(const [id,label] of [['questionnaire','Questionnaire (111)'],['inventory','Inventaris data (35)'],['quality','Uji kualitas (20)']]){
   const c=active.analysis.evidenceCoverage[id],p=e('div',undefined,'discovery-kpi'),meter=e('progress');
   meter.max=100;meter.value=c.coveragePct;meter.setAttribute('aria-label',label);
   p.append(e('span',label),e('strong',c.coveragePct+'%'),e('small',c.ready+' dari '+c.total+' telah dijawab dan memiliki bukti bila diperlukan'),meter);
   evidenceGrid.append(p);
  }
  dashboard.append(evidenceGrid);
  paragraph(dashboard,active.analysis.note);
  paragraph(dashboard,'Status tindak lanjut: '+(active.analysis.indicativeNextStage==='eligible_for_controlled_bank_review'?'Indikatif layak dibawa ke review bank; belum otorisasi go-live.':'Masih memerlukan asesmen atau remediation.'));
  const blockerHead=e('h3','Blocker & critical dependencies');dashboard.append(blockerHead);
  if(active.analysis.blockers.length)dashboard.append(tableLike(active.analysis.blockers.map(x=>[x.id,x.label,x.source]),['Kode','Dependency','Area']));
  else paragraph(dashboard,'Belum ada blocker yang diberi status. Data yang belum diuji tetap tidak boleh dianggap siap.');
  dashboard.append(e('h3','Gap analysis dan workstream rekomendasi'));
  if(active.analysis.gaps.length)dashboard.append(tableLike(active.analysis.gaps.map(x=>[x.label,clamp(x.score),x.priority,x.solutions.map(id=>cat.solutions.find(v=>v.id===id)?.name||id).join('; ')]),['Dimensi','Skor','Prioritas','Pilihan workstream']));
  else paragraph(dashboard,'Semua dimensi memiliki nilai setidaknya 3; review bukti dan critical dependency tetap wajib.');
  dashboard.append(e('h3','Tahapan disarankan'));
  paragraph(dashboard,'Discovery → Data profiling dan feasibility → Scenario/model methodology → Perhitungan dan kontrol → Independent validation → UAT & bank sign-off. Penilaian belum lengkap tidak dapat menjadi dasar klaim kesiapan.');
  const form=e('form');form.noValidate=true;form.className='discovery-assessment-form';sections.dimensions.append(form);
  const meta=e('div',undefined,'discovery-grid-input');form.append(meta);
  const titleIn=field(meta,'Judul',input('text',active.title,200));
  const scope=field(meta,'Lingkup CRMS / portofolio',textarea(active.payload.scope,500));
  const asOf=field(meta,'Tanggal asesmen',input('date',active.payload.asOf||''));
  const interviewer=field(meta,'Asesor / koordinator',input('text',active.payload.interviewer||'',120));
  const notes=field(meta,'Asumsi dan batasan umum',textarea(active.payload.notes,3000));
  form.append(e('h3','Dimensi utama · skor 1–4'));
  const maps={dimensions:{},topics:{},answers:{},inventory:{},quality:{}};
  function scoreBlock(host,item,section){
   const orig=active.payload[section]?.[item.id]||{};
   const wrap=e('div',undefined,'discovery-item');
   const heading=e('div',undefined,'discovery-item-header');heading.append(e('strong',item.id?item.id+' · '+item.name:item.name),e('span','Bobot '+item.weight+'%'));wrap.append(heading);
   paragraph(wrap,item.criteria);
   const grid=e('div',undefined,'discovery-grid-input');
   const score=field(grid,'Skor readiness',choice([1,2,3,4],orig.score??''));
   const evidenceRef=field(grid,'Referensi evidence',input('text',orig.evidenceRef||'',500));
   const gap=field(grid,'Gap / risiko',textarea(orig.gap||'',1500));
   const blocker=field(grid,'Critical blocker',input('checkbox'));blocker.checked=orig.blocker===true;
   const completenessPct=section==='topics'?field(grid,'Kelengkapan informasi (%)',input('number',orig.completenessPct??'')):null;
   if(completenessPct){completenessPct.min='0';completenessPct.max='100';}
   const owner=field(grid,'Owner tindak lanjut',input('text',orig.owner||'',500));
   const dueDate=section==='dimensions'?field(grid,'Target tanggal',input('date',orig.dueDate||'')):null;
   wrap.append(grid);host.append(wrap);maps[section][item.id]={score,evidenceRef,gap,blocker,completenessPct,owner,dueDate};
  }
  for(const d of cat.dimensions)scoreBlock(form,d,'dimensions');
  const topicHost=sections.topics;topicHost.append(e('h3','Feasibility per topik · 12 topik'));paragraph(topicHost,'Skor topik dan persentase kelengkapan informasi ditentukan dari data serta bukti, bukan asumsi.');for(const d of cat.topics)scoreBlock(topicHost,d,'topics');
  function statusBlock(host,item,section){
   const orig=active.payload[section]?.[item.id]||{},wrap=e('div',undefined,'discovery-item');
   wrap.append(e('strong',item.id+' · '+(item.question||item.name)));
   if(item.domain)wrap.append(e('small',item.domain));
   if(item.criticality)wrap.append(e('small','Kritikalitas: '+item.criticality));
   const opts=section==='answers'?[['unknown','Belum dikonfirmasi'],['yes','Ya'],['partial','Sebagian'],['no','Tidak'],['na','Tidak relevan']]:section==='inventory'?[['unknown','Belum dikonfirmasi'],['available','Tersedia'],['partial','Sebagian'],['unavailable','Tidak tersedia'],['na','Tidak relevan']]:[['untested','Belum diuji'],['pass','Lulus'],['partial','Parsial'],['fail','Gagal'],['na','Tidak relevan']];
   const g=e('div',undefined,'discovery-grid-input');
   const status=field(g,'Status',select(opts,orig.status||opts[0][0]));
   const answer=section==='answers'?field(g,'Jawaban / current state',textarea(orig.answer||'',2000)):null;
   const coveragePct=section==='inventory'?field(g,'Coverage (%)',input('number',orig.coveragePct??'')):null;
   if(coveragePct){coveragePct.min='0';coveragePct.max='100';}
   const sourceSystem=section==='inventory'?field(g,'Sistem sumber / owner',input('text',orig.sourceSystem||'',250)):null;
   const actual=section==='quality'?field(g,'Hasil uji aktual',input('text',orig.actual||'',800)):null;
   const evidenceRef=field(g,'Referensi evidence',input('text',orig.evidenceRef||'',500));
   const gap=field(g,'Gap / isu',textarea(orig.gap||'',1500));
   const blocker=field(g,'Critical blocker',input('checkbox'));blocker.checked=orig.blocker===true;
   const nextAction=section==='quality'?field(g,'Rencana perbaikan',textarea(orig.nextAction||'',800)):null;
   const followUp=section==='answers'?field(g,'Follow-up',textarea(orig.followUp||'',1500)):null;
   wrap.append(g);host.append(wrap);maps[section][item.id]={status,answer,coveragePct,sourceSystem,actual,evidenceRef,gap,blocker,nextAction,followUp};
  }
  sections.answers.append(e('h3','Pertanyaan discovery sesuai workbook sumber'));
  let lastGroup='';let detail;
  for(const q of cat.questionnaire){
   if(lastGroup!==q.group){lastGroup=q.group;detail=e('details',undefined,'discovery-group');detail.append(e('summary',q.section+' · '+q.group));sections.answers.append(detail);}
   statusBlock(detail,q,'answers');
  }
  sections.inventory.append(e('h3','Data inventory dan feasibility'));for(const i of cat.inventory)statusBlock(sections.inventory,i,'inventory');
  sections.quality.append(e('h3','Uji kualitas data & kelayakan'));for(const q of cat.qualityTests)statusBlock(sections.quality,q,'quality');
  const saveArea=e('div',undefined,'discovery-save');
  if(editable)saveArea.append(btn('Simpan perubahan dan hitung ulang',save,'primary'));
  else paragraph(saveArea,'Hanya pembuat dapat mengedit draf atau revisi yang ditolak. Hasil yang sudah disetujui bersifat immutable.');
  area.append(saveArea);
  if(!editable)for(const x of area.querySelectorAll('input,select,textarea'))x.disabled=true;
  changePage(activePage);ctx.notice('Discovery Readiness: data dan skor berasal dari API institusi; tidak ada nilai dummy.');
  async function save(){
   const payload={scope:scope.value,asOf:asOf.value,interviewer:interviewer.value,notes:notes.value};
   for(const [sec,map] of Object.entries(maps)){
    payload[sec]={};
    for(const [id,ref] of Object.entries(map)){
     const obj={};
     for(const [name,control] of Object.entries(ref)){
      if(!control)continue;
      if(name==='score')obj.score=control.value?Number(control.value):null;
      else if(['coveragePct','completenessPct'].includes(name))obj[name]=control.value===''?null:Number(control.value);
      else if(name==='blocker')obj[name]=control.checked;
      else obj[name]=control.value;
     }
     payload[sec][id]=obj;
    }
   }
   const r=await ctx.api('/discovery/assessments/'+active.id,{method:'PATCH',body:JSON.stringify({revision:active.revision,title:titleIn.value,payload})});
   active=r.assessment;lastReport=active.analysis;renderAssessment();ctx.notice('Assessment tersimpan; skor dihitung ulang di server.');
  }
 }
 function ctxUserSubject(){return ctx.subject||null;}
 async function flow(action){
  if(!active)return;
  const reason=action==='reject'?prompt('Alasan penolakan dan perbaikan yang diminta:','')||'':'';
  if(action==='reject'&&!reason.trim())return;
  const data=await ctx.api('/discovery/assessments/'+active.id+'/workflow',{method:'POST',body:JSON.stringify({revision:active.revision,action,reason})});
  active=data.assessment;renderAssessment();ctx.notice('Status assessment: '+active.status+'.');
 }
 async function history(){
  if(!active)return;const r=await ctx.api('/discovery/assessments/'+active.id+'/history');
  const dlg=e('dialog',undefined,'discovery-history');dlg.append(e('h3','Riwayat perubahan assessment'),tableLike(r.versions.map(x=>[x.revision,x.status,x.actor,x.occurred_at]),['Revisi','Status','Aktor','Tanggal']),btn('Tutup',()=>dlg.close()));document.body.append(dlg);dlg.addEventListener('close',()=>dlg.remove(),{once:true});dlg.showModal();
 }
 async function download(){
  if(!active)return;const r=await ctx.api('/discovery/assessments/'+active.id+'/export');
  const file=new Blob([JSON.stringify(r,null,2)],{type:'application/json'}),url=URL.createObjectURL(file),a=e('a');a.href=url;a.download='GreenCal_Discovery_Readiness_'+active.id+'.json';a.click();URL.revokeObjectURL(url);
 }
 function tableLike(rows,heads){
  const wrap=e('div',undefined,'tableWrap'),table=e('table'),thead=e('thead'),tr=e('tr');
  for(const h of heads)tr.append(e('th',h));thead.append(tr);table.append(thead);
  const body=e('tbody');for(const row of rows){const r=e('tr');for(const c of row)r.append(e('td',clamp(c)));body.append(r);}table.append(body);wrap.append(table);return wrap;
 }
 }};})();
