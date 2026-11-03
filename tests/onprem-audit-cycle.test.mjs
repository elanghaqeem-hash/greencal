import test from 'node:test';
import assert from 'node:assert/strict';
import { AuditChain, computeEventHash, canonicalize, GENESIS_HASH, sha256, AuditChainError } from '../src/onprem/audit/hash-chain.js';
import {
  STAGES, STAGE_COUNT, GATE_CRITERIA, getStage, prerequisites, cycleState,
  evaluateGate, canMarkSubmitted, SUBMISSION_STATUS, RACI,
} from '../src/onprem/cycle/reporting-cycle.js';

const at = (n) => `2026-11-01T10:${String(n).padStart(2, '0')}:00.000Z`;
const ev = (n, over = {}) => ({
  occurredAt: at(n), eventType: 'RECORD_SUBMITTED', actorSubject: `u${n}`,
  actorRole: 'data_maker', resourceKind: 'emission_activity', resourceId: `rec-${n}`,
  action: 'submit', outcome: 'allowed', payload: { quantity: `${n}.000000000000` }, ...over,
});

// --- Audit hash chain -----------------------------------------------------

test('kanonikalisasi deterministik tidak bergantung urutan kunci', () => {
  assert.equal(canonicalize({ b: 1, a: 2 }), canonicalize({ a: 2, b: 1 }));
  assert.equal(canonicalize({ a: undefined, b: 1 }), '{"b":1}');
  assert.equal(canonicalize([1, 'x', null]), '[1,"x",null]');
});

test('rantai dimulai dari genesis hash dan setiap event menautkan hash sebelumnya', () => {
  const chain = new AuditChain({ tenantId: 'bank-sawan' });
  const e1 = chain.append(ev(1));
  const e2 = chain.append(ev(2));
  assert.equal(e1.prevHash, GENESIS_HASH);
  assert.equal(e2.prevHash, e1.hash);
  assert.equal(e1.sequence, 1);
  assert.equal(e2.sequence, 2);
  assert.equal(chain.headHash, e2.hash);
  assert.equal(chain.verify().valid, true);
});

test('payload tidak disimpan utuh, hanya digest-nya yang masuk hash', () => {
  const chain = new AuditChain({ tenantId: 'bank-sawan' });
  const e = chain.append(ev(1, { payload: { nasabah: 'nama rahasia', saldo: '1000.000000000000' } }));
  assert.equal('payload' in e, false, 'payload mentah tidak boleh tersimpan di event');
  assert.match(e.payloadDigest, /^[a-f0-9]{64}$/);
  assert.equal(e.payloadDigest, sha256(canonicalize({ nasabah: 'nama rahasia', saldo: '1000.000000000000' })));
});

test('rantai bersifat append-only tanpa metode ubah atau hapus', () => {
  const chain = new AuditChain({ tenantId: 'bank-sawan' });
  chain.append(ev(1));
  assert.equal(typeof chain.update, 'undefined');
  assert.equal(typeof chain.delete, 'undefined');
  assert.throws(() => { chain.events[0].outcome = 'denied'; }, TypeError, 'event wajib beku');
});

test('pengubahan isi satu event terdeteksi sebagai EVENT_TAMPERED', () => {
  const chain = new AuditChain({ tenantId: 'bank-sawan' });
  chain.append(ev(1));
  chain.append(ev(2));
  chain.append(ev(3));
  // Simulasi penyerang yang mengedit baris di basis data.
  const tampered = chain.events.map((e) => ({ ...e }));
  tampered[1].outcome = 'allowed-padahal-ditolak';
  const reloaded = Object.create(AuditChain.prototype);
  reloaded.tenantId = 'bank-sawan';
  reloaded._events = tampered;
  const result = reloaded.verify();
  assert.equal(result.valid, false);
  assert.ok(result.findings.some((f) => f.sequence === 2 && f.code === 'EVENT_TAMPERED'));
});

