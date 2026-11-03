// M31 Reporting Cycle: siklus 16 tahap dengan gate dan RACI.
// Master Execution Prompt v2.0 Bagian 02.
//
// Tahap berikutnya terkunci sampai gate tahap sebelumnya lulus, kecuali tahap
// yang ditandai paralel. Engine ini murni dan deterministik: gate dievaluasi
// dari bukti yang diberikan pemanggil, bukan dari pembacaan basis data.

export const RACI = Object.freeze({ R: 'R', A: 'A', C: 'C', I: 'I' });

/**
 * Definisi 16 tahap. `parallelWith` menyatakan tahap yang boleh berjalan
 * bersamaan, sehingga tahap 3 tidak memblokir tahap 4 sampai 6.
 */
export const STAGES = Object.freeze([
  {
    no: 1, key: 'onboarding', name: 'Onboarding dan tenant aktif', modules: ['M01', 'M02', 'M03'],
    output: 'tenant ACTIVE, SSO dan MFA aktif, struktur organisasi disetujui',
    gate: 'verifikasi institusi dan UAT sandbox selesai',
    // Compliance memegang akuntabilitas akhir atas verifikasi institusi dan
    // penerapan SSO/MFA; Data dan IT yang mengerjakan. Setiap tahap wajib punya
    // tepat satu pihak A agar gate tidak pernah lulus tanpa pemilik keputusan.
    raci: { climate_risk: RACI.I, data_it: RACI.R, finance: RACI.I, business_risk: RACI.I, compliance: RACI.A, validator: RACI.I, board: RACI.I },
  },
  {
    no: 2, key: 'cycle_opening', name: 'Pembukaan siklus', modules: ['M04', 'M25'],
    output: 'Reporting Cycle dengan periode, cut-off, tenggat per tahap, versi 7 Buku, skenario wajib',
    gate: 'kalender disetujui Climate Risk Head',
    raci: { climate_risk: RACI.A, data_it: RACI.C, finance: RACI.C, business_risk: RACI.C, compliance: RACI.C, validator: RACI.I, board: RACI.I },
  },
  {
    no: 3, key: 'governance_readiness', name: 'Tata kelola dan kesiapan', modules: ['M06', 'M07'],
    output: 'konten kualitatif Bagian A Buku 6',
    gate: 'self-assessment Discovery Readiness selesai, kebijakan dan risk appetite disetujui',
    parallelWith: [4, 5, 6],
    raci: { climate_risk: RACI.A, data_it: RACI.C, finance: RACI.I, business_risk: RACI.C, compliance: RACI.C, validator: RACI.I, board: RACI.C },
  },
  {
    no: 4, key: 'data_ingest', name: 'Ingest data sumber', modules: ['M09'],
    output: 'data_snapshot dengan hash SHA-256 per batch',
    gate: 'seluruh sumber wajib ter-ingest dan dibekukan',
    raci: { climate_risk: RACI.C, data_it: RACI.R, finance: RACI.A, business_risk: RACI.C, compliance: RACI.I, validator: RACI.I, board: RACI.I },
  },
  {
    no: 5, key: 'data_quality', name: 'Kualitas data dan rekonsiliasi', modules: ['M27'],
    output: 'rekonsiliasi fasilitas ke subledger, GL control account, dan neraca publikasi',
    gate: 'selisih di bawah toleransi Finance dan exception material terbuka nol',
    raci: { climate_risk: RACI.C, data_it: RACI.R, finance: RACI.A, business_risk: RACI.C, compliance: RACI.I, validator: RACI.I, board: RACI.I },
  },
  {
    no: 6, key: 'operational_emissions', name: 'Emisi operasional Scope 1 sampai 3', modules: ['M10', 'M11', 'M12'],
    output: 'emisi bank untuk Bagian B',
    gate: 'maker, checker, dan approver lengkap pada seluruh aktivitas',
    raci: { climate_risk: RACI.A, data_it: RACI.R, finance: RACI.C, business_risk: RACI.C, compliance: RACI.I, validator: RACI.I, board: RACI.I },
  },
  {
    no: 7, key: 'financed_emissions', name: 'Emisi debitur dan financed emissions', modules: ['M13'],
    output: 'emisi debitur, financed emissions PCAF, DQ score, coverage',
    gate: 'coverage dan DQ score dilaporkan dan disetujui',
    raci: { climate_risk: RACI.A, data_it: RACI.R, finance: RACI.C, business_risk: RACI.C, compliance: RACI.I, validator: RACI.I, board: RACI.I },
  },
  {
    no: 8, key: 'scenario_lock', name: 'Kunci skenario', modules: ['M14'],
    output: 'dataset Buku 4 berversi dengan checksum dan vintage terkunci',
    gate: 'skenario berstatus APPROVED',
    raci: { climate_risk: RACI.A, data_it: RACI.R, finance: RACI.I, business_risk: RACI.C, compliance: RACI.I, validator: RACI.C, board: RACI.I },
  },
  {
    no: 9, key: 'physical_mapping', name: 'Pemetaan risiko fisik', modules: ['M15'],
    output: 'geocoding debitur, agunan, kantor, data center ke wilayah Buku 5 dan skor hazard',
    gate: 'match rate dan lokasi tak terpetakan dilaporkan dan disetujui',
    raci: { climate_risk: RACI.A, data_it: RACI.R, finance: RACI.I, business_risk: RACI.C, compliance: RACI.I, validator: RACI.C, board: RACI.I },
  },
  {
    no: 10, key: 'crsa_run', name: 'Jalankan CRSA', modules: ['M16', 'M17', 'M18', 'M19', 'M20', 'M22'],
    output: 'run kredit, pasar, likuiditas, operasional per skenario dan tahun dengan run_id dan manifest',
    gate: 'seluruh run wajib selesai dan reproducible dari manifest',
    raci: { climate_risk: RACI.A, data_it: RACI.C, finance: RACI.R, business_risk: RACI.R, compliance: RACI.I, validator: RACI.C, board: RACI.I },
  },
  {
    no: 11, key: 'financial_aggregation', name: 'Agregasi dampak keuangan dan modal', modules: ['M21'],
    output: 'laba rugi, CKPN, valuasi, KPMM, LCR per skenario tanpa double counting',
    gate: 'uji anti double counting lulus',
    raci: { climate_risk: RACI.A, data_it: RACI.C, finance: RACI.R, business_risk: RACI.R, compliance: RACI.I, validator: RACI.C, board: RACI.I },
  },
  {
    no: 12, key: 'independent_validation', name: 'Validasi independen', modules: ['M26'],
    output: 'reproduksi run dari manifest, uji sensitivitas, temuan tercatat',
    gate: 'tidak ada temuan severity tinggi terbuka atas model yang mengisi laporan',
    raci: { climate_risk: RACI.C, data_it: RACI.I, finance: RACI.I, business_risk: RACI.C, compliance: RACI.I, validator: RACI.A, board: RACI.I },
  },
  {
    no: 13, key: 'book6_drafting', name: 'Penyusunan Buku 6', modules: ['M23'],
    output: 'sel kuantitatif terisi otomatis dari run APPROVED, sel kualitatif dilengkapi pengguna',
    gate: 'validasi lintas bagian lulus dan sel wajib terisi',
    raci: { climate_risk: RACI.R, data_it: RACI.C, finance: RACI.R, business_risk: RACI.R, compliance: RACI.A, validator: RACI.C, board: RACI.C },
  },
  {
    no: 14, key: 'tiered_review', name: 'Review berjenjang', modules: ['M25'],
    output: 'Technical, Risk, Finance, Compliance, Sharia untuk BUS/UUS, lalu persetujuan Direksi',
    gate: 'seluruh review lulus dan persetujuan Direksi tercatat',
    raci: { climate_risk: RACI.R, data_it: RACI.C, finance: RACI.R, business_risk: RACI.R, compliance: RACI.A, validator: RACI.C, board: RACI.C },
  },
  {
    no: 15, key: 'lock_export_submit', name: 'Kunci, ekspor, dan submission', modules: ['M23'],
    output: 'laporan LOCKED, ekspor template resmi, checksum, paket bukti, tanda terima OJK',
    gate: 'bukti tanda terima atau nomor referensi OJK terunggah',
    // Persetujuan Direksi sudah menjadi kriteria gate tahap 14, sehingga pada
    // tahap 15 Direksi berstatus C: akuntabilitas submission ada pada Compliance.
    raci: { climate_risk: RACI.R, data_it: RACI.C, finance: RACI.C, business_risk: RACI.I, compliance: RACI.A, validator: RACI.I, board: RACI.C },
  },
  {
    no: 16, key: 'feedback_archive', name: 'Umpan balik, resubmission, pengungkapan, arsip', modules: ['M23', 'M24', 'M28'],
    output: 'tanggapan OJK tercatat, revisi sebagai versi baru, sinkron ke laporan keberlanjutan, arsip sesuai retensi',
    gate: 'arsip tersimpan sesuai kebijakan retensi',
    raci: { climate_risk: RACI.R, data_it: RACI.C, finance: RACI.C, business_risk: RACI.I, compliance: RACI.A, validator: RACI.I, board: RACI.I },
  },
]);

