import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = html.slice(html.indexOf("<style"), html.indexOf("</style>") + 8);
const tables = [...html.matchAll(/<table class="edu-table">[\s\S]*?<\/table>/g)].map(m => m[0]);

test("learning tables retain readable column labels for every mobile card", () => {
  assert.equal(tables.length, 2, "Expected simulation and audit learning tables");
  const expectedHeadings = [
    ["Aktivitas", "Data yang dikumpulkan", "Catatan"],
    ["Lini", "Tanggung jawab utama", "Bukti minimum"]
  ];
  tables.forEach((table, index) => {
    const headers = [...table.matchAll(/<th>([^<]+)<\/th>/g)].map(m => m[1].replaceAll("&amp;", "&"));
    assert.deepEqual(headers, expectedHeadings[index]);
    const body = table.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1];
    assert.ok(body, "Table body missing");
    const rows = [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(m => m[1]);
    assert.ok(rows.length > 0, "Table must have rows");
    rows.forEach(row => {
      const labels = [...row.matchAll(/<td data-label="([^"]+)">[\s\S]*?<\/td>/g)]
        .map(m => m[1].replaceAll("&amp;", "&"));
      assert.deepEqual(labels, headers, "Every cell must carry its visible label");
    });
  });
});

test("small screens switch tables to stacked cards without clipping any cell", () => {
  assert.match(css, /GreenCal Learning Center mobile card layout v1/);
  assert.match(css, /@media\s*\(max-width:700px\)/);
  assert.match(css, /\.gc-learning \.edu-table\{display:block;max-width:100%;min-width:0;width:100%/);
  assert.match(css, /\.gc-learning \.edu-table tbody\{display:grid;gap:12px/);
  assert.match(css, /\.gc-learning \.edu-table tbody tr\{[\s\S]*?display:block;/);
  assert.match(css, /\.gc-learning \.edu-table tbody td\{[\s\S]*?width:100%/);
  assert.match(css, /\.gc-learning \.edu-table tbody td::before\{[\s\S]*?content:attr\(data-label\)/);
  assert.match(css, /\.gc-learning \.edu-table tbody td\{[\s\S]*?overflow-wrap:anywhere/);
  assert.doesNotMatch(css, /\.gc-learning \.edu-table thead\{\s*display:none/);
});

test("simulation controls remain easy to read and enter on a phone", () => {
  assert.match(css, /\.gc-learning \.edu-demo input\{max-width:100%;font-size:16px\}/);
  assert.match(css, /\.gc-learning \.edu-result\{font-size:clamp\(20px,6vw,26px\);overflow-wrap:anywhere\}/);
  assert.match(html, /id="edu-kwh"/);
  assert.match(html, /id="edu-factor"/);
  assert.match(html, /id="edu-result"/);
});