test('penghapusan event di tengah memutus rantai', () => {
  const chain = new AuditChain({ tenantId: 'bank-sawan' });
  chain.append(ev(1));
  chain.append(ev(2));
  chain.append(ev(3));
  const withHole = [chain.events[0], chain.events[2]];
  const reloaded = Object.create(AuditChain.prototype);
  reloaded.tenantId = 'bank-sawan';
  reloaded._events = withHole;
  const result = reloaded.verify();
  assert.equal(result.valid, false);
  assert.ok(result.findings.some((f) => f.code === 'CHAIN_BROKEN'));
  assert.ok(result.findings.some((f) => f.code === 'SEQUENCE_GAP'));
});

test('event dengan hash tidak cocok ditolak saat dimuat ulang', () => {
  const chain = new AuditChain({ tenantId: 'bank-sawan' });
  chain.append(ev(1));
  const poisoned = [{ ...chain.events[0], hash: 'f'.repeat(64) }];
  assert.throws(
    () => new AuditChain({ tenantId: 'bank-sawan', events: poisoned }),
    (e) => e instanceof AuditChainError && e.code === 'HASH_MISMATCH_ON_LOAD',
  );
});

test('event tanpa waktu sah atau tanpa eventType ditolak', () => {
  const chain = new AuditChain({ tenantId: 'bank-sawan' });
  assert.throws(() => chain.append({ eventType: 'X' }), (e) => e.code === 'TIMESTAMP_REQUIRED');
  assert.throws(() => chain.append({ occurredAt: at(1) }), (e) => e.code === 'EVENT_TYPE_REQUIRED');
  assert.throws(() => chain.append({ eventType: 'X', occurredAt: 'bukan-waktu' }), (e) => e.code === 'TIMESTAMP_REQUIRED');
});

test('event milik tenant lain tidak dapat masuk rantai', () => {
  const chain = new AuditChain({ tenantId: 'bank-sawan' });
  assert.throws(() => chain.append(ev(1, { tenantId: 'bank-lain' })), (e) => e.code === 'TENANT_MISMATCH');
});

test('rantai tanpa tenant_id ditolak', () => {
  assert.throws(() => new AuditChain({}), (e) => e.code === 'TENANT_REQUIRED');
});

test('waktu yang mundur terdeteksi sebagai CLOCK_REGRESSION', () => {
  const chain = new AuditChain({ tenantId: 'bank-sawan' });
  chain.append(ev(5));
  chain.append(ev(2));
  const result = chain.verify();
  assert.equal(result.valid, false);
  assert.ok(result.findings.some((f) => f.code === 'CLOCK_REGRESSION'));
});

test('ekspor WORM memuat head hash dan manifest digest', () => {
  const chain = new AuditChain({ tenantId: 'bank-sawan' });
  chain.append(ev(1));
  chain.append(ev(2));
  const dump = chain.exportForWorm();
  assert.equal(dump.count, 2);
  assert.equal(dump.headHash, chain.headHash);
  assert.match(dump.manifestDigest, /^[a-f0-9]{64}$/);
  const again = chain.exportForWorm();
  assert.equal(dump.manifestDigest, again.manifestDigest, 'digest wajib deterministik');
});

test('hash event hanya bergantung pada bidang yang ditetapkan', () => {
  const base = { sequence: 1, tenantId: 't', occurredAt: at(1), eventType: 'E', prevHash: GENESIS_HASH };
  const h1 = computeEventHash(base);
  const h2 = computeEventHash({ ...base, kolomBaruDiMasaDepan: 'abc' });
  assert.equal(h1, h2, 'penambahan kolom baru tidak boleh mengubah hash event lama');
});

// --- Reporting cycle 16 tahap --------------------------------------------

test('siklus memuat tepat 16 tahap berurutan dengan modul, output, gate, dan RACI', () => {
  assert.equal(STAGE_COUNT, 16);
  assert.deepEqual(STAGES.map((s) => s.no), Array.from({ length: 16 }, (_, i) => i + 1));
  const validRaci = new Set(Object.values(RACI));
  for (const s of STAGES) {
    assert.ok(s.key && s.name, `tahap ${s.no} tanpa key atau nama`);
    assert.ok(Array.isArray(s.modules) && s.modules.length > 0, `tahap ${s.no} tanpa modul`);
    assert.ok(s.output, `tahap ${s.no} tanpa output`);
    assert.ok(s.gate, `tahap ${s.no} tanpa gate`);
    assert.ok(s.raci, `tahap ${s.no} tanpa RACI`);
    for (const [fn, letter] of Object.entries(s.raci)) {
      assert.ok(validRaci.has(letter), `RACI ${letter} pada tahap ${s.no} fungsi ${fn} tidak sah`);
    }
    assert.ok(GATE_CRITERIA[s.key], `tahap ${s.key} tanpa kriteria gate yang dapat diuji`);
  }
});

