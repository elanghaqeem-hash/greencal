import assert from "node:assert/strict";
import { chromium } from "playwright";

// Runs against a local build, never changes the live database.
const base = process.env.GREENCAL_SMOKE_URL || "http://127.0.0.1:8787";
const scope = "c".repeat(64);

async function check(variant) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: variant === "mobile" ? { width: 390, height: 844 } : { width: 1365, height: 880 },
    isMobile: variant === "mobile",
    hasTouch: variant === "mobile"
  });
  const page = await context.newPage();
  const failures = [];
  page.on("pageerror", e => failures.push(e.message));
  // Simulates the production API identity response without sending any real data.
  await page.route("**/api/client-scope", route => route.fulfill({
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
    body: JSON.stringify({ scope })
  }));
  try {
    const r = await page.goto(base + "/", { waitUntil: "domcontentloaded", timeout: 45000 });
    assert.equal(r.status(), 200, variant + ": root should load");
    await page.waitForFunction(() => window.GC_AUTH?.scopeReady === true, { timeout: 20000 });
    await page.waitForFunction(() => document.querySelector("#dashYear")?.options.length > 0, null, { timeout: 15000 });
    assert.equal(await page.locator("#view-ringkasan").isVisible(), true);

    async function openTab(tab) {
      if (variant === "mobile") {
        await page.locator("#gcSidebarToggle").click();
        assert.equal(await page.locator("#gcSidebar").getAttribute("aria-hidden"), "false");
      }
      await page.locator('nav.desktop-nav button[data-tab="' + tab + '"]').click();
      assert.equal(await page.locator("#view-" + tab).isVisible(), true, variant + ": tab " + tab);
      if (variant === "mobile") {
        assert.equal(await page.locator("#gcSidebar").getAttribute("aria-hidden"), "true");
      }
    }

    for (const tab of ["ai", "aktivitas", "pembiayaan", "transisi", "offset", "panduan", "ringkasan"]) {
      await openTab(tab);
    }
    await openTab("wizard");
    const modes = [
      ["bbm", "wzB_"], ["ac", "wzA_"], ["dinas", "wzD_"],
      ["debitur", "wzX_"], ["surat-berharga", "wzS_"], ["listrik", "wzL_"]
    ];
    for (const [mode, marker] of modes) {
      await page.locator('.wizard-card[data-wz="' + mode + '"]').click();
      assert.equal(await page.locator("#wizardFormPanel").locator('[id^="' + marker + '"]').count() > 0, true, mode + " form renders");
    }
    await page.locator("#wzL_kwh").fill("100");
    assert.equal(await page.locator("#wzL_res").getAttribute("data-valid"), "1");
    await page.locator("#wzL_save").click();
    assert.equal(await page.locator("#view-aktivitas").isVisible(), true);
    assert.equal(await page.evaluate(() => window.S.entries.length), 1);
    await page.waitForFunction(() => {
      const key = "greencal_ip_scope_v1_" + "c".repeat(64);
      const raw = localStorage.getItem(key);
      return Boolean(raw && JSON.parse(raw).entries?.length === 1);
    }, {timeout:15000});
    await page.reload({waitUntil: "domcontentloaded"});
    await page.waitForFunction(() => window.S?.entries?.length === 1, {timeout: 15000});
    assert.equal(await page.locator("#view-ringkasan").isVisible(), true);
    const theme = await page.locator("html").getAttribute("data-theme");
    const btn = variant === "mobile" ? "#gcMobileThemeToggle" : "#themeToggle";
    if (variant === "mobile") await page.locator("#gcSidebarToggle").click();
    await page.locator(btn).click();
    assert.notEqual(await page.locator("html").getAttribute("data-theme"), theme);
    if (variant === "mobile") await page.locator("#gcMobileMenuClose").click();
    assert.deepEqual(failures, [], variant + ": uncaught browser errors");
    console.log("PASS:",variant,"navigation, 6 wizard panels, emission, persistence, theme");
  } finally {
    await browser.close();
  }
}

await check("desktop");
await check("mobile");
