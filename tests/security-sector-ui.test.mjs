import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
const code=html.slice(html.lastIndexOf("<script>")+8,html.lastIndexOf("</script>"));
const css=html.slice(html.indexOf("<style"),html.indexOf("</style>")+8);
const sectorStart=code.indexOf("function gcPcafSectorOptions(");
const sectorEnd=code.indexOf("function gcPcafSectorValue(",sectorStart);
assert.ok(sectorStart>=0 && sectorEnd>sectorStart,"Missing sector options helper");
const sectorFunction=code.slice(sectorStart,sectorEnd);
const groups=[{label:"Industri",items:["Manufaktur","Pertambangan"]},{label:"Jasa",items:["Perbankan","Perdagangan"]}];
const escaped=t=>String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const sectorOptions=new Function("GC_PCAF_SECTOR_GROUPS","esc",sectorFunction+";return gcPcafSectorOptions;")(groups,escaped);

test("issuer field has correct placeholder while debtor financing remains unchanged",()=>{
 const debtor=sectorOptions();
 const issuer=sectorOptions("penerbit");
 assert.ok(debtor.includes("Pilih sektor usaha debitur..."));
 assert.ok(issuer.includes("Pilih sektor usaha penerbit..."));
 assert.ok(!issuer.includes("Pilih sektor usaha debitur..."));
 assert.ok(!debtor.includes("Pilih sektor usaha penerbit..."));
 assert.equal(issuer.replace("penerbit...","debitur..."),debtor,
   "The sector taxonomy and option values must remain identical across both contexts");
 assert.match(code,/gcPcafSectorOptions\("penerbit"\)/);
 assert.match(code,/'<select id="wzX_sec"/);
 assert.match(code,/gcPcafSectorOptions\(\)/);
});

test("issuer selector is a single native select with its original value and lookup bindings",()=>{
 for(const id of ["wzS_sector","wzS_sectorHint","wzS_sectorOther"])
   assert.equal(html.split('id="'+id+'"').length-1,1,id+" duplicate or missing");
 assert.match(code,/'<label class="field-label" for="wzS_sector">Sektor Usaha Penerbit/);
 assert.match(code,/'<select id="wzS_sector" aria-describedby="wzS_sectorHint">/);
 assert.match(code,/'<span class="gc-security-sector-icon" aria-hidden="true">/);
 assert.match(code,/'<span class="gc-security-sector-chevron" aria-hidden="true">/);
 assert.match(code,/e\("wzS_sector"\)\.onchange=update/);
 assert.match(code,/e\("wzS_sector"\)\.disabled=sovereign\|\|!eligible/);
 assert.match(code,/e\("wzS_sector"\)\.value==="__custom__"/);
 assert.match(code,/e\("wzS_sector"\)\.dispatchEvent\(new Event\("change"\)\)/);
 assert.match(code,/const sector=t\.group==="sovereign"\?"Pemerintah \/ Sovereign":sectorValue\(\)/);
 assert.match(code,/GC_PCAF_SECTOR_INDEX\.get\(sector\)/);
});

test("mobile search supports issuer sector without hiding or changing original select",()=>{
 assert.match(code,/sel\.id === "wzS_sector"/);
 assert.match(code,/sel\.disabled/);
 assert.match(code,/sel\.options\.length >= 4/);
 assert.match(code,/active\.dispatchEvent\(new Event\("change",\{bubbles:true\}\)\)/);
 assert.match(code,/window\.matchMedia\("\(max-width: 859px\)"\)/);
});

test("design has clear icons, focus, disabled state and compact responsive sizing",()=>{
 assert.match(css,/GreenCal · Surat Berharga \/ PCAF · Sektor Usaha Penerbit control/);
 assert.match(css,/#wizardFormPanel \.gc-security-sector-control:focus-within/);
 assert.match(css,/#wizardFormPanel \.gc-security-sector-control:has\(> #wzS_sector:disabled\)/);
 assert.match(css,/#wizardFormPanel \.gc-security-sector-control>#wzS_sector/);
 assert.match(css,/#wizardFormPanel \.gc-security-sector-field:not\(\.has-value\) #wzS_sector/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(css,/#wizardFormPanel \.gc-security-sector-field>\.sr-only/);
 assert.match(code,/sectorField\.classList\.toggle\("has-value"/);
 assert.doesNotMatch(css,/\bwidth:\s*100vw\b/);
});

test("entire GreenCal application script remains valid JavaScript",()=>{
 assert.ok(code.length>200000);
 assert.doesNotThrow(()=>new Function(code));
});