test('setiap tahap memiliki tepat satu penanggung jawab akhir', () => {
  for (const s of STAGES) {
    const accountable = Object.entries(s.raci).filter(([, l]) => l === RACI.A).map(([f]) => f);
    assert.equal(accountable.length, 1,
      `tahap ${s.no} wajib punya tepat satu pihak A, ditemukan ${accountable.length} (${accountable.join(', ') || 'tidak ada'})`);
    const responsible = Object.values(s.raci).filter((l) => l === RACI.R || l === RACI.A).length;
    assert.ok(responsible >= 1, `tahap ${s.no} tanpa pelaksana`);
  }
});

test('tahap 3 berjalan paralel dengan tahap 4 sampai 6', () => {
  assert.deepEqual(getStage(3).parallelWith, [4, 5, 6]);
  assert.deepEqual(prerequisites(3), [1, 2]);
  // Tahap 4 tetap menuntut tahap 3 selesai hanya bila tidak dideklarasikan paralel
  // dari sisi tahap 4; di sini tahap 4 menuntut 1 sampai 3.
  assert.deepEqual(prerequisites(4), [1, 2, 3]);
});

test('tahap berikutnya terkunci sampai gate tahap sebelumnya lulus', () => {
  const state = cycleState([1]);
  assert.equal(state[0].status, 'PASSED');
  assert.equal(state[1].status, 'OPEN');
  assert.equal(state[2].status, 'LOCKED');
  assert.deepEqual(state[2].blockedBy, [2]);
  const later = state.find((s) => s.no === 15);
  assert.equal(later.status, 'LOCKED');
  assert.ok(later.blockedBy.length > 5);
});

test('gate tahap terkunci menolak evaluasi', () => {
  const r = evaluateGate({ stageNo: 5, passedStages: [1, 2], evidence: {} });
  assert.equal(r.passed, false);
  assert.equal(r.code, 'STAGE_LOCKED');
});

test('bukti yang hilang berarti gate GAGAL, bukan diasumsikan lulus', () => {
  const r = evaluateGate({ stageNo: 1, passedStages: [], evidence: {} });
  assert.equal(r.passed, false);
  assert.equal(r.code, 'GATE_FAILED');
  assert.ok(r.detail.includes('tidak ada'));
});

test('gate tahap 1 lulus hanya bila seluruh bukti onboarding ada', () => {
  const evidence = { institutionVerified: true, sandboxUatSignedOff: true, ssoActive: true, mfaEnforced: true };
  assert.equal(evaluateGate({ stageNo: 1, passedStages: [], evidence }).passed, true);
  assert.equal(evaluateGate({ stageNo: 1, passedStages: [], evidence: { ...evidence, mfaEnforced: false } }).passed, false);
});

test('gate pembukaan siklus menuntut 7 versi buku dan minimal 3 skenario', () => {
  const base = {
    cutOffDate: '2026-12-31',
    bookVersions: Array.from({ length: 7 }, (_, i) => `B${i + 1}@2026`),
    mandatoryScenarios: ['net_zero_2050', 'delayed_transition', 'current_policies'],
    calendarApprovedBy: 'head-1',
  };
  assert.equal(evaluateGate({ stageNo: 2, passedStages: [1], evidence: base }).passed, true);
  assert.equal(evaluateGate({ stageNo: 2, passedStages: [1], evidence: { ...base, bookVersions: ['B1'] } }).passed, false);
  assert.equal(evaluateGate({ stageNo: 2, passedStages: [1], evidence: { ...base, mandatoryScenarios: ['net_zero_2050'] } }).passed, false);
});

