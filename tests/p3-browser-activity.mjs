import assert from "node:assert/strict";
import {chromium} from "playwright";

const base=process.env.GREENCAL_SMOKE_URL||"http://127.0.0.1:8787";
const browser=await chromium.launch({headless:true});
try {
 for(const mobile of [false,true]){
  const context=await browser.newContext({
   viewport:mobile?{width:390,height:844}:{width:1365,height:850},
   isMobile:mobile,hasTouch:mobile
  });
  const page=await context.newPage();
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/api/client-scope",r=>r.fulfill({
   status:200,contentType:"application/json",
   body:JSON.stringify({scope:"f".repeat(64)})
  }));
  await page.route("**/api/ai/status",r=>r.fulfill({
   status:200,contentType:"application/json",
   body:JSON.stringify({ok:true,role:"public",publicCloudEnabled:false})
  }));
  const response=await page.goto(base,{waitUntil:"domcontentloaded",timeout:45000});
  assert.equal(response.status(),200);
  await page.waitForFunction(()=>window.GC_AUTH?.scopeReady===true);
  await page.evaluate(()=>setTab("aktivitas"));
  await page.locator("#aCat").selectOption("s2_elec");
  await page.locator("#f_qty").fill("");
  assert.match(await page.locator("#aResult").innerText(),/Isi Konsumsi listrik/);
  assert.equal(await page.locator("#aResult .result-val").count(),0,"missing quantity must not be zero");
  const prevCount=await page.evaluate(()=>S.entries.length);
  await page.locator("#aSave").click();
  assert.equal(await page.evaluate(()=>S.entries.length),prevCount,"invalid activity must not save");

  await page.locator("#f_qty").fill("100");
  assert.equal(await page.locator("#aResult .result-val").count(),1,"valid electricity result");
  await page.locator("#aResult .gc-factor-trace summary").click();
  // Read the complete DOM text even if the accordion rerenders/starts closed
  // during a form-field blur; factor lineage must always exist in the markup.
  const trace=await page.locator("#aResult .gc-factor-trace").textContent();
  assert.match(trace,/Buku 3 CRMS/);
  assert.match(trace,/verifikasi independen/);
  await page.locator("#aSave").click();
  await page.waitForFunction(()=>S.entries.length===1);
  const saved=await page.evaluate(()=>S.entries[0]?.res?.refs);
  assert.ok(saved.length>=1&&saved[0].src,"saved entry must retain source lineage");

  await page.locator("#aCat").selectOption("s3_c6");
  await page.locator("#f_m").selectOption("hotel");
  await page.locator("#f_hotelName").fill("Hotel Nusantara");
  await page.locator("#f_hotelCity").fill("Jakarta");
  await page.locator("#f_guests").fill("2");
  await page.locator("#f_nights").fill("3");
  assert.equal(await page.locator("#aResult .result-val").count(),1,"hotel names must remain text");
  assert.deepEqual(errors,[],mobile?"mobile browser errors":"desktop browser errors");
  console.log("PASS: P3.1",mobile?"mobile":"desktop","missing input, saved factor lineage, hotel names");
  await context.close();
 }
} finally {
 await browser.close();
}