export const STAGE_COUNT = STAGES.length;
export const STAGE_STATUS = Object.freeze(['LOCKED', 'OPEN', 'IN_PROGRESS', 'GATE_PENDING', 'GATE_FAILED', 'PASSED']);

const byNo = new Map(STAGES.map((s) => [s.no, s]));
export const getStage = (no) => byNo.get(no) || null;

export class CycleError extends Error {
  constructor(code, message) { super(message); this.name = 'CycleError'; this.code = code; }
}

/** Prasyarat tahap: seluruh tahap sebelumnya yang tidak paralel harus PASSED. */
export function prerequisites(stageNo) {
  const stage = getStage(stageNo);
  if (!stage) throw new CycleError('UNKNOWN_STAGE', `Tahap ${stageNo} tidak dikenal.`);
  const parallel = new Set(stage.parallelWith || []);
  return STAGES.filter((s) => s.no < stageNo && !parallel.has(s.no)).map((s) => s.no);
}

/**
 * Status efektif setiap tahap berdasarkan gate yang sudah lulus.
 * @param {Set<number>|number[]} passedStages
 */
export function cycleState(passedStages = []) {
  const passed = new Set(passedStages);
  return Object.freeze(STAGES.map((s) => {
    if (passed.has(s.no)) return { no: s.no, key: s.key, status: 'PASSED', blockedBy: [] };
    const blockedBy = prerequisites(s.no).filter((p) => !passed.has(p));
    return Object.freeze({
      no: s.no,
      key: s.key,
      status: blockedBy.length ? 'LOCKED' : 'OPEN',
      blockedBy: Object.freeze(blockedBy),
    });
  }));
}

