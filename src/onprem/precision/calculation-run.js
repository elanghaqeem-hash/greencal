// Formula berversi dan calculation_run yang dapat direproduksi.
// Master Execution Prompt v2.0 Bagian 01.1 butir 2 dan Bagian 09.1.
//
// Deterministic engine: hasil yang sama untuk input, versi parameter, dan versi
// formula yang sama. Tidak ada random seed tanpa dicatat. Setiap run
// menghasilkan manifest berisi hash input dan hash output, sehingga validator
// independen dapat mereproduksi run dari manifest saja.

import { Decimal, D } from './decimal.js';
import { canonicalize, sha256 } from '../audit/hash-chain.js';

export class FormulaError extends Error {
  constructor(code, message) { super(message); this.name = 'FormulaError'; this.code = code; }
}

/**
 * Registry formula. Setiap formula punya formula_id berversi, daftar input
 * wajib, daftar parameter regulatori yang dipakai, dan implementasi murni.
 */
export class FormulaRegistry {
  constructor() { this._formulas = new Map(); }

  register(definition) {
    const { formulaId, version, inputs, parameters = [], compute, unit, reference } = definition;
    if (!formulaId || !version) throw new FormulaError('FORMULA_ID_REQUIRED', 'formulaId dan version wajib ada.');
    const key = `${formulaId}@${version}`;
    if (this._formulas.has(key)) throw new FormulaError('FORMULA_DUPLICATE', `${key} sudah terdaftar.`);
    if (typeof compute !== 'function') throw new FormulaError('COMPUTE_REQUIRED', `${key} wajib memiliki fungsi compute.`);
    if (!Array.isArray(inputs) || inputs.length === 0) throw new FormulaError('INPUTS_REQUIRED', `${key} wajib mendeklarasikan input.`);
    this._formulas.set(key, Object.freeze({ formulaId, version, inputs: Object.freeze([...inputs]), parameters: Object.freeze([...parameters]), compute, unit: unit || null, reference: reference || null }));
    return key;
  }

  get(formulaId, version) {
    const f = this._formulas.get(`${formulaId}@${version}`);
    if (!f) throw new FormulaError('FORMULA_NOT_FOUND', `Formula ${formulaId}@${version} tidak terdaftar.`);
    return f;
  }

  list() { return Object.freeze([...this._formulas.keys()].sort()); }

  /** Hash seluruh definisi formula, dipakai sebagai formula_set pada manifest. */
  digest() {
    const shape = [...this._formulas.values()]
      .map((f) => ({ formulaId: f.formulaId, version: f.version, inputs: f.inputs, parameters: f.parameters, unit: f.unit }))
      .sort((a, b) => `${a.formulaId}@${a.version}`.localeCompare(`${b.formulaId}@${b.version}`));
    return sha256(canonicalize(shape));
  }
}

/**
 * Set parameter regulatori yang dipakai satu run. Hanya parameter berstatus
 * APPROVED yang boleh masuk run produksi; status lain gagal keras agar angka
 * yang belum terverifikasi tidak pernah mengisi laporan resmi.
 */
export class ParameterSet {
  constructor({ allowUnapproved = false } = {}) {
    this._params = new Map();
    this.allowUnapproved = allowUnapproved;
  }

  add({ key, value, unit, status, documentId, page, version }) {
    if (!key) throw new FormulaError('PARAM_KEY_REQUIRED', 'Kunci parameter wajib ada.');
    if (!this.allowUnapproved && status !== 'APPROVED') {
      throw new FormulaError('PARAM_NOT_APPROVED',
        `Parameter ${key} berstatus ${status}; hanya APPROVED yang boleh mengisi output resmi.`);
    }
    this._params.set(key, Object.freeze({
      key, value: D(value, key).toString(), unit: unit || null, status,
      documentId: documentId || null, page: page ?? null, version: version || null,
    }));
    return this;
  }

  /** Pengambilan parameter yang hilang gagal keras, bukan memakai default. */
  get(key) {
    const p = this._params.get(key);
    if (!p) throw new FormulaError('PARAM_MISSING', `Parameter ${key} tidak ada; kalkulasi dihentikan.`);
    return D(p.value, key);
  }

  meta(key) {
    const p = this._params.get(key);
    if (!p) throw new FormulaError('PARAM_MISSING', `Parameter ${key} tidak ada.`);
    return p;
  }

  has(key) { return this._params.has(key); }
  keys() { return Object.freeze([...this._params.keys()].sort()); }

  digest() {
    const shape = [...this._params.values()].sort((a, b) => a.key.localeCompare(b.key));
    return sha256(canonicalize(shape));
  }
}

/**
 * Menjalankan satu formula dan mengembalikan hasil beserta jejaknya.
 * Jejak inilah yang mengisi Formula panel dan trace-to-cell.
 */
