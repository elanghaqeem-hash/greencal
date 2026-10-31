import assert from "node:assert/strict";
import { chromium } from "playwright";

// Pure local browser test: mock Cloudflare identity, never read or mutate production DB.
const browser=await chromium.launch({headless:true});
try {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();
  let ip="a".repeat(64);
  await page.route("**/api/client-scope",r=>r.fulfill({status:200,contentType:"application/json",body:JSON.stringify({scope:ip})}));
  await page.route("**/api/ai/status",r=>r.fulfill({status:200,contentType:"application/json",body:JSON.stringify({ok:true,role:"public",publicCloudEnabled:false})}));
  await page.goto(process.env.GREENCAL_SMOKE_URL||"http://127.0.0.1:8787",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>window.GC_AUTH?.scopeReady === true && window.S?.year>0);
  assert.equal(await page.locator(".gc-account-bar:visible").count(),0,"do not display 'Akses Publik'");
  await page.evaluate(()=>{
    const k=window.GC_AUTH.scopedKey("activity-draft");
    const t=window.GC_AUTH.scopedKey("transition-scenario");
    localStorage.setItem(k,JSON.stringify({cat:"s2_elec",desc:"Draft from IP A"}));
    localStorage.setItem(t,JSON.stringify({"a|2026":{price:150,red:20,source:"P1 test"}}));
  });
  assert.equal(await page.evaluate(()=>window.getActivityDraft()?.desc),"Draft from IP A");
  assert.ok(Object.keys(await page.evaluate(()=>window.transLoadOverrides())).length>0);
  ip="b".repeat(64);
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>window.GC_AUTH?.scopeReady===true);
  assert.equal(await page.evaluate(()=>window.getActivityDraft()),null,"IP B must not see IP A draft");
  assert.deepEqual(await page.evaluate(()=>window.transLoadOverrides()),{},"IP B must not see IP A scenarios");
  assert.equal(await page.evaluate(()=>window.S.entries.length),0);
  ip="a".repeat(64);
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>window.GC_AUTH?.scopeReady===true);
  assert.equal(await page.evaluate(()=>window.getActivityDraft()?.desc),"Draft from IP A");
  assert.ok(Object.keys(await page.evaluate(()=>window.transLoadOverrides())).length>0);
  await page.evaluate(()=>window.GC_AUTH.resetCurrentScope());
  assert.equal(await page.evaluate(()=>window.getActivityDraft()),null);
  assert.deepEqual(await page.evaluate(()=>window.transLoadOverrides()),{});
  assert.equal(await page.evaluate(()=>{
    const key="greencal_ip_scope_v1_"+"a".repeat(64);
    return localStorage.getItem(key)===null && localStorage.getItem(key+":activity-draft")===null
      && localStorage.getItem(key+":transition-scenario")===null;
  }),true);
  console.log("PASS: mobile P1 IP A → IP B isolation, restored IP A and full explicit reset");
} finally{await browser.close();}
