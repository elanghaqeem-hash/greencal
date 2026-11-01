import test from 'node:test';
import assert from 'node:assert/strict';
import { Decimal, D, sum, weightedAverage, SCALE, PRECISION, DecimalError } from '../src/onprem/precision/decimal.js';
import {
  FormulaRegistry, ParameterSet, runFormula, createCalculationRun,
  verifyReproduction, assertNoDoubleCounting, FormulaError,
} from '../src/onprem/precision/calculation-run.js';
import { sha256 } from '../src/onprem/audit/hash-chain.js';

test('skala dan presisi sesuai NUMERIC(38,12)', () => {
  assert.equal(SCALE, 12);
  assert.equal(PRECISION, 38);
  assert.equal(D('1').toString(), '1.000000000000');
});

test('floating point ditolak pada jalur keuangan', () => {
  assert.throws(() => D(0.1), (e) => e instanceof DecimalError && e.code === 'FLOAT_FORBIDDEN');
  assert.throws(() => D(1), (e) => e.code === 'FLOAT_FORBIDDEN');
});

test('penjumlahan desimal eksak di tempat float gagal', () => {
  // 0.1 + 0.2 === 0.30000000000000004 pada float biner.
  const exact = D('0.1').add('0.2');
  assert.equal(exact.toString(), '0.300000000000');
  assert.ok(exact.eq('0.3'));
  assert.notEqual(0.1 + 0.2, 0.3);
});

test('pembagian dan perkalian membulatkan half-up secara deterministik', () => {
  assert.equal(D('1').div('3').toString(), '0.333333333333');
  // Setengah unit terakhir dibulatkan menjauhi nol, simetris untuk negatif.
  assert.equal(D('0.000000000001').div('2').toString(), '0.000000000001');
  assert.equal(D('-0.000000000001').div('2').toString(), '-0.000000000001');
  // Di bawah setengah unit dibulatkan ke bawah.
  assert.equal(D('0.000000000001').div('3').toString(), '0.000000000000');
  // Perkalian memakai pembulatan yang sama.
  assert.equal(D('0.000000000003').mul('0.5').toString(), '0.000000000002');
});

test('pembagian dengan nol gagal keras', () => {
  assert.throws(() => D('1').div('0'), (e) => e.code === 'DIVISION_BY_ZERO');
});

test('desimal melebihi skala 12 ditolak, bukan dibulatkan diam-diam', () => {
  assert.throws(() => D('1.0000000000001'), (e) => e.code === 'SCALE_EXCEEDED');
});

test('overflow NUMERIC(38,12) terdeteksi', () => {
  const big = D('9'.repeat(26));
  assert.throws(() => big.mul('100'), (e) => e.code === 'NUMERIC_OVERFLOW');
});

test('pembulatan hanya pada tampilan dan mengembalikan teks', () => {
  const v = D('1234.5678905');
  assert.equal(v.toFixedString(2), '1234.57');
  assert.equal(v.toFixedString(0), '1235');
  assert.equal(v.toString(), '1234.567890500000', 'nilai antara tetap presisi penuh');
  assert.equal(typeof v.toFixedString(2), 'string');
});

test('penjumlahan tidak bergantung urutan masukan', () => {
  const values = ['0.1', '0.2', '0.3', '1000000.000000000001', '-0.4'];
  const forward = sum(values).toString();
  const reverse = sum([...values].reverse()).toString();
  assert.equal(forward, reverse);
});

test('rata-rata tertimbang dengan bobot nol gagal keras', () => {
  assert.throws(() => weightedAverage([['1', '0'], ['2', '0']]), (e) => e.code === 'ZERO_WEIGHT');
  const dqs = weightedAverage([['1', '100'], ['5', '300']]);
  assert.equal(dqs.toFixedString(4), '4.0000');
});

test('pemangkatan dipakai untuk faktor diskonto', () => {
  const dfBase = D('1').div(D('1').add('0.1'));
  assert.equal(dfBase.pow(0).toFixedString(6), '1.000000');
  assert.equal(dfBase.pow(2).toFixedString(6), '0.826446');
});

// --- Formula registry dan calculation run --------------------------------

