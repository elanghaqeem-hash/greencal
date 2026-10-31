/* Seven-Book OJK readiness panel. Public diagnostic only; never displays confidential bank data. */
(()=>{'use strict';
 const create=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
 async function show(){
  const root=document.getElementById('ojkReadiness');if(!root)return;
  const title=create('h2','Kesesuaian CRMS OJK 2026 · Buku 1–7'),
        notice=create('p','Status ini menunjukkan pemeriksaan kesesuaian berbasis bukti. Build READY bukan kepatuhan OJK atau izin produksi bank.');
  root.append(title,notice);
  try{
   const response=await fetch('/api/ojk-readiness',{cache:'no-store',credentials:'same-origin'});
   if(!response.ok)throw new Error('Layanan asesmen kesesuaian belum tersedia.');
   const report=await response.json();
   const status=create('p',report.status==='PASS'?'Seluruh gate bank terverifikasi':'Belum memenuhi seluruh gate operasional dan metodologi OJK');
   status.setAttribute('role','status');root.append(status);
   const table=create('table'),head=create('thead'),header=create('tr');
   for(const col of ['Buku','Status kesesuaian','Kontrol terverifikasi','Prioritas gap'])header.append(create('th',col));
   head.append(header);table.append(head);
   const body=create('tbody');
   for(const book of report.books||[]){
    const tr=create('tr'),block=(book.controls||[]).filter(c=>!c.verified);
    for(const value of ['Buku '+book.book+' — '+book.title,book.status,
      book.verified+'/'+book.total,block.length?block[0].description:'Tidak ada gap terdaftar'])tr.append(create('td',String(value)));
    body.append(tr);
   }
   table.append(body);
   const wrap=create('div');wrap.className='tableWrap';wrap.append(table);root.append(wrap);
   const explain=create('p','PASS internal membutuhkan seluruh kontrol per buku, pengesahan sumber data, UAT, serta persetujuan Risk, Finance, Compliance, TI dan validator independen. Belum ada klaim sertifikasi atau persetujuan OJK.');
   root.append(explain);
  }catch(e){root.append(create('p',e.message));}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',show,{once:true});
 else show();
})();
