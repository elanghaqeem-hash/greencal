/* Buku 3 OJK 2026 — isolated bank sandbox workbench. No browser persistence. */
(()=>{'use strict';
 const el=(t,s)=>{const e=document.createElement(t);if(s!==undefined)e.textContent=s;return e;};
 const EXAMPLES={
  debtor:{debtorRef:'SIM-ABC',year:'2025',sourceMethod:'borrower_report',ojkTier:2,
    evidenceReference:'SIMULASI: laporan keberlanjutan belum diaudit',sourceVersion:'2025',
    sourceAssuranceStatus:'not_third_party_assured',emissions:{scope1:'885087',scope2:'23583',scope3:'686906'}},
  financed:{assetClass:'business_loans',outstanding:'500000000000',attributionDenominator:'12000000000000',
    currency:'IDR',denominatorCurrency:'IDR',denominatorBasis:'equity_plus_debt',
    debtor:{debtorRef:'SIM-ABC',year:'2025',sourceMethod:'borrower_report',ojkTier:2,
      evidenceReference:'SIMULASI: contoh Buku 3 halaman 26',sourceVersion:'2025',
      sourceAssuranceStatus:'not_third_party_assured',emissions:{scope1:'885087',scope2:'23583',scope3:'686906'}}},
  carbon_cost:{debtor:{debtorRef:'SIM-ABC',year:'2025',sourceMethod:'borrower_report',ojkTier:2,
    evidenceReference:'SIMULASI: contoh Buku 3 halaman 26',sourceVersion:'2025',
    sourceAssuranceStatus:'not_third_party_assured',emissions:{scope1:'885087',scope2:'23583',scope3:'686906'}},
    carbonPrice:'800000',carbonPriceUnit:'IDR/tCO2e',reductionFraction:'0.2',
    debtorRevenue:'8000000000000',scenarioReference:'SIMULASI: Net Zero 2050',includeScope2:false},
  activity:{activityQuantity:'1000',activityUnit:'kWh',factorKgCO2ePerUnit:'0.5',factorActivityUnit:'kWh',
    scope:'scope2',reportingYear:'2025',factorYear:'2025',factorSourceTier:'national',
    factorSource:'SIMULASI ONLY — bukan faktor resmi OJK',factorVersion:'SIMULASI',factorEvidence:'SIMULASI TEST'},
  gas_activity:{activityQuantity:'100',activityUnit:'gallons',factorActivityUnit:'gallons',scope:'scope1',
    reportingYear:'2024',factorYear:'2024',factorSourceTier:'international',
    factorSource:'SIMULASI — Annex C Faktor Emisi B9:G9, effective year requires independent review',
    factorVersion:'ANNEX-C-USER-UPLOADED-UNVERIFIED',factorEvidence:'Faktor Emisi!A9:H9',
    co2KgPerUnit:'10.21',ch4GramPerUnit:'0.41',n2oGramPerUnit:'0.08',gwpVersion:'IPCC_AR5_100_YEAR'}
 };
 const display={debtor:'Emisi debitur & OJK Tier',financed:'Financed Emissions · Atribusi PCAF',
  carbon_cost:'Biaya karbon CRSA · Scope 1',activity:'Aktivitas × faktor emisi',gas_activity:'Lampiran C · Per gas CO₂/CH₄/N₂O (GWP AR5)'};
 window.GreenCalBook3={async render(root,{api,notice}){
  root.replaceChildren();
  const intro=el('section');intro.className='panel';intro.append(el('h2','Buku 3 · Metode Penghitungan Emisi'));
  intro.append(el('p','Dua output wajib dipisahkan: emisi penuh debitur untuk CRSA dan porsi financed emissions untuk metrik portofolio. Angka utama financed emissions hanya Scope 1+2, Scope 3 terpisah. Biaya karbon menghitung Scope 1 debitur penuh.'));
  intro.append(el('p','Kualitas data OJK menggunakan Tier 1–4, bukan skor PCAF 1–5. Faktor emisi harus sesuai periode laporan. Contoh di bawah ini SIMULASI saja; faktor gas dan GWP AR5 merujuk workbook terlampir tetapi tahun berlaku, lisensi, dan seluruh rumus belum direkonsiliasi untuk produksi.'));
  root.append(intro);
  const catalog=await api('/book3/catalog');
  const section=el('section');section.className='panel';
  const label=el('label','Pilih engine Buku 3'),select=el('select'),input=el('textarea'),output=el('pre'),status=el('p');
  input.rows=15;input.spellcheck=false;input.setAttribute('aria-label','Payload JSON Buku 3');output.className='result';
  for(const method of catalog.methods){const opt=el('option',display[method]||method);opt.value=method;select.append(opt);}
  label.append(select);section.append(label);
  const sub=el('p','Ubah seluruh contoh simulasi menggunakan sumber yang telah disetujui Bank. Tidak ada autosave.');section.append(sub);
  const inputLabel=el('label','Data perhitungan (JSON)');inputLabel.append(input);section.append(inputLabel);
  const run=el('button','Hitung & validasi');run.type='button';run.className='primary';
  section.append(run,status,output);root.append(section);
  const load=()=>{input.value=JSON.stringify(EXAMPLES[select.value],null,2);output.textContent='';status.textContent='';};
  select.onchange=load;load();
  run.onclick=async()=>{
   run.disabled=true;status.textContent='';
   try{
    const data=JSON.parse(input.value),response=await api('/book3/validate',{method:'POST',body:JSON.stringify({kind:select.value,payload:data})});
    output.textContent=JSON.stringify(response.result,null,2);
    notice('Hasil simulasi Buku 3 tersedia. Perhitungan tidak disimpan sebagai hasil produksi atau laporan OJK.');
   }catch(e){status.textContent=e.message;status.className='error';notice(e.message,true);}
   finally{run.disabled=false;}
  };
  const explain=el('section');explain.className='panel';explain.append(el('h3','Persyaratan sebelum digunakan dalam laporan Bank'));
  for(const text of ['Verifikasi data emisi dan atribut OJK Tier terhadap sumber dan Buku 2.',
   'Pastikan nilai outstanding, EVIC/ekuitas+utang, nilai properti atau modal proyek konsisten per tanggal dan mata uang.',
   'Perbarui registri faktor menurut tahun dan versi kalkulator OJK; Lampiran C Excel harus direkonsiliasi tersendiri.',
   'Integrasikan estimasi dengan portofolio CBS/GL/CKPN dan kertas kerja Buku 6 melalui maker-checker-approver.',
   'Gunakan CRSA dari emisi Scope 1 penuh milik debitur, tanpa mengalikan faktor atribusi financed emissions.']){
   explain.append(el('p',text));
  }root.append(explain);
 }};
})();