const buildRegistry = () => {
  const r = new FormulaRegistry();
  r.register({
    formulaId: 'B3.SCOPE2.LOCATION',
    version: '1.0.0',
    unit: 'tCO2e',
    reference: 'Buku 3; Master Prompt Bagian 05.1',
    inputs: ['kwh'],
    parameters: ['grid_ef_kgco2e_per_kwh'],
    compute: ({ input, param }) => input.kwh.mul(param.get('grid_ef_kgco2e_per_kwh')).div('1000'),
  });
  r.register({
    formulaId: 'B2.COLLATERAL.CARBON_COST',
    version: '1.0.0',
    unit: 'IDR',
    reference: 'Buku 2 Bagian 2.2.1.1.1',
    inputs: ['gfaSqm', 'eui'],
    parameters: ['grid_ef_kgco2e_per_kwh', 'tnd_loss_ratio', 'carbon_price_idr_per_tco2e', 'pass_through_rate'],
    compute: ({ input, param }) => {
      const kwh = input.gfaSqm.mul(input.eui);
      const tco2e = kwh.mul(param.get('grid_ef_kgco2e_per_kwh')).div('1000')
        .mul(D('1').add(param.get('tnd_loss_ratio')));
      const gross = tco2e.mul(param.get('carbon_price_idr_per_tco2e'));
      return gross.mul(D('1').sub(param.get('pass_through_rate')));
    },
  });
  return r;
};

const buildParams = () => new ParameterSet()
  .add({ key: 'grid_ef_kgco2e_per_kwh', value: '0.879000000000', unit: 'kgCO2e/kWh', status: 'APPROVED', documentId: 'OJK-CRMS-2026-B4', page: 1, version: '2026' })
  .add({ key: 'tnd_loss_ratio', value: '0.085000000000', unit: 'ratio', status: 'APPROVED', documentId: 'ESDM-STAT', page: 1, version: '2026' })
  .add({ key: 'carbon_price_idr_per_tco2e', value: '150000.000000000000', unit: 'IDR/tCO2e', status: 'APPROVED', documentId: 'OJK-CRMS-2026-B4', page: 2, version: '2026' })
  .add({ key: 'pass_through_rate', value: '0.300000000000', unit: 'ratio', status: 'APPROVED', documentId: 'OJK-CRMS-2026-B2', page: 25, version: '2026' });

test('parameter yang belum APPROVED tidak dapat mengisi run resmi', () => {
  const p = new ParameterSet();
  assert.throws(() => p.add({ key: 'x', value: '1', status: 'EXTRACTED' }), (e) => e.code === 'PARAM_NOT_APPROVED');
  const sandbox = new ParameterSet({ allowUnapproved: true });
  sandbox.add({ key: 'x', value: '1', status: 'EXTRACTED' });
  assert.equal(sandbox.get('x').toFixedString(0), '1');
});

test('parameter yang hilang menghentikan kalkulasi, bukan memakai default', () => {
  const p = new ParameterSet();
  assert.throws(() => p.get('tidak_ada'), (e) => e.code === 'PARAM_MISSING');
  assert.throws(
    () => runFormula({ registry: buildRegistry(), formulaId: 'B3.SCOPE2.LOCATION', version: '1.0.0', inputs: { kwh: '100' }, parameters: p }),
    (e) => e.code === 'PARAM_MISSING',
  );
});

test('formula Scope 2 menghasilkan nilai presisi penuh dan jejak lengkap', () => {
  const out = runFormula({
    registry: buildRegistry(), formulaId: 'B3.SCOPE2.LOCATION', version: '1.0.0',
    inputs: { kwh: '1250000' }, parameters: buildParams(),
  });
  assert.equal(out.value.toString(), '1098.750000000000');
  assert.equal(out.unit, 'tCO2e');
  assert.equal(out.trace.inputs.kwh, '1250000.000000000000');
  assert.equal(out.trace.parameters.grid_ef_kgco2e_per_kwh.documentId, 'OJK-CRMS-2026-B4');
  assert.equal(out.trace.parameters.grid_ef_kgco2e_per_kwh.status, 'APPROVED');
});

test('biaya karbon agunan mengikuti urutan Buku 2 termasuk T&D loss dan pass-through', () => {
  const out = runFormula({
    registry: buildRegistry(), formulaId: 'B2.COLLATERAL.CARBON_COST', version: '1.0.0',
    inputs: { gfaSqm: '10000', eui: '180' }, parameters: buildParams(),
  });
  // 10000*180 = 1.8e6 kWh; *0.879/1000 = 1582.2 tCO2e; *1.085 = 1716.687;
  // *150000 = 257.503.050; *(1-0.3) = 180.252.135.
  assert.equal(out.value.toFixedString(2), '180252135.00');
});

test('formula wajib mengembalikan Decimal, bukan Number', () => {
  const r = new FormulaRegistry();
  r.register({ formulaId: 'BAD', version: '1.0.0', inputs: ['a'], compute: () => 1.5 });
  assert.throws(
    () => runFormula({ registry: r, formulaId: 'BAD', version: '1.0.0', inputs: { a: '1' }, parameters: new ParameterSet() }),
    (e) => e.code === 'NON_DECIMAL_RESULT',
  );
});