export function runFormula({ registry, formulaId, version, inputs, parameters, runContext = {} }) {
  const formula = registry.get(formulaId, version);

  for (const name of formula.inputs) {
    if (inputs[name] === undefined || inputs[name] === null) {
      throw new FormulaError('INPUT_MISSING', `Formula ${formulaId}@${version} membutuhkan input ${name}.`);
    }
  }
  for (const name of formula.parameters) {
    if (!parameters.has(name)) {
      throw new FormulaError('PARAM_MISSING', `Formula ${formulaId}@${version} membutuhkan parameter ${name}.`);
    }
  }

  const decimalInputs = {};
  for (const name of formula.inputs) decimalInputs[name] = D(inputs[name], name);

  const value = formula.compute({ input: decimalInputs, param: parameters, context: runContext });
  if (!(value instanceof Decimal)) {
    throw new FormulaError('NON_DECIMAL_RESULT', `Formula ${formulaId}@${version} wajib mengembalikan Decimal.`);
  }

  return Object.freeze({
    formulaId, version, unit: formula.unit,
    value,
    trace: Object.freeze({
      inputs: Object.freeze(Object.fromEntries(Object.entries(decimalInputs).map(([k, v]) => [k, v.toString()]))),
      parameters: Object.freeze(Object.fromEntries(formula.parameters.map((p) => [p, parameters.meta(p)]))),
      reference: formula.reference,
    }),
  });
}

/**
 * calculation_run lengkap. Manifest memuat semua yang dibutuhkan untuk
 * reproduksi: snapshot data, versi parameter, versi formula, mode, skenario,
 * hash input, dan hash output.
 */
export function createCalculationRun({
  runId, tenantId, mode, scenario, projectionYear, snapshotHash,
  registry, parameters, inputs, executedBy, executedAt, randomSeed = null,
  computeAll,
}) {
  if (!runId || !tenantId) throw new FormulaError('RUN_IDENTITY_REQUIRED', 'runId dan tenantId wajib ada.');
  if (!['standardised', 'internal'].includes(mode)) {
    throw new FormulaError('UNKNOWN_MODE', `Mode ${mode} tidak dikenal; gunakan standardised atau internal.`);
  }
  if (!/^[a-f0-9]{64}$/.test(String(snapshotHash))) {
    throw new FormulaError('SNAPSHOT_HASH_REQUIRED', 'snapshotHash wajib berupa SHA-256 heksadesimal.');
  }

  const inputDigest = sha256(canonicalize(inputs));
  const results = computeAll({ registry, parameters, inputs });
  const outputShape = Object.fromEntries(
    Object.entries(results).map(([k, v]) => [k, v instanceof Decimal ? v.toString() : v]),
  );
  const outputDigest = sha256(canonicalize(outputShape));

  const manifest = Object.freeze({
    runId, tenantId, mode, scenario: scenario || null, projectionYear: projectionYear ?? null,
    snapshotHash,
    parameterSetDigest: parameters.digest(),
    formulaSetDigest: registry.digest(),
    inputDigest,
    outputDigest,
    randomSeed,
    executedBy: executedBy || null,
    executedAt: executedAt || null,
    engineContract: 'greencal-onprem-run/1',
  });

  return Object.freeze({
    manifest,
    manifestDigest: sha256(canonicalize(manifest)),
    results: Object.freeze(results),
    output: Object.freeze(outputShape),
  });
}

/**
 * Verifikasi reproduksi: menjalankan ulang dan membandingkan manifest.
 * Dipakai validator independen pada tahap 12 siklus pelaporan.
 */
export function verifyReproduction(original, replay) {
  const findings = [];
  for (const field of ['parameterSetDigest', 'formulaSetDigest', 'inputDigest', 'outputDigest', 'snapshotHash', 'mode', 'scenario', 'projectionYear']) {
    if (original.manifest[field] !== replay.manifest[field]) {
      findings.push({ field, original: original.manifest[field], replay: replay.manifest[field] });
    }
  }
  return Object.freeze({ reproducible: findings.length === 0, findings: Object.freeze(findings) });
}

/** Aturan anti double counting, Bagian 05.11. */
export function assertNoDoubleCounting(components) {
  const seen = new Map();
  const findings = [];
  for (const c of components) {
    if (!c.componentId) {
      findings.push({ code: 'COMPONENT_ID_MISSING', detail: 'setiap komponen agregat wajib memiliki componentId' });
      continue;
    }
    if (!c.sourceRunId) {
      findings.push({ componentId: c.componentId, code: 'SOURCE_RUN_MISSING', detail: 'komponen tanpa run sumber' });
    }
    const key = `${c.componentId}::${c.sourceRunId}`;
    if (seen.has(key)) {
      findings.push({ componentId: c.componentId, code: 'DOUBLE_COUNTED', detail: `komponen muncul lebih dari sekali dari run ${c.sourceRunId}` });
    }
    seen.set(key, true);
  }

  // Aturan eksplisit Bagian 05.11 butir 1 sampai 3.
  const channels = new Map();
  for (const c of components) {
    if (!c.componentId) continue;
    const list = channels.get(c.componentId) || [];
    list.push(c.channel);
    channels.set(c.componentId, list);
  }
  const forbidden = [
    ['collateral_physical_haircut', ['lgd', 'bank_physical_loss']],
    ['bank_own_asset_damage', ['operational', 'credit']],
    ['amortised_cost_impairment', ['ecl', 'mtm']],
  ];
  for (const [componentId, pair] of forbidden) {
    const used = channels.get(componentId) || [];
    if (pair.every((ch) => used.includes(ch))) {
      findings.push({ componentId, code: 'FORBIDDEN_CHANNEL_PAIR', detail: `komponen tidak boleh dihitung pada kanal ${pair.join(' dan ')} sekaligus` });
    }
  }

  return Object.freeze({ clean: findings.length === 0, findings: Object.freeze(findings) });
}
