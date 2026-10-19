import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const extract=(start,end)=>{
 const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
 assert.ok(a>0&&b>a,"Missing "+start);
 return html.slice(a,b);
};
const measurementCore=extract("function gcValidateActivityInputs(c, inp) {","function entryT(");
const fields=(...definitions)=>definitions.map(([k,label,extra])=>({k,t:"num",label,...extra}));
const catalog={
 s2_elec:{f:fields(["qty","Konsumsi listrik"])},
 s1_stat:{f:fields(["qty","Jumlah dibakar"])},
 s1_mob:{f:fields(["qty","BBM per kendaraan"],["veh","Jumlah kendaraan"])},
 s1_ref:{f:fields(["inv","Persediaan",{show:i=>(i.m||"neraca")==="neraca"}],
     ["tr","Transfer",{show:i=>(i.m||"neraca")==="neraca"}],
     ["cc","Kapasitas",{show:i=>(i.m||"neraca")==="neraca"}],
     ["nc","Pengisian",{show:i=>i.m==="penapisan"}],
     ["capop","Kapasitas berjalan",{show:i=>i.m==="penapisan"}],
     ["dcap","Kapasitas dibuang",{show:i=>i.m==="penapisan"}],
     ["mon","Bulan beroperasi",{show:i=>i.m==="penapisan"}])},
 s1_fire:{f:fields(["cap","Kapasitas",{show:i=>i.m==="penapisan"}],
     ["inv","Persediaan",{show:i=>(i.m||"neraca")!=="penapisan"}],
     ["tr","Transfer",{show:i=>(i.m||"neraca")!=="penapisan"}],
     ["cc","Kapasitas",{show:i=>(i.m||"neraca")!=="penapisan"}])},
 s2_steam:{f:fields(["qty","Uap dibeli"],["eff","Efisiensi ketel"])},
 s3_c7:{f:fields(["vm","Jarak pribadi",{show:i=>i.m!=="umum"}],
     ["dist","Jarak harian",{show:i=>i.m==="umum"}],
     ["emp","Jumlah karyawan",{show:i=>i.m==="umum"}],
     ["days","Hari kerja",{show:i=>i.m==="umum"}])},
 s3_c4:{f:fields(["vm","Jarak armada",{show:i=>i.m!=="tm"}],
     ["w","Berat kargo",{show:i=>i.m==="tm"}],
     ["dist","Jarak kirim",{show:i=>i.m==="tm"}])},
 s3_c8:{f:fields(["area","Luas",{show:i=>!i.m||i.m==="luas"}],
     ["units","Jumlah gedung",{show:i=>!i.m||i.m==="luas"}],
     ["kwh","Konsumsi listrik",{show:i=>i.m==="listrik"}],
     ["qty","Jumlah BBM",{show:i=>i.m==="bbm"}])},
 s3_c6:{f:fields(["hotelName","Nama hotel",{text:true}],
     ["hotelCity","Kota hotel",{text:true}],
     ["guests","Jumlah tamu",{show:i=>i.m==="hotel"}],
     ["nights","Jumlah malam",{show:i=>i.m==="hotel"}])}
};
for(const [id,cat] of Object.entries(catalog)){
 cat.id=id;
 cat.calc=i=>({co2:(Number(i.qty||i.guests||1)*.76),ch4:1,n2o:0,oth:0,bio:0,
   refs:[["grid","TEST"]],L:["uji"]});
}
const mockR=(table,key,year)=>{
 assert.equal(year,2026);
 return {key,src:"Buku 3 CRMS 2026 — rujukan katalog",name:key,
   validFrom:2020,validTo:2035,v:1,status:"terverifikasi"};
};
const api=new Function("CAT","gwpCH4","gwpN2O","nn","R","rowId","nf",
  measurementCore+"; return {validate:gcValidateActivityInputs,run:runCalc};")(
  id=>catalog[id],()=>28,()=>265,v=>v??0,mockR,r=>r.key+"@"+r.validFrom,n=>String(n)
);
const calc=(id,inp)=>api.run(id,inp,2026);

test("missing activity quantity is never silently calculated as zero",()=>{
 for(const id of ["s2_elec","s1_stat","s1_mob"]){
  assert.throws(()=>calc(id,{qty:""}),/Isi .* untuk menghitung emisi/,id);
  assert.throws(()=>calc(id,{qty:null}),/Isi .* untuk menghitung emisi/,id);
 }
 assert.ok(Number.isFinite(calc("s2_elec",{qty:"0"}).t),"explicit zero is allowed");
 assert.ok(calc("s2_elec",{qty:"100"}).t>0);
});

