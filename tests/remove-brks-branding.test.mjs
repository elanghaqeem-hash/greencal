import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const html = await readFile(new URL('index.html', root), 'utf8');
const build = await readFile(new URL('scripts/build-dist.mjs', root), 'utf8');
const enterprise = await readFile(new URL('enterprise.html', root), 'utf8');

test('GreenCal public header does not render BRK Syariah logo, wordmark, or reserved slot', () => {
  assert.doesNotMatch(html, /brks-syariah\.svg|brks-logo-(?:wrap|img)|BRK Syariah/i);
  assert.match(html, /<a href="#" class="brand-block" id="brandLogo">[\s\S]*?<div class="brand-info">/);
  assert.match(html, /id="orgName"/);
  assert.match(html, /class="gc-brand-title-short">GreenCal<\/span>/);
});
test('mobile header flows without the removed bank logo column', () => {
  assert.match(html, /header\.app-header \.brand-block\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
  assert.match(html, /header\.app-header \.brand-info\{grid-column:1;/);
  assert.doesNotMatch(html, /grid-template-columns:clamp\(82px,25vw,108px\) minmax\(0,1fr\)/);
});
test('build no longer publishes bank logo while preserving both application entrypoints', () => {
  assert.doesNotMatch(build, /brks-syariah\.svg/);
  assert.match(build, /"index.html"/);
  assert.match(build, /"enterprise.html"/);
  assert.match(enterprise, /GreenCal <span>CRMS Enterprise<\/span>/);
});
test('bank name is not the hardcoded default institution identity', () => {
  assert.doesNotMatch(html, /Bank Riau Kepri Syariah/i);
  assert.match(html, /orgName: "Kalkulator Emisi OJK & PCAF"/);
});
