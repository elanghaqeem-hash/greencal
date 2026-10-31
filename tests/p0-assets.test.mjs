import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const expected = ["index.html", "auth-client.js", "assets/guide-learning.js"];
const sourceHtml = readFileSync(join(root, "index.html"), "utf8");
const builtHtml = readFileSync(join(root, "dist/index.html"), "utf8");

test("Cloudflare deploy bundle contains every referenced source asset unchanged", () => {
  assert.equal(builtHtml, sourceHtml);
  assert.doesNotMatch(builtHtml,/assets\/brks-syariah\.svg/);
  for (const asset of expected) {
    const source = readFileSync(join(root, asset));
    const output = readFileSync(join(root, "dist", asset));
    assert.deepEqual(output, source, "mismatch or missing build asset " + asset);
    assert.ok(statSync(join(root, "dist", asset)).size > 100);
  }
});

test("all external JS assets are referenced and are executable JavaScript, never an HTML fallback", () => {
  assert.match(builtHtml, /<script src="\.\/auth-client\.js" defer><\/script>/);
  assert.match(builtHtml, /<script src="\/assets\/guide-learning\.js"><\/script>/);
  const auth = readFileSync(join(root, "dist/auth-client.js"), "utf8");
  const guide = readFileSync(join(root, "dist/assets/guide-learning.js"), "utf8");
  assert.match(auth, /window\.GC_AUTH/);
  assert.match(guide, /function renderEducationalGuide\(/);
  assert.doesNotMatch(auth.trimStart(), /^<!DOCTYPE html>/i);
  assert.doesNotMatch(guide.trimStart(), /^<!DOCTYPE html>/i);
  assert.doesNotThrow(() => new Function(auth));
  assert.doesNotThrow(() => new Function(guide));
});

test("public navigation and principal click-to-calculate actions are present", () => {
  const expectedTabs = ["ringkasan", "ai", "wizard", "aktivitas", "pembiayaan", "transisi", "offset", "panduan"];
  for (const tab of expectedTabs) {
    assert.match(sourceHtml, new RegExp('data-tab="' + tab + '"'));
    assert.match(sourceHtml, new RegExp('id="view-' + tab + '"'));
  }
  for (const id of ["gcSidebarToggle", "themeToggle", "wzL_save", "wzD_save", "btnRunAi", "btnExportAct", "btnExportFin", "btnBackupJson"]) {
    assert.ok(sourceHtml.includes(id), "missing key UI control: " + id);
  }
  assert.match(sourceHtml, /GC_AUTH\.start\(/);
  assert.match(sourceHtml, /\.onclick = \(\) => setTab\(b\.dataset\.tab\)/);
});