/**
 * Evaluasi gate satu tahap.
 *
 * Kriteria gate bersifat deklaratif: pemanggil menyerahkan bukti, engine
 * memutuskan. Bukti yang hilang berarti GAGAL, bukan diasumsikan lulus,
 * sesuai prinsip fail closed Bagian 01.1.
 */
export function evaluateGate({ stageNo, passedStages = [], evidence = {} }) {
  const stage = getStage(stageNo);
  if (!stage) throw new CycleError('UNKNOWN_STAGE', `Tahap ${stageNo} tidak dikenal.`);

  const blockedBy = prerequisites(stageNo).filter((p) => !new Set(passedStages).has(p));
  if (blockedBy.length) {
    return gateResult(stage, false, 'STAGE_LOCKED', `Tahap ${stageNo} terkunci oleh tahap ${blockedBy.join(', ')}.`);
  }

  const required = GATE_CRITERIA[stage.key] || [];
  const missing = [];
  for (const c of required) {
    const value = evidence[c.field];
    if (value === undefined || value === null) { missing.push(`${c.field} tidak ada`); continue; }
    if (!c.test(value, evidence)) missing.push(c.message);
  }
  if (missing.length) {
    return gateResult(stage, false, 'GATE_FAILED', missing.join('; '));
  }
  return gateResult(stage, true, 'GATE_PASSED', stage.gate);
}

