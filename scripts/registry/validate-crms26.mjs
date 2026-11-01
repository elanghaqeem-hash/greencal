#!/usr/bin/env node
// Validator Regulatory Parameter Registry CRMS 2026.
//
// Fungsi: menjadi EKSTRAKSI/VERIFIKASI INDEPENDEN KEDUA atas tabel yang sudah
// ditranskripsi ke docs/enterprise/registry/*.json, sesuai Master Execution
// Prompt v2.0 Bagian 01.2 (ekstraksi ganda sebelum parameter dipakai).
//
// Dua mekanisme verifikasi dipakai:
//   1. Derivasi aritmetika independen. Batas bucket Tabel A.8 harus sama dengan
//      rata-rata geometrik PD baseline dua rating berdekatan. Formula ini tidak
//      diambil dari sumber; ia diuji terhadap angka yang ditranskripsi.
//   2. Pembanding sumber kedua. Bobot risiko FRTB (GIRR, CSR, ekuitas, DRC)
//      dibandingkan sel per sel terhadap nilai Basel yang dipatri di bawah ini.
//
// Uji properti tambahan menegakkan invarian yang disyaratkan Bagian 05.12.
// Keluar dengan kode 1 bila ada temuan FAIL.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

// --- Sumber pembanding kedua: Basel FRTB (BCBS d457 MAR21/MAR22) ----------
// Nilai ini DITULIS ULANG DARI STANDAR BASEL, bukan dari dokumen OJK, sehingga
// kecocokan sel per sel menjadi verifikasi independen atas transkripsi SEOJK.
const BASEL = {
  girrDelta: { 0.25: 1.7, 0.5: 1.7, 1: 1.6, 2: 1.3, 3: 1.2, 5: 1.1, 10: 1.1, 15: 1.1, 20: 1.1, 30: 1.1 },
  csrDelta: { 1: 0.5, 2: 1.0, 3: 5.0, 4: 3.0, 5: 3.0, 6: 2.0, 7: 1.5, 8: 2.5, 9: 2.0, 10: 4.0, 11: 12.0, 12: 7.0, 13: 8.5, 14: 5.5, 15: 5.0, 16: 12.0, 17: 1.5, 18: 5.0 },
  equitySpot: { 1: 55, 2: 60, 3: 45, 4: 55, 5: 30, 6: 35, 7: 40, 8: 50, 9: 70, 10: 50, 11: 70, 12: 15, 13: 25 },
  drc: { AAA: 0.5, AA: 2, A: 3, BBB: 6, BB: 15, B: 30, CCC: 50, 'Tidak memiliki peringkat': 15, 'Gagal bayar': 100 },
};

const findings = [];
const check = (id, ok, detail) => {
  findings.push({ id, status: ok ? 'PASS' : 'FAIL', detail });
  return ok;
};

const YEARS = [2025, 2026, 2027, 2028, 2030, 2035, 2040, 2045, 2050];

