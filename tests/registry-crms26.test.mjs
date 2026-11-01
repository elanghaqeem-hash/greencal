import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validate } from '../scripts/registry/validate-crms26.mjs';

const findings = validate();
const by = (id) => findings.find((f) => f.id === id);

test('validator registry menghasilkan temuan untuk setiap pemeriksaan', () => {
  assert.ok(findings.length >= 30, `hanya ${findings.length} pemeriksaan dijalankan`);
  for (const f of findings) {
    assert.ok(['PASS', 'FAIL'].includes(f.status), `status tidak dikenal: ${f.status}`);
  }
});

test('tidak ada pemeriksaan registry yang gagal', () => {
  const failed = findings.filter((f) => f.status === 'FAIL');
  assert.deepEqual(failed, [], failed.map((f) => `${f.id}: ${f.detail}`).join('\n'));
});

test('Tabel A.8 terverifikasi lewat derivasi rata-rata geometrik independen', () => {
  assert.equal(by('A8-GEOMETRIC-MEAN').status, 'PASS');
  assert.equal(by('A8-CONTIGUOUS').status, 'PASS');
  assert.equal(by('A8-COVER-LO').status, 'PASS');
  assert.equal(by('A8-COVER-HI').status, 'PASS');
});

test('bobot risiko pasar cocok sel per sel dengan Basel FRTB', () => {
  for (const id of ['GIRR-BASEL-PARITY', 'CSR-BASEL-PARITY', 'EQUITY-BASEL-PARITY', 'DRC-BASEL-PARITY']) {
    assert.equal(by(id).status, 'PASS', `${id}: ${by(id).detail}`);
  }
});

test('haircut LGD risiko fisik memenuhi uji properti', () => {
  for (const id of ['A5-CELL-COUNT', 'A5-NON-NEGATIVE', 'A5-YEAR-MONOTONE', 'A5-TIER-ORDER', 'A5-RENDAH-ZERO', 'A5-SCENARIO-ORDER-2050']) {
    assert.equal(by(id).status, 'PASS', `${id}: ${by(id).detail}`);
  }
});

test('registry tidak mengklaim status APPROVED tanpa verifier dan approver', () => {
  assert.equal(by('REGISTRY-NO-FALSE-APPROVAL').status, 'PASS');
  assert.equal(by('REGISTRY-NO-VERIFIER').status, 'PASS');
  assert.equal(by('REGISTRY-CHECKSUM-PENDING').status, 'PASS');
});

test('tabel PD Scalar dan LGD Scalar tetap SOURCE_PENDING sampai kertas kerja presisi penuh tersedia', () => {
  const b7 = JSON.parse(readFileSync(new URL('../docs/enterprise/registry/book7-annex-a-credit.json', import.meta.url), 'utf8'));
  const scalarTables = b7.table_inventory.filter((t) => /^A\.(3|6|7)/.test(t.table));
  assert.ok(scalarTables.length === 14, `${scalarTables.length} tabel skalar terdaftar`);
  for (const t of scalarTables) {
    assert.ok(['SOURCE_PENDING', 'BLOCKED'].includes(t.status),
      `${t.table} berstatus ${t.status}; harus SOURCE_PENDING atau BLOCKED`);
    assert.equal(t.in_this_file, false, `${t.table} tidak boleh ditranskripsi dari ekstraksi tunggal`);
  }
});

test('register anomali sumber terdokumentasi dan tertaut dari registry', () => {
  const report = readFileSync(new URL('../docs/enterprise/wp04-source-extraction-20261101.md', import.meta.url), 'utf8');
  const b7 = JSON.parse(readFileSync(new URL('../docs/enterprise/registry/book7-annex-a-credit.json', import.meta.url), 'utf8'));
  const b2 = JSON.parse(readFileSync(new URL('../docs/enterprise/registry/book2-parameters.json', import.meta.url), 'utf8'));
  const referenced = new Set();
  const collect = (obj) => {
    if (typeof obj === 'string') {
      for (const m of obj.matchAll(/ANOM-[A-Z0-9]+-\d{3}/g)) referenced.add(m[0]);
    } else if (obj && typeof obj === 'object') {
      for (const v of Object.values(obj)) collect(v);
    }
  };
  collect(b7);
  collect(b2);
  assert.ok(referenced.size >= 5, `hanya ${referenced.size} anomali dirujuk dari registry`);
  for (const id of referenced) {
    assert.ok(report.includes(id), `${id} dirujuk registry tetapi tidak ada di register anomali`);
  }
});