const gateResult = (stage, passed, code, detail) => Object.freeze({
  stageNo: stage.no, stageKey: stage.key, passed, code, detail,
});

const nonEmpty = (v) => typeof v === 'string' ? v.trim().length > 0 : Array.isArray(v) ? v.length > 0 : Boolean(v);
const isTrue = (v) => v === true;
const isZero = (v) => v === 0;

/** Kriteria gate per tahap. Setiap kriteria dapat diuji tanpa basis data. */
export const GATE_CRITERIA = Object.freeze({
  onboarding: [
    { field: 'institutionVerified', test: isTrue, message: 'verifikasi institusi belum selesai' },
    { field: 'sandboxUatSignedOff', test: isTrue, message: 'UAT sandbox belum ditandatangani' },
    { field: 'ssoActive', test: isTrue, message: 'SSO belum aktif' },
    { field: 'mfaEnforced', test: isTrue, message: 'MFA belum diwajibkan' },
  ],
  cycle_opening: [
    { field: 'cutOffDate', test: nonEmpty, message: 'tanggal posisi data belum ditetapkan' },
    { field: 'bookVersions', test: (v) => Array.isArray(v) && v.length === 7, message: 'versi 7 Buku belum lengkap' },
    { field: 'mandatoryScenarios', test: (v) => Array.isArray(v) && v.length >= 3, message: 'skenario wajib belum lengkap' },
    { field: 'calendarApprovedBy', test: nonEmpty, message: 'kalender belum disetujui Climate Risk Head' },
  ],
  governance_readiness: [
    { field: 'discoveryReadinessComplete', test: isTrue, message: 'Discovery Readiness belum selesai' },
    { field: 'policyApproved', test: isTrue, message: 'kebijakan belum disetujui' },
    { field: 'riskAppetiteApproved', test: isTrue, message: 'risk appetite belum disetujui' },
    { field: 'kriActive', test: isTrue, message: 'KRI belum aktif' },
  ],
  data_ingest: [
    { field: 'snapshotHashes', test: (v) => Array.isArray(v) && v.length > 0 && v.every((h) => /^[a-f0-9]{64}$/.test(h)), message: 'snapshot wajib memiliki hash SHA-256' },
    { field: 'requiredSourcesMissing', test: isZero, message: 'masih ada sumber data wajib yang belum ter-ingest' },
  ],
  data_quality: [
    { field: 'reconciliationWithinTolerance', test: isTrue, message: 'rekonsiliasi di luar toleransi Finance' },
    { field: 'openMaterialExceptions', test: isZero, message: 'masih ada exception material terbuka' },
    { field: 'financeSignOffBy', test: nonEmpty, message: 'sign-off Finance belum ada' },
  ],
  operational_emissions: [
    { field: 'activitiesWithoutApproval', test: isZero, message: 'masih ada aktivitas emisi tanpa persetujuan' },
    { field: 'evidenceMissing', test: isZero, message: 'masih ada aktivitas tanpa bukti' },
  ],
  financed_emissions: [
    { field: 'coveragePercent', test: (v) => typeof v === 'string' && Number.parseFloat(v) >= 0, message: 'coverage belum dilaporkan' },
    { field: 'dataQualityScoreReported', test: isTrue, message: 'DQ score belum dilaporkan' },
    { field: 'approvedBy', test: nonEmpty, message: 'hasil belum disetujui' },
  ],
  scenario_lock: [
    { field: 'datasetChecksumVerified', test: isTrue, message: 'checksum dataset belum terverifikasi' },
    { field: 'vintageLocked', test: isTrue, message: 'vintage belum dikunci' },
    { field: 'scenarioStatus', test: (v) => v === 'APPROVED', message: 'skenario belum berstatus APPROVED' },
  ],
  physical_mapping: [
    { field: 'matchRatePercent', test: (v) => typeof v === 'string' && Number.parseFloat(v) >= 0, message: 'match rate belum dilaporkan' },
    { field: 'unmappedLocationsReported', test: isTrue, message: 'lokasi tak terpetakan belum dilaporkan' },
    { field: 'approvedBy', test: nonEmpty, message: 'hasil pemetaan belum disetujui' },
  ],
  crsa_run: [
    { field: 'runIds', test: (v) => Array.isArray(v) && v.length > 0, message: 'belum ada run yang selesai' },
    { field: 'allRunsReproducible', test: isTrue, message: 'ada run yang tidak dapat direproduksi dari manifest' },
    { field: 'failedRuns', test: isZero, message: 'masih ada run yang gagal' },
  ],
  financial_aggregation: [
    { field: 'doubleCountingTestPassed', test: isTrue, message: 'uji anti double counting gagal' },
    { field: 'componentsWithoutSource', test: isZero, message: 'ada komponen agregat tanpa run sumber' },
  ],
  independent_validation: [
    { field: 'runsReproducedByValidator', test: isTrue, message: 'validator belum mereproduksi run dari manifest' },
    { field: 'openHighSeverityFindings', test: isZero, message: 'masih ada temuan severity tinggi terbuka' },
    { field: 'validatorSubject', test: nonEmpty, message: 'identitas validator belum tercatat' },
  ],
  book6_drafting: [
    { field: 'mandatoryCellsUnfilled', test: isZero, message: 'masih ada sel wajib Buku 6 yang kosong' },
    { field: 'crossSectionValidationPassed', test: isTrue, message: 'validasi lintas bagian gagal' },
    { field: 'quantitativeCellsFromApprovedRuns', test: isTrue, message: 'ada sel kuantitatif yang tidak berasal dari run APPROVED' },
  ],
  tiered_review: [
    { field: 'reviews', test: (v, ev) => {
      if (!Array.isArray(v)) return false;
      const need = ['technical', 'risk', 'finance', 'compliance'];
      if (ev.isShariaEntity === true) need.push('sharia');
      const done = new Set(v.filter((r) => r.outcome === 'passed').map((r) => r.kind));
      return need.every((n) => done.has(n));
    }, message: 'review berjenjang belum lengkap' },
    { field: 'boardApprovalBy', test: nonEmpty, message: 'persetujuan Direksi belum tercatat' },
  ],
  lock_export_submit: [
    { field: 'reportStatus', test: (v) => v === 'LOCKED', message: 'laporan belum berstatus LOCKED' },
    { field: 'exportStructureMatchesTemplate', test: isTrue, message: 'struktur ekspor tidak identik dengan template resmi' },
    { field: 'packageChecksum', test: (v) => /^[a-f0-9]{64}$/.test(String(v)), message: 'checksum paket belum tercatat' },
    { field: 'ojkReceiptRef', test: nonEmpty, message: 'bukti tanda terima atau nomor referensi OJK belum ada' },
  ],
  feedback_archive: [
    { field: 'archivedUnderRetentionPolicy', test: isTrue, message: 'arsip belum sesuai kebijakan retensi' },
  ],
});

/**
 * Status submission. Sistem tidak boleh menandai SUBMITTED tanpa bukti tanda
 * terima, sesuai Bagian 02.1 tahap 15.
 */
export const SUBMISSION_STATUS = Object.freeze(['DRAFT', 'LOCKED', 'EXPORTED', 'SUBMITTED', 'ACKNOWLEDGED', 'FEEDBACK', 'RESUBMITTED']);

export function canMarkSubmitted({ status, ojkReceiptRef, receiptAttachmentRef }) {
  if (status !== 'EXPORTED') {
    return { allowed: false, code: 'NOT_EXPORTED', message: 'Laporan wajib EXPORTED sebelum ditandai SUBMITTED.' };
  }
  if (!ojkReceiptRef || !receiptAttachmentRef) {
    return { allowed: false, code: 'RECEIPT_REQUIRED', message: 'Nomor referensi dan unggahan tanda terima OJK wajib ada sebelum status SUBMITTED.' };
  }
  return { allowed: true, code: 'ALLOW', message: '' };
}
