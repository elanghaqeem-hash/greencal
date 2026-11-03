// Uji WP10: paket rilis offline, manifest, dan gate rilis berbasis bukti.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto';
import {
  BUNDLE_CONTENTS, isForbidden, collectBundleFiles, buildManifest, canonicalJson, assessReleasability,
} from '../scripts/release/build-offline-bundle.mjs';

const ROOT = resolve(import.meta.dirname, '..');

test('JSON kanonik mengurutkan kunci dan membuang nilai undefined', () => {
  assert.equal(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.equal(canonicalJson({ a: undefined, b: 1 }), '{"b":1}');
  assert.equal(canonicalJson({ z: { y: 1, x: 2 } }), '{"z":{"x":2,"y":1}}');
  assert.equal(canonicalJson([3, 'a', null]), '[3,"a",null]');
  // Kanonikalisasi harus stabil terhadap urutan penulisan objek.
  assert.equal(canonicalJson({ a: 1, b: 2 }), canonicalJson({ b: 2, a: 1 }));
});

test('rahasia, node_modules, dan berkas kunci tidak dapat masuk paket', () => {
  for (const p of [
    'node_modules/pg/index.js',
    '.git/config',
    'deploy/secrets/db_app_passfile',
    'deploy/secrets/server.key',
    'deploy/app.env',
    'deploy/migrator.env',
    '.env',
    'certs/server.pem',
    'keystore/bank.jks',
    'scripts/__pycache__/x.pyc',
  ]) {
    assert.equal(isForbidden(p), true, `${p} seharusnya terlarang masuk paket`);
  }
});

test('README rahasia tetap boleh masuk agar operator menemukan petunjuknya', () => {
  assert.equal(isForbidden('deploy/secrets/README.md'), false);
  assert.equal(isForbidden('deploy/app.env.example'), false);
  assert.equal(isForbidden('deploy/postgres/pg_hba.conf'), false);
});

test('daftar isi paket bersifat eksplisit, bukan glob', () => {
  assert.ok(BUNDLE_CONTENTS.code.includes('package-lock.json'),
    'lockfile wajib masuk paket agar build dapat direproduksi');
  assert.ok(BUNDLE_CONTENTS.code.includes('Dockerfile'));
  assert.ok(BUNDLE_CONTENTS.directories.includes('migrations/onprem'));
  assert.ok(BUNDLE_CONTENTS.directories.includes('deploy'));
  assert.ok(BUNDLE_CONTENTS.directories.includes('tests'),
    'uji ikut masuk paket: auditor bank harus dapat menjalankannya sendiri');
});

test('paket nyata memuat migrasi, konfigurasi, dan tidak memuat satu pun rahasia', async () => {
  const files = await collectBundleFiles(ROOT);
  const paths = files.map((f) => f.path);

  assert.ok(paths.includes('migrations/onprem/0001_foundation.sql'));
  assert.ok(paths.includes('migrations/onprem/0004_rls_policies.sql'));
  assert.ok(paths.includes('deploy/postgres/pg_hba.conf'));
  assert.ok(paths.includes('deploy/docker-compose.dc.yml'));
  assert.ok(paths.includes('deploy/docker-compose.drc.yml'));
  assert.ok(paths.includes('src/onprem/precision/decimal.js'));
  assert.ok(paths.includes('package-lock.json'));

  assert.deepEqual(paths.filter((p) => isForbidden(p)), []);
  assert.deepEqual(paths.filter((p) => /node_modules/.test(p)), []);
  for (const f of files) {
    assert.match(f.sha256, /^[a-f0-9]{64}$/, `${f.path} tanpa checksum sah`);
    assert.ok(f.bytes > 0, `${f.path} kosong`);
  }
  // Daftar wajib terurut agar manifest deterministik.
  assert.deepEqual(paths, [...paths].sort());
});

test('manifest menuntut versi, commit, dan bukti gate', () => {
  const files = [{ path: 'a', bytes: 1, sha256: 'a'.repeat(64) }];
  assert.throws(() => buildManifest({ gitCommit: 'abc', files, evidence: { gates: [] } }),
    /MANIFEST_VERSION_REQUIRED/);
  assert.throws(() => buildManifest({ version: '1.0.0', files, evidence: { gates: [] } }),
    /MANIFEST_COMMIT_REQUIRED/);
  assert.throws(() => buildManifest({ version: '1.0.0', gitCommit: 'abc', files }),
    /MANIFEST_EVIDENCE_REQUIRED/);
});

test('digest manifest deterministik dan berubah bila satu berkas berubah', () => {
  const base = {
    version: '0.1.0', gitCommit: 'c'.repeat(40), builtAt: '2026-11-01T00:00:00.000Z',
    evidence: { gates: [{ id: 'G01', status: 'PASSED', evidenceRef: 'ci://x' }] },
  };
  const files = [
    { path: 'b.js', bytes: 10, sha256: 'b'.repeat(64) },
    { path: 'a.js', bytes: 20, sha256: 'a'.repeat(64) },
  ];
  const one = buildManifest({ ...base, files });
  // Urutan masukan tidak boleh mempengaruhi digest.
  const two = buildManifest({ ...base, files: [...files].reverse() });
  assert.equal(one.digest, two.digest);
  assert.deepEqual(one.manifest.files.map((f) => f.path), ['a.js', 'b.js']);

  const changed = buildManifest({
    ...base,
    files: [{ path: 'a.js', bytes: 20, sha256: 'a'.repeat(64) }, { path: 'b.js', bytes: 10, sha256: 'd'.repeat(64) }],
  });
  assert.notEqual(one.digest, changed.digest, 'perubahan satu checksum wajib mengubah digest manifest');
});

test('manifest memuat kontrak paket agar versi format tidak ambigu', () => {
  const { manifest } = buildManifest({
    version: '0.1.0', gitCommit: 'c'.repeat(40),
    files: [{ path: 'a', bytes: 1, sha256: 'a'.repeat(64) }],
    evidence: { gates: [] },
  });
  assert.equal(manifest.bundleContract, 'greencal-onprem-bundle/1');
  assert.equal(manifest.deployment, 'onprem');
  assert.equal(manifest.fileCount, 1);
  assert.equal(manifest.totalBytes, 1);
});

test('gate PASSED tanpa evidenceRef tidak membuat paket layak rilis', () => {
  const r = assessReleasability({
    gates: [
      { id: 'G01', status: 'PASSED', evidenceRef: 'ci://run/1' },
      { id: 'G02', status: 'PASSED', evidenceRef: null },
    ],
  });
  assert.equal(r.releasable, false);
  assert.deepEqual(r.passedWithoutEvidence, ['G02']);
  assert.deepEqual(r.unmet, []);
});

test('paket layak rilis hanya bila seluruh gate PASSED dan berbukti', () => {
  const gates = [
    { id: 'G01', status: 'PASSED', evidenceRef: 'ci://1' },
    { id: 'G02', status: 'PASSED', evidenceRef: 'ci://2' },
  ];
  assert.equal(assessReleasability({ gates }).releasable, true);
  assert.equal(assessReleasability({ gates: [...gates, { id: 'G03', status: 'BLOCKED' }] }).releasable, false);
});

test('ledger gate rilis nyata konsisten: PASSED selalu berbukti', async () => {
  const evidence = JSON.parse(await readFile(join(ROOT, 'docs/enterprise/release/release-gates.json'), 'utf8'));
  assert.equal(evidence.contract, 'greencal-release-gates/1');
  assert.ok(evidence.gates.length >= 15, 'ledger gate wajib menutup seluruh prasyarat Bagian 09.5');

  const valid = new Set(['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'PASSED']);
  const ids = new Set();
  for (const g of evidence.gates) {
    assert.ok(valid.has(g.status), `status ${g.status} pada ${g.id} tidak sah`);
    assert.ok(g.requirement && g.detail, `${g.id} tanpa rumusan syarat atau keterangan`);
    assert.equal(ids.has(g.id), false, `id gate ganda: ${g.id}`);
    ids.add(g.id);
    if (g.status === 'PASSED') {
      assert.ok(g.evidenceRef, `${g.id} berstatus PASSED tanpa evidenceRef; ini pelanggaran aturan bukti`);
    } else {
      assert.equal(g.evidenceRef, null, `${g.id} belum PASSED tetapi menyertakan evidenceRef`);
    }
  }

  // Gate yang memang tidak dapat dipenuhi tim rekayasa WAJIB tetap terbuka.
  for (const id of ['G10-PENTEST', 'G11-MODEL-VALIDATION', 'G12-DR-RESTORE', 'G14-CAB-APPROVAL']) {
    const g = evidence.gates.find((x) => x.id === id);
    assert.ok(g, `${id} wajib ada di ledger`);
    assert.notEqual(g.status, 'PASSED',
      `${id} tidak boleh ditandai PASSED oleh tim rekayasa; hanya bank yang dapat menutupnya`);
  }

  assert.equal(assessReleasability(evidence).releasable, false,
    'selama gate bank belum tertutup, paket WAJIB tidak layak produksi');
});

test('manifest dapat ditandatangani dan diverifikasi dengan Ed25519', () => {
  // Kunci dibuat di dalam uji, bukan oleh skrip build. Skrip build menolak
  // membuat kunci, dan menolak kunci yang bukan Ed25519.
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const { canonical, digest } = buildManifest({
    version: '0.1.0', gitCommit: 'c'.repeat(40), builtAt: '2026-11-01T00:00:00.000Z',
    files: [{ path: 'a', bytes: 1, sha256: 'a'.repeat(64) }],
    evidence: { gates: [{ id: 'G01', status: 'PASSED', evidenceRef: 'ci://1' }] },
  });
  const signature = cryptoSign(null, Buffer.from(canonical, 'utf8'), privateKey);
  assert.equal(cryptoVerify(null, Buffer.from(canonical, 'utf8'), publicKey, signature), true);

  // Satu byte berubah pada manifest membatalkan tanda tangan.
  const tampered = canonical.replace('"version":"0.1.0"', '"version":"9.9.9"');
  assert.notEqual(tampered, canonical);
  assert.equal(cryptoVerify(null, Buffer.from(tampered, 'utf8'), publicKey, signature), false);
  assert.match(digest, /^[a-f0-9]{64}$/);
});

test('skrip pembangun paket tidak pernah membuat kunci penandatangan', async () => {
  const src = await readFile(join(ROOT, 'scripts/release/build-offline-bundle.mjs'), 'utf8');
  assert.ok(!/generateKeyPair/.test(src),
    'skrip build tidak boleh membuat kunci: kunci yang dibuat build bukan kunci yang dapat dipercaya');
  assert.match(src, /ed25519/, 'tipe kunci penandatangan wajib diperiksa');
  assert.match(src, /WORKING_TREE_DIRTY/, 'paket rilis hanya boleh dari pohon kerja bersih');
});
