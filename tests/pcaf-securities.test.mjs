import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const start = source.indexOf("/* GC_SEC_PCAF_V1 — No external factors");
const end = source.indexOf("/* ---------- DATA AKTIVITAS VIEW ---------- */", start);
assert.ok(start > -1 && end > start, "PCAF surat berharga module must exist");
const core = source.slice(start, end);
const api = runInNewContext(
  "(() => { const BASIS = [" +
  '{k:"verif",dq:1},{k:"lapor",dq:2},{k:"fisik",dq:3},' +
  '{k:"estimasi",dq:5},{k:"belum",dq:null}' +
  "]; " + core + " return { calc:gcSecExpCalc, meta:gcSecMeta }; })()"
);
const calc = obj => api.calc({basis:"lapor",evidence:"Laporan resmi, tahun dan halaman",...obj});

test("kategori SBN, sukuk, saham dan obligasi tersedia", () => {
  for (const type of ["sbn","sbsn","saham_tercatat","saham_tidak_tercatat",
    "obligasi_korporasi","sukuk_korporasi","green_bond_korporasi","etf"]) {
    assert.ok(api.meta(type), "missing security type "+type);
  }
});
test("obligasi emiten: nilai eksposur dibagi EVIC dikali emisi", () => {
  const r=calc({securityType:"obligasi_korporasi",os:50,denom:200,emis:10000});
  assert.equal(r.af,0.25);
  assert.equal(r.fin,2500);
  assert.equal(r.dq,2);
});
test("SBN sovereign: PDB PPP dan konfirmasi kesetaraan mata uang wajib", () => {
  const x={securityType:"sbn",os:20,denom:2000,emis:1000000};
  assert.equal(calc(x).fin,null);
  assert.equal(calc({...x,pppConfirmed:true}).fin,10000);
});
test("saham privat: total ekuitas dan utang", () => {
  assert.equal(calc({securityType:"saham_tidak_tercatat",os:10,denom:40,emis:1200}).fin,300);
});
test("ETF, reksa dana dan instrumen klasifikasi manual tidak dihitung otomatis", () => {
  for (const securityType of ["etf","reksa_dana","obligasi_daerah","lainnya"]) {
    assert.equal(calc({securityType,os:10,denom:40,emis:1200}).fin,null);
  }
});
test("tanpa bukti, tanpa penyebut, eksposur lebih besar penyebut dan basis belum adalah gap", () => {
  const x={securityType:"saham_tercatat",os:10,denom:40,emis:1200};
  assert.equal(calc({...x,evidence:""}).fin,null);
  assert.equal(calc({...x,denom:null}).fin,null);
  assert.equal(calc({...x,os:100}).fin,null);
  assert.equal(calc({...x,basis:"belum"}).fin,null);
  assert.equal(calc({...x,emis:null}).fin,null);
});
test("skrip halaman valid dan alur simpan/edit/ekspor terintegrasi", () => {
  assert.match(source,/data-wz="surat-berharga"/);
  assert.match(source,/assetKind === "security"/);
  assert.match(source,/gcFillSecurityWizard\(x\)/);
  assert.match(source,/x\.isin \|\| ""/);
});
