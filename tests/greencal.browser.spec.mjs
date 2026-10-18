import {test,expect} from "@playwright/test";
const base="http://127.0.0.1:4173";
test("public desktop loads without login and navigates available modules",async({page})=>{
  await page.goto(base);
  await expect.poll(()=>page.evaluate(()=>window.GC_AUTH?.scopeReady)).toBe(true);
  await expect(page.locator("#gcAuthGate")).toHaveCount(0);
  for(const tab of ["ringkasan","wizard","aktivitas","pembiayaan","transisi","offset","ai","panduan"]){
    await page.locator('.desktop-nav button[data-tab="'+tab+'"]').click();
    await expect(page.locator("#view-"+tab)).toBeVisible();
  }
});
test("wizard cards render real forms for six entry types",async({page})=>{
  await page.goto(base);
  await page.locator('.desktop-nav button[data-tab="wizard"]').click();
  for(const type of ["listrik","bbm","ac","dinas","debitur","surat-berharga"]){
    const card=page.locator('.wizard-card[data-wz="'+type+'"]');
    await card.click();
    await expect(card).toHaveAttribute("aria-pressed","true");
    await expect(page.locator("#wizardFormPanel")).not.toBeEmpty();
  }
});
test("device data is preserved after reload but isolated across browser contexts",async({browser})=>{
  const one=await browser.newContext(),two=await browser.newContext();
  const a=await one.newPage(),b=await two.newPage();
  try{
    await a.goto(base);await expect.poll(()=>a.evaluate(()=>window.GC_AUTH?.scopeReady)).toBe(true);
    await a.evaluate(()=>window.GC_AUTH.queue(()=>({entries:[{id:"e2e-sample",year:2026,cat:"s2_elec",inputs:{qty:"10"}}],exposures:[],offsets:[],narrativeDrafts:{}})));
    await expect.poll(async()=>{
      const r=await a.evaluate(async()=>await (await fetch("/api/public/state")).json());
      return r.data?.entries?.[0]?.id;
    }).toBe("e2e-sample");
    await a.reload();
    await expect.poll(async()=>await a.evaluate(async()=> (await(await fetch("/api/public/state")).json()).data?.entries?.[0]?.id)).toBe("e2e-sample");
    await b.goto(base);
    await expect.poll(async()=>await b.evaluate(async()=> (await(await fetch("/api/public/state")).json()).data?.entries?.length??0)).toBe(0);
  }finally{await one.close();await two.close();}
});
test("AI button reaches server endpoint with data-only payload",async({page})=>{
  await page.goto(base);
  await page.locator('.desktop-nav button[data-tab="ai"]').click();
  const reqPromise=page.waitForRequest(r=>r.url().endsWith("/api/ai/analyze")&&r.method()==="POST");
  await page.locator("#btnRunAi").click();
  const request=await reqPromise;
  const body=request.postDataJSON();
  expect(typeof body.year).toBe("number");
  expect(body.apiKey).toBeUndefined();
  expect(body.password).toBeUndefined();
  await expect(page.locator("#aiContentBox")).toContainText("AI Cloud");
});
test("mobile viewport keeps content within screen and exposes wizard",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto(base);
  await expect.poll(()=>page.evaluate(()=>window.GC_AUTH?.scopeReady)).toBe(true);
  await page.locator('.mobile-nav [data-tab="wizard"]').click();
  await expect(page.locator("#view-wizard")).toBeVisible();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(3);
});
