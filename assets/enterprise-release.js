/* Bank release approval console. Real Access identity and D1 reviewer appointments required. */
(()=>{'use strict';
 const el=(tag,text)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;return x;};
 const functions={risk:'Risk Management',finance:'Finance',compliance:'Compliance',it:'IT & Security',independent_model_validation:'Independent Model Validation'};
 const expectedRole={risk:'risk_management_head',finance:'approver',compliance:'compliance_reviewer',it:'institution_administrator',independent_model_validation:'internal_auditor'};
 const template=(kind)=>kind==='candidate'?{commitSha:'',buildSha256:'',evidenceSha256:''}:kind==='assignment'?{function:'risk',reviewerSubject:'',approvedAppointmentReference:''}:{function:'risk',outcome:'rejected',evidenceSha256:'',evidenceReference:'',attestation:''};
 window.GreenCalRelease={async render(root,ctx){
  const section=el('section'),heading=el('h2','Release Gate — Persetujuan Institusi'),notice=el('p','Tidak ada persetujuan otomatis. Setiap hasil harus didukung identitas institusi Cloudflare Access dan bukti yang sah. Simulasi dan contoh tidak boleh dikirim sebagai persetujuan bank.');
  section.className='panel';section.append(heading,notice);root.append(section);
  const reviews=el('section');reviews.className='panel';reviews.append(el('h2','Status kandidat dan fungsi reviewer'));root.append(reviews);
  const role=ctx.membership().role;
  const canInitiate=['crms_project_administrator','institution_administrator'].includes(role),canAssign=role==='institution_administrator',canVote=Object.values(expectedRole).includes(role);
  if(canInitiate||canVote||canAssign){
   const kit=window.GreenCalFormKit;if(!kit)throw Error('Form release institusi belum dimuat.');
   const form=el('form'),modeLabel=el('label','Operasi berwenang'),select=el('select'),host=el('div'),msg=el('p',''),
     candidateLabel=el('label','ID kandidat rilis (UUID)'),candidateInput=el('input'),submit=el('button','Simpan bukti keputusan');
   const choices=[...(canInitiate?[['candidate','Ajukan kandidat rilis']]:[]),...(canAssign?[['assignment','Tunjuk reviewer resmi']]:[]),...(canVote?[['review','Setujui/tolak kandidat sesuai penunjukan']]:[])];
   for(const [key,title] of choices){const o=el('option',title);o.value=key;select.append(o);}
   const specs={
    candidate:[
     kit.field('commitSha','Commit Git SHA-1 (40 hex)','text',{pattern:'[a-f0-9]{40}',maxLength:40}),
     kit.field('buildSha256','SHA-256 build','hash'),
     kit.field('evidenceSha256','SHA-256 paket bukti','hash')
    ],
    assignment:[
     kit.options('function','Fungsi reviewer',Object.keys(functions)),
     kit.field('reviewerSubject','Subjek identitas SSO reviewer'),
     kit.field('approvedAppointmentReference','Referensi surat penunjukan resmi')
    ],
    review:[
     kit.options('function','Fungsi penilaian',Object.keys(functions)),
     kit.options('outcome','Keputusan',['approved','rejected']),
     kit.field('evidenceSha256','SHA-256 bukti penilaian','hash'),
     kit.field('evidenceReference','Referensi dokumen penilaian'),
     kit.field('attestation','Pernyataan reviewer independen (min. 35 karakter)','textarea')
    ]
   };
   let editor;
   const load=()=>{editor=kit.mount(host,specs[select.value]);candidateLabel.hidden=select.value!=='review';candidateInput.required=select.value==='review';msg.textContent='';};
   candidateInput.placeholder='xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';candidateLabel.append(candidateInput);modeLabel.append(select);
   submit.type='submit';submit.className='primary';
   form.append(modeLabel,candidateLabel,host,submit,msg);select.onchange=load;load();section.append(form);
   form.onsubmit=async event=>{event.preventDefault();submit.disabled=true;msg.textContent='';try{
    const payload=editor.getValue(),choice=select.value;
    if(choice==='review'&&!/^[a-f0-9-]{36}$/.test(candidateInput.value))throw Error('ID kandidat rilis wajib UUID valid.');
    const path=choice==='candidate'?'/release/candidates':choice==='assignment'?'/release/assignments':'/release/candidates/'+encodeURIComponent(candidateInput.value)+'/reviews';
    const data=await ctx.api(path,{method:'POST',body:JSON.stringify(payload)});
    msg.textContent=choice==='candidate'?'Kandidat rilis dicatat: '+data.id:choice==='review'?'Bukti review tersimpan; belum berarti persetujuan regulator.':'Penunjukan reviewer berhasil dicatat.';
    await renderList();
   }catch(e){msg.textContent=e.message;ctx.notice(e.message,true);}finally{submit.disabled=false;}};
  }
  async function renderList(){
   reviews.replaceChildren(el('h2','Status kandidat dan fungsi reviewer'));
   try{
    const [assignment,data]=await Promise.all([ctx.api('/release/assignments'),ctx.api('/release/candidates')]);
    const a=el('div');a.className='cards';
    for(const [code,name] of Object.entries(functions)){const assigned=assignment.assignments.find(x=>x.function===code),card=el('div');card.className='card';card.append(el('b',name),el('p',assigned?'Ditunjuk: '+assigned.reviewer_subject:'Belum ditunjuk'));a.append(card);}
    reviews.append(a);
    for(const item of data.candidates){const box=el('section');box.className='panel';box.append(el('h3','Commit '+item.candidate.commit_sha.slice(0,12)),el('p','Kandidat: '+item.candidate.id),el('p','Status gate: '+item.approvalStatus));
     for(const f of item.required){const sign=item.reviews.find(v=>v.function===f);box.append(el('p',functions[f]+': '+(sign?sign.outcome+' — '+sign.reviewer_subject:'Menunggu bukti')));}
     box.append(el('p','Status regulatori/production-ready: belum disetujui.'));reviews.append(box);}
    if(!data.candidates.length)reviews.append(el('p','Belum ada kandidat rilis atau persetujuan bank.'));
    ctx.notice('Persetujuan Bank hanya sah apabila seluruh reviewer adalah pihak berwenang yang diverifikasi.');
   }catch(e){reviews.append(el('p',e.message));ctx.notice(e.message,true);}
  }
  await renderList();
 }};
})();