export function validate() {
  findings.length = 0;
  const b7 = read('docs/enterprise/registry/book7-annex-a-credit.json');
  const b2 = read('docs/enterprise/registry/book2-parameters.json');

  // === Tabel A.8 - pemetaan TTC PD ke bucket rating ========================
  const rows = b7.table_A8_rating_map.rows;
  check('A8-COUNT', rows.length === 21, `${rows.length} baris rating (diharapkan 21)`);
  check('A8-COVER-LO', rows[0].lower === 0, `batas bawah pertama ${rows[0].lower} (diharapkan 0)`);
  check('A8-COVER-HI', rows[rows.length - 1].upper === 100, `batas atas terakhir ${rows[rows.length - 1].upper} (diharapkan 100)`);

  let contiguous = true;
  let pdMonotone = true;
  let inBounds = true;
  const validBuckets = new Set(['AA', 'A', 'BA', 'B', 'C']);
  let bucketsValid = true;
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    if (!validBuckets.has(r.bucket)) bucketsValid = false;
    if (!(r.baseline_pd >= r.lower && r.baseline_pd <= r.upper)) inBounds = false;
    if (i > 0) {
      if (rows[i - 1].upper !== r.lower) contiguous = false;
      if (!(r.baseline_pd > rows[i - 1].baseline_pd)) pdMonotone = false;
    }
  }
  check('A8-CONTIGUOUS', contiguous, 'batas atas setiap baris sama dengan batas bawah baris berikutnya');
  check('A8-PD-MONOTONE', pdMonotone, 'PD baseline naik monoton sepanjang skala rating');
  check('A8-PD-IN-BOUNDS', inBounds, 'setiap PD baseline berada di dalam bucket-nya');
  check('A8-BUCKET-ENUM', bucketsValid, 'label bucket hanya AA, A, BA, B, C');

  // Derivasi aritmetika independen: bound = sqrt(PD[i] * PD[i+1]).
  let geoMismatch = [];
  for (let i = 0; i < rows.length - 1; i += 1) {
    const expected = Math.sqrt(rows[i].baseline_pd * rows[i + 1].baseline_pd);
    const actual = rows[i].upper;
    if (Math.abs(expected - actual) > 5e-5) {
      geoMismatch.push(`${rows[i].rating}->${rows[i + 1].rating}: sumber ${actual}, derivasi ${expected.toFixed(6)}`);
    }
  }
  check('A8-GEOMETRIC-MEAN', geoMismatch.length === 0,
    geoMismatch.length === 0
      ? `seluruh ${rows.length - 1} batas internal cocok dengan rata-rata geometrik (toleransi 5e-5)`
      : geoMismatch.join('; '));

  // Bucket harus berurutan tanpa selang (AA lalu A lalu BA lalu B lalu C).
  const order = ['AA', 'A', 'BA', 'B', 'C'];
  const seq = [...new Set(rows.map((r) => r.bucket))];
  check('A8-BUCKET-ORDER', JSON.stringify(seq) === JSON.stringify(order), `urutan bucket ${seq.join('>')}`);

  // === Tabel A.5 - haircut LGD risiko fisik ================================
  const a5 = b7.table_A5_lgd_physical_haircut;
  const scenarios = ['net_zero_2050', 'delayed_transition', 'current_policies'];
  const collaterals = ['Komersial', 'Industrial', 'Residensial', 'Lainnya'];
  let cells = 0;
  let shapeOk = true;
  let nonNegative = true;
  let yearMonotone = true;
  let tierOrder = true;
  let rendahZero = true;

  for (const s of scenarios) {
    for (const c of collaterals) {
      const entry = a5[s]?.[c];
      if (!entry) { shapeOk = false; continue; }
      for (const cat of ['Tinggi', 'Menengah', 'Rendah']) {
        const series = entry[cat];
        if (!Array.isArray(series) || series.length !== YEARS.length) { shapeOk = false; continue; }
        cells += series.length;
        for (let i = 0; i < series.length; i += 1) {
          if (!(series[i] >= 0)) nonNegative = false;
          if (i > 0 && series[i] < series[i - 1] - 1e-12) yearMonotone = false;
        }
        if (cat === 'Rendah' && series.some((v) => v !== 0)) rendahZero = false;
      }
      for (let i = 0; i < YEARS.length; i += 1) {
        if (!(entry.Tinggi[i] > entry.Menengah[i] && entry.Menengah[i] >= entry.Rendah[i])) tierOrder = false;
      }
    }
  }
  check('A5-SHAPE', shapeOk, 'tiga skenario x empat jenis agunan x tiga kategori x sembilan tahun');
  check('A5-CELL-COUNT', cells === 324, `${cells} sel (diharapkan 324)`);
  check('A5-NON-NEGATIVE', nonNegative, 'tidak ada haircut negatif');
  check('A5-YEAR-MONOTONE', yearMonotone, 'haircut tidak menurun sepanjang tahun proyeksi');
  check('A5-TIER-ORDER', tierOrder, 'Tinggi > Menengah >= Rendah pada setiap tahun');
  check('A5-RENDAH-ZERO', rendahZero, 'kategori risiko Rendah bernilai nol pada seluruh tahun');

  // Pada 2050 risiko fisik harus terurut Current Policies >= Delayed >= Net Zero.
  const last = YEARS.length - 1;
  let physOrder2050 = true;
  const physOrderDetail = [];
  for (const c of collaterals) {
    for (const cat of ['Tinggi', 'Menengah']) {
      const nz = a5.net_zero_2050[c][cat][last];
      const dt = a5.delayed_transition[c][cat][last];
      const cp = a5.current_policies[c][cat][last];
      if (!(cp >= dt && dt >= nz)) {
        physOrder2050 = false;
        physOrderDetail.push(`${c}/${cat}: NZ ${nz}, DT ${dt}, CP ${cp}`);
      }
    }
  }
  check('A5-SCENARIO-ORDER-2050', physOrder2050,
    physOrder2050 ? 'CP >= DT >= NZ pada 2050 untuk seluruh agunan dan kategori' : physOrderDetail.join('; '));

  // === Buku 2 Tabel 3 - PD bucket =========================================
  const buckets = b2.table_3_pd_buckets.buckets;
  check('B2T3-COUNT', buckets.length === 15, `${buckets.length} bucket (diharapkan 15)`);
  let bMonotone = true;
  for (let i = 1; i < buckets.length; i += 1) {
    if (!(buckets[i].pooled_pd > buckets[i - 1].pooled_pd)) bMonotone = false;
    if (buckets[i].bucket !== i + 1) bMonotone = false;
  }
  check('B2T3-MONOTONE', bMonotone, 'nomor bucket berurutan dan pooled PD naik monoton');
  const b2bucket = buckets.find((b) => b.bucket === 2);
  check('B2T3-WORKED-EXAMPLE', b2bucket && b2bucket.pooled_pd === 1.19,
    `Bucket 2 = ${b2bucket?.pooled_pd}% (contoh PT XYZ dalam Buku 2 menyebut 1,19%)`);

  // === Pembanding Basel: GIRR, CSR, ekuitas, DRC ===========================
  const girr = b2.table_15_girr_delta_risk_weights.rows;
  const girrDiff = girr.filter((r) => BASEL.girrDelta[r.tenor_years] !== r.risk_weight)
    .map((r) => `tenor ${r.tenor_years}: OJK ${r.risk_weight}, Basel ${BASEL.girrDelta[r.tenor_years]}`);
  check('GIRR-BASEL-PARITY', girrDiff.length === 0 && girr.length === 10,
    girrDiff.length === 0 ? `${girr.length} tenor cocok dengan Basel MAR21 GIRR delta` : girrDiff.join('; '));

  const csr = b2.table_16_csr_delta_risk_weights.rows;
  const csrDiff = csr.filter((r) => BASEL.csrDelta[r.bucket] !== r.risk_weight)
    .map((r) => `bucket ${r.bucket}: OJK ${r.risk_weight}, Basel ${BASEL.csrDelta[r.bucket]}`);
  check('CSR-BASEL-PARITY', csrDiff.length === 0 && csr.length === 18,
    csrDiff.length === 0 ? `${csr.length} bucket cocok dengan Basel MAR21 CSR delta` : csrDiff.join('; '));

  const eq = b2.table_18_equity_delta_risk_weights.rows;
  const eqDiff = eq.filter((r) => BASEL.equitySpot[r.bucket] !== r.spot_risk_weight)
    .map((r) => `bucket ${r.bucket}: OJK ${r.spot_risk_weight}, Basel ${BASEL.equitySpot[r.bucket]}`);
  check('EQUITY-BASEL-PARITY', eqDiff.length === 0 && eq.length === 13,
    eqDiff.length === 0 ? `${eq.length} bucket cocok dengan Basel MAR21 equity delta` : eqDiff.join('; '));
  // Bobot repo harus seperseratus bobot spot pada seluruh bucket.
  const repoRatio = eq.every((r) => Math.abs(r.spot_risk_weight / 100 - r.repo_risk_weight) < 1e-9);
  check('EQUITY-REPO-RATIO', repoRatio, 'bobot risiko repo = bobot spot dibagi 100 pada seluruh bucket');

  const drc = b2.table_19_drc_default_risk_weights.rows;
  const drcDiff = drc.filter((r) => BASEL.drc[r.rating] !== r.risk_weight)
    .map((r) => `${r.rating}: OJK ${r.risk_weight}, Basel ${BASEL.drc[r.rating]}`);
  check('DRC-BASEL-PARITY', drcDiff.length === 0 && drc.length === 9,
    drcDiff.length === 0 ? `${drc.length} kategori cocok dengan Basel MAR22 DRC` : drcDiff.join('; '));

  // === Vektor uji NII dari Buku 2 Tabel 11 ================================
  const nii = b2.formulas.nii_adjusted.worked_example;
  const totalNii = nii.nii_juta_rupiah.reduce((a, b) => a + b, 0);
  const weighted = nii.nii_juta_rupiah.reduce((acc, v, i) => acc + v * nii.default_status[i], 0) / totalNii;
  const adjusted = totalNii * (1 - weighted);
  check('B2T11-NII-RECOMPUTE',
    Math.abs(weighted * 100 - nii.pd_weighted_percent) < 1e-9 && Math.abs(adjusted - nii.adjusted_nii_juta_rupiah) < 1e-9,
    `PD tertimbang ${(weighted * 100).toFixed(2)}% dan NII disesuaikan ${adjusted} juta Rupiah dihitung ulang dari contoh Buku 2`);

  // === Konsistensi enumerasi sektor antar buku ============================
  const b7Sectors = b7.enumerations.sektor_ekonomi;
  check('SEKTOR-COUNT', b7Sectors.length === 7, `${b7Sectors.length} sektor pada Lampiran Buku 7 (6 prioritas + Lainnya)`);
  check('SEKTOR-LAINNYA', b7Sectors.includes('Lainnya'), "enumerasi sektor memuat kategori 'Lainnya'");
  check('SEKTOR-PRIORITAS-COUNT', b2.sektor_prioritas.length === 6,
    `${b2.sektor_prioritas.length} sektor prioritas pada Buku 2 Bagian 3.1`);

  // === Integritas metadata registry =======================================
  const paramTables = b7.table_inventory.filter((t) => t.kind === 'parameter');
  const unapproved = paramTables.filter((t) => t.status === 'APPROVED');
  check('REGISTRY-NO-FALSE-APPROVAL', unapproved.length === 0,
    'tidak ada tabel parameter yang ditandai APPROVED sebelum ada verifier dan approver');
  check('REGISTRY-NO-VERIFIER', b7.document.verifier === null && b7.document.approver === null,
    'dokumen belum punya verifier dan approver, konsisten dengan status ekstraksi tunggal');
  check('REGISTRY-PRECISION-CAVEAT', typeof b7.document.precision_caveat === 'string' && b7.document.precision_caveat.length > 0,
    'peringatan presisi penuh tercatat pada metadata dokumen');
  check('REGISTRY-CHECKSUM-PENDING', b7.document.source_sha256 === 'SOURCE_PENDING' && b2.document.source_sha256 === 'SOURCE_PENDING',
    'checksum sumber ditandai SOURCE_PENDING, bukan nilai palsu');

  // === Matriks requirement CRMS26 =========================================
  const parseCsv = (text) => {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 1; } else { quoted = false; }
        } else field += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c !== '\r') field += c;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.length > 1 || r[0] !== '');
  };

  const idPattern = /^CRMS26-B0[1-7]-[A-Z]{3}-\d{4}$/;
  const validStatus = new Set(['SOURCE_VERIFIED', 'SOURCE_PENDING', 'NOT_STARTED', 'IN_PROGRESS', 'IMPLEMENTED_UNVERIFIED', 'TEST_FAILED', 'TEST_PASSED', 'VALIDATED', 'APPROVED', 'NOT_APPLICABLE']);
  const modulePattern = /^M(0[1-9]|[12][0-9]|3[0-2])$/;
  const seenIds = new Set();
  let totalReq = 0;
  let idOk = true;
  let widthOk = true;
  let statusOk = true;
  let moduleOk = true;
  let noApproved = true;
  const problems = [];

  for (const file of ['docs/enterprise/requirements/crms26-book1.csv', 'docs/enterprise/requirements/crms26-book2.csv']) {
    const rows = parseCsv(readFileSync(join(ROOT, file), 'utf8'));
    const header = rows[0];
    if (header.length !== 8) { widthOk = false; problems.push(`${file}: header ${header.length} kolom`); }
    for (const r of rows.slice(1)) {
      totalReq += 1;
      if (r.length !== 8) { widthOk = false; problems.push(`${r[0]}: ${r.length} kolom`); }
      if (!idPattern.test(r[0])) { idOk = false; problems.push(`id tidak valid: ${r[0]}`); }
      if (seenIds.has(r[0])) { idOk = false; problems.push(`id duplikat: ${r[0]}`); }
      seenIds.add(r[0]);
      if (!validStatus.has(r[7])) { statusOk = false; problems.push(`${r[0]}: status ${r[7]}`); }
      if (r[7] === 'APPROVED') { noApproved = false; problems.push(`${r[0]} ditandai APPROVED tanpa bukti`); }
      if (!modulePattern.test(r[5])) { moduleOk = false; problems.push(`${r[0]}: modul ${r[5]}`); }
      if (!r[4] || r[4].length < 20) { problems.push(`${r[0]}: teks requirement terlalu pendek`); }
    }
  }
  check('REQ-CSV-WIDTH', widthOk, widthOk ? 'seluruh baris memiliki 8 kolom' : problems.filter((p) => p.includes('kolom')).join('; '));
  check('REQ-ID-FORMAT', idOk, idOk ? `${seenIds.size} kode requirement unik dan sesuai pola CRMS26-B0x-DOMAIN-nnnn` : problems.filter((p) => p.includes('id')).join('; '));
  check('REQ-STATUS-ENUM', statusOk, statusOk ? 'seluruh status berada dalam enumerasi Bagian 01.4' : problems.filter((p) => p.includes('status')).join('; '));
  check('REQ-MODULE-REF', moduleOk, moduleOk ? 'seluruh rujukan modul berada pada rentang M01 sampai M32' : problems.filter((p) => p.includes('modul')).join('; '));
  check('REQ-NO-APPROVED', noApproved, 'tidak ada requirement berstatus APPROVED sebelum ada bukti dan persetujuan');
  check('REQ-COUNT', totalReq === 192, `${totalReq} requirement diturunkan dari Buku 1 dan Buku 2`);

  return findings;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const result = validate();
  const failed = result.filter((f) => f.status === 'FAIL');
  for (const f of result) console.log(`${f.status.padEnd(4)} ${f.id.padEnd(28)} ${f.detail}`);
  console.log(`\n${result.length - failed.length}/${result.length} pemeriksaan lulus.`);
  if (failed.length) {
    console.error(`\n${failed.length} pemeriksaan GAGAL.`);
    process.exit(1);
  }
}
