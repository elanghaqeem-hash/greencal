/* OJK 2026 Books 1, 2, 4 — bank-gated, source-controlled workbench. No browser persistence. */
(()=>{'use strict';
const H=(tag,txt)=>{const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;return e;};
const field=(parent,label,tag='input')=>{const l=H('label',label),x=H(tag);if(tag==='input')x.type='text';l.append(x);parent.append(l);return x;};
const message=(parent,txt)=>parent.append(H('p',txt));
const clear=root=>root.replaceChildren();
const format=x=>JSON.stringify(x,null,2);
function action(parent,title,handler){const b=H('button',title);b.type='button';b.className='primary';b.onclick=async()=>{b.disabled=true;try{await handler();}finally{b.disabled=false;}};parent.append(b);return b;}
function display(parent,result){let output=parent.querySelector('pre.result');if(!output){output=H('pre');output.className='result';parent.append(output);}output.textContent=format(result);}
function parseCsv(s){
 const lines=s.replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 if(lines[0]!=='year,scenario,value')throw Error('Header CSV wajib: year,scenario,value');
 return lines.slice(1).map((line,i)=>{
  const c=line.split(',').map(x=>x.trim());
  if(c.length!==3)throw Error('Baris '+(i+2)+' wajib memiliki tiga kolom tanpa koma ribuan.');
  return {year:Number(c[0]),scenario:c[1],value:c[2]};
 });
}
window.GreenCalBooks124={async render(root,{api,notice}){
 clear(root);
 const cat=await api('/books124/catalog');
 const intro=H('section');intro.className='panel';
 intro.append(H('h2','OJK CRMS 2026 · Buku 1, 2 dan 4'));
 message(intro,'Buku 1: tata kelola, strategi, manajemen risiko, pengungkapan. Buku 2: transmisi risiko iklim ke kredit, pasar, likuiditas dan operasional. Buku 4: asumsi makroekonomi 2025–2050 yang dipakai Buku 2 dan Buku 7.');
 message(intro,'Reference merupakan pembanding pada tahun yang sama dan tidak boleh dilaporkan sebagai skenario. Hasil panel ini hanya pengujian internal dan tidak otomatis mengubah data Buku 6 atau model PD/LGD/EAD.');
 const ul=H('ul');cat.documents.forEach(d=>ul.append(H('li','Buku '+d.book+' · '+d.title+' · '+d.pages+' halaman · SHA-256 '+d.sha256.slice(0,16)+'…')));intro.append(ul);root.append(intro);
 const a=H('section');a.className='panel';a.append(H('h2','Buku 1 · Kelengkapan bukti empat pilar'));
 const ev={};
 for(const k of cat.pillars){ev[k]=field(a,k.replaceAll('_',' ')+' (satu referensi dokumen per baris)','textarea');ev[k].rows=2;}
 action(a,'Evaluasi kelengkapan bukti',async()=>{
  try{const evidence={};for(const k of cat.pillars)evidence[k]=ev[k].value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
   const r=await api('/books124/validate',{method:'POST',body:JSON.stringify({kind:'book1_governance',payload:{evidence}})});display(a,r.result);notice('Bukti dicatat sebagai deklarasi; review independen tetap diperlukan.');
  }catch(e){notice(e.message,true);}
 });root.append(a);
 const b=H('section');b.className='panel';b.append(H('h2','Buku 2 · Biaya karbon sebagai risk driver'));
 message(b,'Rumus Buku 2: biaya karbon = harga karbon × tingkat emisi yang harus diturunkan. Input menggunakan IDR/tCO₂e dan tCO₂e. Hasil belum berupa penyesuaian PD atau CKPN.');
 const price=field(b,'Harga karbon (IDR per tCO₂e)'),reduction=field(b,'Emisi yang harus diturunkan (tCO₂e)');
 action(b,'Hitung biaya karbon',async()=>{
  try{const r=await api('/books124/validate',{method:'POST',body:JSON.stringify({kind:'book2_carbon_cost',payload:{carbonPrice:price.value,emissionsToReduce:reduction.value,carbonPriceUnit:'IDR/tCO2e'}})});
   display(b,r.result);notice('Biaya karbon sensitivitas dihitung; pemodelan PD/LGD/EAD tetap memerlukan validasi.');
  }catch(e){notice(e.message,true);}
 });root.append(b);
 const c=H('section');c.className='panel';c.append(H('h2','Buku 4 · Validasi seri skenario makroekonomi'));
 message(c,'Gunakan CSV hasil transkripsi dan verifikasi independen terhadap tabel resmi Buku 4. Satu file berisi tepat 104 baris (26 tahun × 4 jalur), header year,scenario,value. Jangan gunakan ini untuk mengisi angka OJK secara otomatis tanpa pemeriksaan.');
 const variable=field(c,'Kode variabel (contoh: FFRM_IDN)'),unit=field(c,'Satuan sesuai tabel OJK'),page=field(c,'Halaman PDF sumber');
 const type=field(c,'Jenis variabel (stock, flow atau rate)','select');['stock','flow','rate'].forEach(k=>{const o=H('option',k);o.value=k;type.append(o);});
 const file=field(c,'CSV 104 observasi (maksimum 16 KB)');file.type='file';file.accept='.csv,text/csv';
 const scenario=field(c,'Skenario untuk perbandingan','select');cat.reportablePaths.forEach(k=>{const o=H('option',k);o.value=k;scenario.append(o);});
 const year=field(c,'Tahun analisis (2025–2050)');year.value='2030';
 action(c,'Validasi dan bandingkan terhadap Reference',async()=>{
  try{
   if(!file.files?.[0]||file.files[0].size>16384)throw Error('CSV wajib dipilih dan dibatasi 16 KB.');
   const observations=parseCsv(await file.files[0].text()),source=cat.documents.find(d=>d.book===4);
   const series={variable:variable.value,unit:unit.value,sourcePage:Number(page.value),sourceSha256:source.sha256,seriesType:type.value,observations};
   const validation=await api('/books124/validate',{method:'POST',body:JSON.stringify({kind:'book4_validate',payload:series})});
   const deviation=await api('/books124/validate',{method:'POST',body:JSON.stringify({kind:'book4_deviation',payload:{series,scenario:scenario.value,year:Number(year.value)}})});
   display(c,{validation:validation.result,deviation:deviation.result});
   notice('Seri tervalidasi secara struktural, tetapi masih menunggu review independen sumber dan persetujuan Bank.');
  }catch(e){notice(e.message,true);}
 });root.append(c);notice('Katalog Buku 1/2/4 dimuat. Validasi input memerlukan aktivasi institusi.');
}};
})();