test('gate ingest data menuntut hash SHA-256 pada setiap snapshot', () => {
  const passed = [1, 2, 3];
  const good = { snapshotHashes: [sha256('a'), sha256('b')], requiredSourcesMissing: 0 };
  assert.equal(evaluateGate({ stageNo: 4, passedStages: passed, evidence: good }).passed, true);
  const bad = { snapshotHashes: ['bukan-hash'], requiredSourcesMissing: 0 };
  assert.equal(evaluateGate({ stageNo: 4, passedStages: passed, evidence: bad }).passed, false);
  const missing = { snapshotHashes: [sha256('a')], requiredSourcesMissing: 2 };
  assert.equal(evaluateGate({ stageNo: 4, passedStages: passed, evidence: missing }).passed, false);
});

test('gate rekonsiliasi menolak exception material terbuka', () => {
  const passed = [1, 2, 3, 4];
  const good = { reconciliationWithinTolerance: true, openMaterialExceptions: 0, financeSignOffBy: 'fin-1' };
  assert.equal(evaluateGate({ stageNo: 5, passedStages: passed, evidence: good }).passed, true);
  assert.equal(evaluateGate({ stageNo: 5, passedStages: passed, evidence: { ...good, openMaterialExceptions: 1 } }).passed, false);
  assert.equal(evaluateGate({ stageNo: 5, passedStages: passed, evidence: { ...good, financeSignOffBy: '' } }).passed, false);
});

test('gate skenario menuntut status APPROVED dan vintage terkunci', () => {
  const passed = [1, 2, 3, 4, 5, 6, 7];
  const good = { datasetChecksumVerified: true, vintageLocked: true, scenarioStatus: 'APPROVED' };
  assert.equal(evaluateGate({ stageNo: 8, passedStages: passed, evidence: good }).passed, true);
  assert.equal(evaluateGate({ stageNo: 8, passedStages: passed, evidence: { ...good, scenarioStatus: 'EXTRACTED' } }).passed, false);
});

test('gate validasi independen menolak temuan severity tinggi terbuka', () => {
  const passed = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const good = { runsReproducedByValidator: true, openHighSeverityFindings: 0, validatorSubject: 'val-1' };
  assert.equal(evaluateGate({ stageNo: 12, passedStages: passed, evidence: good }).passed, true);
  assert.equal(evaluateGate({ stageNo: 12, passedStages: passed, evidence: { ...good, openHighSeverityFindings: 1 } }).passed, false);
  assert.equal(evaluateGate({ stageNo: 12, passedStages: passed, evidence: { ...good, runsReproducedByValidator: false } }).passed, false);
});

test('gate review berjenjang menuntut review syariah untuk BUS atau UUS', () => {
  const passed = Array.from({ length: 13 }, (_, i) => i + 1);
  const reviews = [
    { kind: 'technical', outcome: 'passed' },
    { kind: 'risk', outcome: 'passed' },
    { kind: 'finance', outcome: 'passed' },
    { kind: 'compliance', outcome: 'passed' },
  ];
  const konvensional = { reviews, boardApprovalBy: 'direksi-1', isShariaEntity: false };
  assert.equal(evaluateGate({ stageNo: 14, passedStages: passed, evidence: konvensional }).passed, true);

  const syariahTanpaReview = { ...konvensional, isShariaEntity: true };
  assert.equal(evaluateGate({ stageNo: 14, passedStages: passed, evidence: syariahTanpaReview }).passed, false);

  const syariahLengkap = { ...konvensional, isShariaEntity: true, reviews: [...reviews, { kind: 'sharia', outcome: 'passed' }] };
  assert.equal(evaluateGate({ stageNo: 14, passedStages: passed, evidence: syariahLengkap }).passed, true);
});

test('gate submission menuntut bukti tanda terima OJK', () => {
  const passed = Array.from({ length: 14 }, (_, i) => i + 1);
  const good = {
    reportStatus: 'LOCKED', exportStructureMatchesTemplate: true,
    packageChecksum: sha256('paket'), ojkReceiptRef: 'OJK/2026/0001',
  };
  assert.equal(evaluateGate({ stageNo: 15, passedStages: passed, evidence: good }).passed, true);
  assert.equal(evaluateGate({ stageNo: 15, passedStages: passed, evidence: { ...good, ojkReceiptRef: '' } }).passed, false);
  assert.equal(evaluateGate({ stageNo: 15, passedStages: passed, evidence: { ...good, reportStatus: 'DRAFT' } }).passed, false);
  assert.equal(evaluateGate({ stageNo: 15, passedStages: passed, evidence: { ...good, packageChecksum: 'x' } }).passed, false);
});