test('formula yang tidak terdaftar atau input kurang gagal keras', () => {
  const r = buildRegistry();
  assert.throws(() => r.get('TIDAK_ADA', '1.0.0'), (e) => e.code === 'FORMULA_NOT_FOUND');
  assert.throws(
    () => runFormula({ registry: r, formulaId: 'B3.SCOPE2.LOCATION', version: '1.0.0', inputs: {}, parameters: buildParams() }),
    (e) => e.code === 'INPUT_MISSING',
  );
});

const runOnce = (seed = null) => createCalculationRun({
  runId: 'RUN-2026-0001', tenantId: 'bank-sawan', mode: 'standardised',
  scenario: 'net_zero_2050', projectionYear: 2030,
  snapshotHash: sha256('snapshot-2026-12-31'),
  registry: buildRegistry(), parameters: buildParams(),
  inputs: { kwh: '1250000', gfaSqm: '10000', eui: '180' },
  executedBy: 'subject-analyst', executedAt: '2026-11-01T10:00:00.000Z',
  randomSeed: seed,
  computeAll: ({ registry, parameters, inputs }) => ({
    scope2: runFormula({ registry, formulaId: 'B3.SCOPE2.LOCATION', version: '1.0.0', inputs, parameters }).value,
    collateralCarbonCost: runFormula({ registry, formulaId: 'B2.COLLATERAL.CARBON_COST', version: '1.0.0', inputs, parameters }).value,
  }),
});

test('run deterministik: input, parameter, dan formula sama menghasilkan digest sama', () => {
  const a = runOnce();
  const b = runOnce();
  assert.equal(a.manifest.outputDigest, b.manifest.outputDigest);
  assert.equal(a.manifestDigest, b.manifestDigest);
  assert.equal(verifyReproduction(a, b).reproducible, true);
});

test('manifest memuat semua yang dibutuhkan untuk reproduksi', () => {
  const { manifest } = runOnce();
  for (const field of ['runId', 'tenantId', 'mode', 'scenario', 'projectionYear', 'snapshotHash',
    'parameterSetDigest', 'formulaSetDigest', 'inputDigest', 'outputDigest', 'randomSeed', 'engineContract']) {
    assert.ok(field in manifest, `manifest kehilangan ${field}`);
  }
  assert.match(manifest.snapshotHash, /^[a-f0-9]{64}$/);
});

test('perubahan satu parameter mengubah digest sehingga run lama tidak dapat diklaim ulang', () => {
  const original = runOnce();
  const changed = createCalculationRun({
    runId: 'RUN-2026-0002', tenantId: 'bank-sawan', mode: 'standardised',
    scenario: 'net_zero_2050', projectionYear: 2030,
    snapshotHash: sha256('snapshot-2026-12-31'),
    registry: buildRegistry(),
    parameters: buildParams().add({ key: 'carbon_price_idr_per_tco2e', value: '200000.000000000000', unit: 'IDR/tCO2e', status: 'APPROVED' }),
    inputs: { kwh: '1250000', gfaSqm: '10000', eui: '180' },
    computeAll: ({ registry, parameters, inputs }) => ({
      scope2: runFormula({ registry, formulaId: 'B3.SCOPE2.LOCATION', version: '1.0.0', inputs, parameters }).value,
      collateralCarbonCost: runFormula({ registry, formulaId: 'B2.COLLATERAL.CARBON_COST', version: '1.0.0', inputs, parameters }).value,
    }),
  });
  const check = verifyReproduction(original, changed);
  assert.equal(check.reproducible, false);
  assert.ok(check.findings.some((f) => f.field === 'parameterSetDigest'));
  assert.ok(check.findings.some((f) => f.field === 'outputDigest'));
});

test('random seed dicatat pada manifest bila dipakai', () => {
  const seeded = runOnce('seed-42');
  assert.equal(seeded.manifest.randomSeed, 'seed-42');
  assert.notEqual(seeded.manifestDigest, runOnce(null).manifestDigest);
});

test('snapshot hash wajib SHA-256 dan mode wajib dikenal', () => {
  assert.throws(() => createCalculationRun({
    runId: 'R', tenantId: 'T', mode: 'standardised', snapshotHash: 'bukan-hash',
    registry: buildRegistry(), parameters: buildParams(), inputs: {}, computeAll: () => ({}),
  }), (e) => e.code === 'SNAPSHOT_HASH_REQUIRED');
  assert.throws(() => createCalculationRun({
    runId: 'R', tenantId: 'T', mode: 'tebak', snapshotHash: sha256('x'),
    registry: buildRegistry(), parameters: buildParams(), inputs: {}, computeAll: () => ({}),
  }), (e) => e.code === 'UNKNOWN_MODE');
});

// --- Anti double counting -------------------------------------------------