test("branch-dependent required measurements are checked without demanding hidden fields",()=>{
 const cases=[
  ["s3_c7",{m:"umum",dist:"15"}],
  ["s3_c7",{m:"pribadi"}],
  ["s3_c4",{m:"tm",w:"2"}],
  ["s3_c4",{m:"vm"}],
  ["s3_c8",{m:"luas"}],
  ["s3_c8",{m:"listrik"}],
  ["s3_c8",{m:"bbm"}]
 ];
 for(const [id,inp] of cases)assert.throws(()=>calc(id,inp),/Isi .* untuk menghitung emisi/,id+":"+JSON.stringify(inp));
 assert.doesNotThrow(()=>calc("s3_c7",{m:"pribadi",vm:"15",dist:""}));
 assert.doesNotThrow(()=>calc("s3_c4",{m:"tm",w:"2",dist:"18",vm:""}));
 assert.doesNotThrow(()=>calc("s3_c8",{m:"listrik",kwh:"250",area:""}));
});

test("refrigerant and fire extinguisher balances require at least one measured amount",()=>{
 for(const id of ["s1_ref","s1_fire"]){
  assert.throws(()=>calc(id,{m:"neraca"}),/Isi minimal satu pengukuran/);
  assert.doesNotThrow(()=>calc(id,{m:"neraca",inv:"0"}));
 }
 assert.throws(()=>calc("s1_ref",{m:"penapisan",mon:"12"}),/Isi minimal satu pengukuran/);
 assert.throws(()=>calc("s1_fire",{m:"penapisan"}),/Isi .* untuk menghitung emisi/);
});

test("hotel name/city remain text; non-numeric metadata never blocks calculation",()=>{
 const result=calc("s3_c6",{m:"hotel",hotelName:"Hotel Nusantara Jakarta",hotelCity:"Bandung, Indonesia",guests:"2",nights:"3"});
 assert.ok(Number.isFinite(result.t));
 assert.ok(result.refs.some(ref=>ref.src.includes("Buku 3")));
 assert.doesNotThrow(()=>calc("s3_c6",{m:"hotel",hotelName:"Hotel 2",hotelCity:"Daerah Khusus Ibukota Jakarta",guests:"2",nights:"3"}));
});

test("numeric ranges are enforced for steam efficiency, months and counts",()=>{
 for(const eff of ["0","-1","101","Infinity","text"]){
  assert.throws(()=>calc("s2_steam",{qty:"100",eff}),/harus|Efisiensi|angka/);
 }
 assert.doesNotThrow(()=>calc("s2_steam",{qty:"100",eff:"80"}));
 for(const mon of ["0","13","-2"]){
  assert.throws(()=>calc("s1_ref",{m:"penapisan",nc:"2",mon}),/harus|Bulan/);
 }
 assert.throws(()=>calc("s1_mob",{qty:"10",veh:"0"}),/lebih besar dari nol/);
});

test("factor result records provenance, period, version and the methane GWP used",()=>{
 const r=calc("s2_elec",{qty:"100"});
 assert.equal(r.refs.length,2);
 assert.ok(r.refs.some(ref=>ref.t==="gwp"&&ref.k==="METHANE"));
 for(const ref of r.refs){
  assert.ok(ref.src);
  assert.equal(ref.v,1);
  assert.equal(ref.validFrom,2020);
  assert.equal(ref.validTo,2035);
  assert.equal(ref.catalogStatus,"terverifikasi");
 }
 assert.match(html,/gc-factor-trace/);
 assert.match(html,/bukan bukti verifikasi independen/);
 assert.match(html,/refs: r\.refs/);
});

test("embedded factor catalogue has traceable metadata without contradictory date ranges",()=>{
 const start=html.indexOf('id="baseline"');
 assert.ok(start>0);
 const baseline=JSON.parse(html.slice(html.indexOf(">",start)+1,html.indexOf("</script>",start)));
 let rowsCount=0;
 for(const [name,rows] of Object.entries(baseline.tables)){
  const seen=new Set();
  for(const row of rows){
   rowsCount++;
   assert.ok(String(row.src||"").trim(),name+" "+row.key+" source missing");
   assert.ok(String(row.status||"").trim(),name+" "+row.key+" status missing");
   assert.ok(Number.isFinite(row.v),name+" "+row.key+" version missing");
   assert.ok(row.validFrom<=row.validTo,name+" "+row.key+" invalid years");
   const identity=row.key+"@"+row.validFrom;
   assert.ok(!seen.has(identity),name+" duplicate "+identity);
   seen.add(identity);
  }
 }
 assert.ok(rowsCount>=883,"factor count must not shrink silently");
});