test('status SUBMITTED tidak dapat ditetapkan tanpa tanda terima', () => {
  assert.equal(canMarkSubmitted({ status: 'EXPORTED', ojkReceiptRef: '', receiptAttachmentRef: '' }).allowed, false);
  assert.equal(canMarkSubmitted({ status: 'EXPORTED', ojkReceiptRef: 'OJK/1', receiptAttachmentRef: '' }).code, 'RECEIPT_REQUIRED');
  assert.equal(canMarkSubmitted({ status: 'LOCKED', ojkReceiptRef: 'OJK/1', receiptAttachmentRef: 'file-1' }).code, 'NOT_EXPORTED');
  assert.equal(canMarkSubmitted({ status: 'EXPORTED', ojkReceiptRef: 'OJK/1', receiptAttachmentRef: 'file-1' }).allowed, true);
});

test('enumerasi status submission lengkap sesuai Bagian 06.4', () => {
  assert.deepEqual(SUBMISSION_STATUS, ['DRAFT', 'LOCKED', 'EXPORTED', 'SUBMITTED', 'ACKNOWLEDGED', 'FEEDBACK', 'RESUBMITTED']);
});

test('siklus penuh 16 tahap dapat diselesaikan berurutan', () => {
  const passed = [];
  const evidence = {
    onboarding: { institutionVerified: true, sandboxUatSignedOff: true, ssoActive: true, mfaEnforced: true },
    cycle_opening: { cutOffDate: '2026-12-31', bookVersions: Array.from({ length: 7 }, (_, i) => `B${i + 1}`), mandatoryScenarios: ['a', 'b', 'c'], calendarApprovedBy: 'head' },
    governance_readiness: { discoveryReadinessComplete: true, policyApproved: true, riskAppetiteApproved: true, kriActive: true },
    data_ingest: { snapshotHashes: [sha256('s')], requiredSourcesMissing: 0 },
    data_quality: { reconciliationWithinTolerance: true, openMaterialExceptions: 0, financeSignOffBy: 'fin' },
    operational_emissions: { activitiesWithoutApproval: 0, evidenceMissing: 0 },
    financed_emissions: { coveragePercent: '82.5', dataQualityScoreReported: true, approvedBy: 'head' },
    scenario_lock: { datasetChecksumVerified: true, vintageLocked: true, scenarioStatus: 'APPROVED' },
    physical_mapping: { matchRatePercent: '94.1', unmappedLocationsReported: true, approvedBy: 'head' },
    crsa_run: { runIds: ['RUN-1'], allRunsReproducible: true, failedRuns: 0 },
    financial_aggregation: { doubleCountingTestPassed: true, componentsWithoutSource: 0 },
    independent_validation: { runsReproducedByValidator: true, openHighSeverityFindings: 0, validatorSubject: 'val' },
    book6_drafting: { mandatoryCellsUnfilled: 0, crossSectionValidationPassed: true, quantitativeCellsFromApprovedRuns: true },
    tiered_review: { reviews: ['technical', 'risk', 'finance', 'compliance'].map((k) => ({ kind: k, outcome: 'passed' })), boardApprovalBy: 'direksi', isShariaEntity: false },
    lock_export_submit: { reportStatus: 'LOCKED', exportStructureMatchesTemplate: true, packageChecksum: sha256('p'), ojkReceiptRef: 'OJK/1' },
    feedback_archive: { archivedUnderRetentionPolicy: true },
  };
  for (const stage of STAGES) {
    const r = evaluateGate({ stageNo: stage.no, passedStages: passed, evidence: evidence[stage.key] });
    assert.equal(r.passed, true, `tahap ${stage.no} (${stage.key}) gagal: ${r.detail}`);
    passed.push(stage.no);
  }
  assert.equal(passed.length, 16);
  assert.ok(cycleState(passed).every((s) => s.status === 'PASSED'));
});