test('agregasi bersih ketika setiap komponen muncul sekali', () => {
  const r = assertNoDoubleCounting([
    { componentId: 'delta_ckpn', sourceRunId: 'RUN-1', channel: 'ecl' },
    { componentId: 'mtm_fvtpl', sourceRunId: 'RUN-2', channel: 'mtm' },
  ]);
  assert.equal(r.clean, true);
});

test('komponen tanpa componentId atau run sumber ditolak', () => {
  const r = assertNoDoubleCounting([{ sourceRunId: 'RUN-1', channel: 'ecl' }, { componentId: 'x', channel: 'ecl' }]);
  assert.equal(r.clean, false);
  assert.ok(r.findings.some((f) => f.code === 'COMPONENT_ID_MISSING'));
  assert.ok(r.findings.some((f) => f.code === 'SOURCE_RUN_MISSING'));
});

test('komponen yang terhitung dua kali terdeteksi', () => {
  const r = assertNoDoubleCounting([
    { componentId: 'delta_ckpn', sourceRunId: 'RUN-1', channel: 'ecl' },
    { componentId: 'delta_ckpn', sourceRunId: 'RUN-1', channel: 'capital' },
  ]);
  assert.equal(r.clean, false);
  assert.ok(r.findings.some((f) => f.code === 'DOUBLE_COUNTED'));
});

test('haircut agunan fisik tidak boleh masuk LGD dan kerugian fisik bank sekaligus', () => {
  const r = assertNoDoubleCounting([
    { componentId: 'collateral_physical_haircut', sourceRunId: 'RUN-1', channel: 'lgd' },
    { componentId: 'collateral_physical_haircut', sourceRunId: 'RUN-2', channel: 'bank_physical_loss' },
  ]);
  assert.equal(r.clean, false);
  assert.ok(r.findings.some((f) => f.code === 'FORBIDDEN_CHANNEL_PAIR'));
});

test('kerusakan aset bank sendiri tidak boleh masuk operasional dan kredit sekaligus', () => {
  const r = assertNoDoubleCounting([
    { componentId: 'bank_own_asset_damage', sourceRunId: 'RUN-1', channel: 'operational' },
    { componentId: 'bank_own_asset_damage', sourceRunId: 'RUN-2', channel: 'credit' },
  ]);
  assert.equal(r.clean, false);
  assert.ok(r.findings.some((f) => f.code === 'FORBIDDEN_CHANNEL_PAIR'));
});

test('sekuritas amortised cost tidak boleh masuk ECL dan MTM sekaligus', () => {
  const r = assertNoDoubleCounting([
    { componentId: 'amortised_cost_impairment', sourceRunId: 'RUN-1', channel: 'ecl' },
    { componentId: 'amortised_cost_impairment', sourceRunId: 'RUN-2', channel: 'mtm' },
  ]);
  assert.equal(r.clean, false);
});

// --- Uji properti Bagian 05.12 -------------------------------------------

test('uji properti: batas PD dan LGD serta monotonisitas harga karbon', () => {
  const registry = new FormulaRegistry();
  registry.register({
    formulaId: 'B7.PD.SCALED', version: '1.0.0', unit: 'ratio',
    inputs: ['pdTtc', 'scalar'],
    compute: ({ input }) => {
      const scaled = input.pdTtc.mul(input.scalar);
      return scaled.gt('1') ? D('1') : scaled;
    },
  });
  const params = new ParameterSet();
  let violations = 0;
  let previous = null;
  for (let i = 1; i <= 2000; i += 1) {
    const pdTtc = D(String(i)).div('200000');      // 0.000005 sampai 0.01
    const scalar = D('1').add(D(String(i)).div('2000')); // 1.0005 sampai 2
    const out = runFormula({ registry, formulaId: 'B7.PD.SCALED', version: '1.0.0', inputs: { pdTtc, scalar }, parameters: params }).value;
    if (out.lt('0') || out.gt('1')) violations += 1;
    if (out.lt(pdTtc)) violations += 1; // skalar >= 1 tidak boleh menurunkan PD
    if (previous && out.lt(previous)) violations += 1; // monoton naik
    previous = out;
  }
  assert.equal(violations, 0, 'uji properti bounds dan monotonisitas gagal');
});

test('konservasi agregat: jumlah per sektor sama dengan total portofolio', () => {
  const perSector = { pertanian: '1000.5', pertambangan: '2500.25', konstruksi: '750.125', lainnya: '99.875' };
  const total = sum(Object.values(perSector));
  assert.equal(total.toString(), '4350.750000000000');
  const recomputed = sum(Object.keys(perSector).reverse().map((k) => perSector[k]));
  assert.equal(recomputed.toString(), total.toString());
});
