import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../index.html", import.meta.url), "utf8");
function block(begin, end) {
  const a=source.indexOf(begin), b=source.indexOf(end,a+begin.length);
  assert.ok(a>0&&b>a, "Missing code section "+begin);
  return source.slice(a,b);
}
const basis=[
  {k:"lapor",dq:2},{k:"verif",dq:1},{k:"estimasi",dq:5},
  {k:"kepemilikan",dq:3},{k:"belum",dq:null},{k:"eeio",dq:5}
];
const expCalc = new Function("R","BASIS","gcSecExpCalc",
  block("function expCalc(x) {","/* ---------- SUMMARY AGGREGATOR")+
  "; return expCalc;")(
  (table,key)=>{if(table!=="invest"||key!=="sector-a")throw Error("Unknown factor");return {ef:0.0000005};},
  basis,()=>({af:null,emis:null,fin:null,dq:null})
);
const pcaf=x=>expCalc({basis:"lapor",year:2026,os:50,denom:200,emis:10000,...x});

test("PCAF financing returns transparent, uncapped valid attribution",()=>{
  const r=pcaf({});
  assert.equal(r.af,.25);
  assert.equal(r.fin,2500);
  assert.equal(r.dq,2);
  assert.equal(pcaf({os:200,denom:200}).af,1);
  assert.equal(pcaf({os:0,denom:200}).fin,null,"zero outstanding is not a covered exposure");
});

test("outstanding above denominator or zero/negative denominator is a gap",()=>{
  for(const x of [{os:201},{os:4000},{denom:0},{denom:-10},{denom:null},{os:-1},{os:"n/a"}]){
    const r=pcaf(x);
    assert.equal(r.af,null,JSON.stringify(x));
    assert.equal(r.fin,null,JSON.stringify(x));
    assert.equal(r.dq,null,JSON.stringify(x));
  }
});

test("ownership percentage outside 0–100 cannot create financed emissions",()=>{
  assert.equal(pcaf({basis:"kepemilikan",pct:35}).fin,3500);
  assert.equal(pcaf({basis:"kepemilikan",pct:0}).fin,0);
  assert.equal(pcaf({basis:"kepemilikan",pct:35,os:0}).fin,null,"zero outstanding ownership is not covered");
  for(const pct of [-0.5,101,null,"wrong"]){
    assert.equal(pcaf({basis:"kepemilikan",pct}).fin,null,String(pct));
  }
});

test("negative, missing, invalid debtor emissions and unknown methods never count as coverage",()=>{
  for(const x of [{emis:-3},{emis:null},{emis:""},{emis:"NaN"},{basis:"unknown"},{basis:"belum"}]){
    const r=pcaf(x);
    assert.equal(r.fin,null,JSON.stringify(x));
  }
});

test("EEIO only computes for positive outstanding and a valid applicable factor",()=>{
  assert.equal(pcaf({basis:"eeio",os:50,investKey:"sector-a"}).fin,25);
  for(const x of [{os:null},{os:-5},{os:0},{investKey:"unknown"}]){
    assert.equal(pcaf({basis:"eeio",investKey:"sector-a",...x}).fin,null,JSON.stringify(x));
  }
});

const runCalc = new Function("CAT","gwpCH4","gwpN2O","nn","R","rowId","nf",
  block("function runCalc(cat, inp, y) {","function entryT(")+"; return runCalc;")(
  ()=>({
    f:[{k:"qty",t:"num",label:"Kuantitas"},{k:"ignored",t:"num",label:"Field tersembunyi",show:i=>i.mode==="other"}],
    calc:i=>({co2:Number(i.qty)*.76,ch4:0,n2o:0,oth:0,bio:0,refs:[],L:["uji"]})
  }),
  ()=>28,()=>265,v=>v??0,()=>({}),()=>"",n=>String(n)
);

test("operational calculator refuses negative and invalid visible numeric input",()=>{
  for(const qty of ["-1","-0.001","Infinity","abc"]){
    assert.throws(()=>runCalc("s2_elec",{qty},2026),/harus angka tidak negatif/,qty);
  }
  const valid=runCalc("s2_elec",{qty:"100",ignored:"-9"},2026);
  assert.ok(Math.abs(valid.t-0.076)<1e-12);
  assert.equal(runCalc("s2_elec",{qty:"0"},2026).t,0);
});

test("financing UI and save action explain gaps rather than hiding attribution errors",()=>{
  assert.match(source,/Outstanding melebihi penyebut atribusi\. Koreksi input/);
  assert.match(source,/Periksa nilai sebelum menyimpan/);
  assert.doesNotMatch(block("function expCalc(x) {","/* ---------- SUMMARY AGGREGATOR"),/Math\.min\(x\.os\s*\/\s*x\.denom/);
});

test("form rejects malformed numbers and zero outstanding before persisting",()=>{
  assert.match(source,/el\.value\.trim\(\) && parseNum\(el\.value\) == null/);
  assert.match(source,/x\.os == null \|\| x\.os <= 0/);
  assert.match(source,/Nilai laba negatif tidak didukung/);
});
