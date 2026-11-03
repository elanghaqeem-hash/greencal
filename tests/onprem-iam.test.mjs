import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLES, ROLE_NAMES, HIGH_RISK_ROLES, PLATFORM_ROLES, READ_ONLY_ROLES,
  LEGACY_ROLE_MAP, resolveRole,
} from '../src/onprem/iam/roles.js';
import {
  authorize, permittedActions, PERMISSION_MATRIX, RESOURCES, ACTIONS,
  RESOURCE_CLASSIFICATION, STATE_ACTIONS, CLASSIFICATION,
} from '../src/onprem/iam/policy-engine.js';
import { evaluateSoD, checkRoleAssignment, SOD_RULES, CONFLICTING_ROLE_PAIRS } from '../src/onprem/iam/sod.js';
import { onJoiner, onMover, onLeaver, evaluateInactivity, evaluateRecertification, LIFECYCLE_DEFAULTS } from '../src/onprem/iam/identity-lifecycle.js';
import { ROLES as LEGACY } from '../src/enterprise/policy.js';

const TENANT = 'bank-sawan';

/** Aktor baku yang memenuhi seluruh syarat konteks, agar test fokus satu variabel. */
const actor = (over = {}) => ({
  subject: 'subject-a', tenantId: TENANT, role: 'risk_analyst',
  orgUnitPath: '/bank/hq', mfaLevel: 'phishing_resistant',
  managedDevice: true, network: 'intranet', delegation: null, ...over,
});

const resource = (over = {}) => ({
  kind: 'crsa_run', tenantId: TENANT, orgUnitPath: '/bank/hq',
  status: 'draft', createdBy: 'subject-z', ...over,
});

// --- Register role --------------------------------------------------------

test('register memuat tepat 27 role', () => {
  assert.equal(ROLE_NAMES.length, 27, `jumlah role ${ROLE_NAMES.length}`);
});

test('seluruh 14 role lama terpetakan sehingga membership yang ada tidak putus', () => {
  for (const legacy of LEGACY) {
    const mapped = resolveRole(legacy);
    assert.ok(mapped, `role lama ${legacy} tidak terpetakan`);
    assert.ok(ROLES[mapped], `pemetaan ${legacy} menunjuk role yang tidak ada`);
  }
  assert.equal(Object.keys(LEGACY_ROLE_MAP).length, 14);
});

test('klasifikasi sensitivitas role konsisten', () => {
  assert.ok(HIGH_RISK_ROLES.includes('approver'));
  assert.ok(HIGH_RISK_ROLES.includes('institution_security_administrator'));
  assert.ok(PLATFORM_ROLES.includes('platform_super_administrator'));
  assert.ok(READ_ONLY_ROLES.includes('internal_auditor'));
  assert.ok(READ_ONLY_ROLES.includes('board_viewer'));
  for (const r of ROLE_NAMES) {
    assert.ok(ROLES[r].label, `role ${r} tanpa label`);
    assert.ok(ROLES[r].group, `role ${r} tanpa group`);
  }
});

// --- Policy engine: default deny -----------------------------------------

test('default deny: role tanpa entri matriks ditolak', () => {
  const d = authorize({ actor: actor({ role: 'board_viewer' }), resource: resource({ kind: 'emission_activity' }), action: 'view' });
  assert.equal(d.allowed, false);
  assert.equal(d.code, 'RBAC_DENIED');
});

test('aksi dan resource yang tidak dikenal ditolak', () => {
  assert.equal(authorize({ actor: actor(), resource: resource(), action: 'hapus' }).code, 'UNKNOWN_ACTION');
  assert.equal(authorize({ actor: actor(), resource: resource({ kind: 'apa_saja' }), action: 'view' }).code, 'UNKNOWN_RESOURCE');
  assert.equal(authorize({ actor: actor({ role: 'tukang_sihir' }), resource: resource(), action: 'view' }).code, 'UNKNOWN_ROLE');
});

test('permintaan cacat ditolak, bukan diperbaiki', () => {
  assert.equal(authorize({ actor: null, resource: resource(), action: 'view' }).code, 'MALFORMED_REQUEST');
  assert.equal(authorize({ actor: actor(), resource: null, action: 'view' }).code, 'MALFORMED_REQUEST');
});

test('isolasi tenant: akses lintas tenant ditolak', () => {
  const d = authorize({ actor: actor(), resource: resource({ tenantId: 'bank-lain' }), action: 'view' });
  assert.equal(d.allowed, false);
  assert.equal(d.code, 'CROSS_TENANT');
});

test('tenant_id yang hilang ditolak, tidak diasumsikan', () => {
  assert.equal(authorize({ actor: actor({ tenantId: null }), resource: resource(), action: 'view' }).code, 'TENANT_MISSING');
  assert.equal(authorize({ actor: actor(), resource: resource({ tenantId: null }), action: 'view' }).code, 'TENANT_MISSING');
});

test('role platform tidak memiliki akses data bisnis tenant', () => {
  const d = authorize({
    actor: actor({ role: 'platform_super_administrator' }),
    resource: resource({ kind: 'book6_report', status: 'locked' }), action: 'view',
  });
  assert.equal(d.allowed, false);
  assert.equal(d.code, 'PLATFORM_ROLE_NO_BUSINESS_DATA');
});

test('role read-only tidak dapat melakukan mutasi', () => {
  const d = authorize({
    actor: actor({ role: 'internal_auditor' }),
    resource: resource({ kind: 'emission_activity' }), action: 'create',
  });
  assert.equal(d.allowed, false);
  assert.equal(d.code, 'READ_ONLY_ROLE');
});

test('Branch Maker hanya dapat menyentuh unit organisasinya sendiri', () => {
  const base = { actor: actor({ role: 'branch_maker', subject: 'maker-1', orgUnitPath: '/bank/cabang/bandung' }), action: 'create' };
  const own = authorize({ ...base, resource: resource({ kind: 'emission_activity', orgUnitPath: '/bank/cabang/bandung/unit-1' }) });
  assert.equal(own.allowed, true);
  const other = authorize({ ...base, resource: resource({ kind: 'emission_activity', orgUnitPath: '/bank/cabang/surabaya' }) });
  assert.equal(other.allowed, false);
  assert.equal(other.code, 'ORG_SCOPE_DENIED');
});

test('workflow state membatasi aksi yang sah', () => {
  const d = authorize({
    actor: actor({ role: 'climate_risk_head', subject: 'head-1' }),
    resource: resource({ status: 'draft', createdBy: 'other' }), action: 'approve',
  });
  assert.equal(d.allowed, false);
  assert.equal(d.code, 'STATE_DENIED');

  const ok = authorize({
    actor: actor({ role: 'climate_risk_head', subject: 'head-1' }),
    resource: resource({ status: 'checked', createdBy: 'other', checkedBy: 'checker-1', executedBy: 'other' }), action: 'approve',
  });
  assert.equal(ok.allowed, true, ok.message);
});

test('status record yang tidak dikenal ditolak', () => {
  assert.equal(authorize({ actor: actor(), resource: resource({ status: 'entahlah' }), action: 'view' }).code, 'UNKNOWN_STATE');
});

// --- Context: MFA, perangkat, jaringan, klasifikasi ----------------------

test('data RESTRICTED menuntut MFA step-up', () => {
  const d = authorize({
    actor: actor({ role: 'credit_risk_officer', mfaLevel: 'standard' }),
    resource: resource({ kind: 'counterparty' }), action: 'view',
  });
  assert.equal(d.allowed, false);
  assert.equal(d.code, 'MFA_STEP_UP_REQUIRED');
});

test('data RESTRICTED menuntut perangkat terkelola dan jaringan intranet atau VPN', () => {
  const unmanaged = authorize({
    actor: actor({ role: 'credit_risk_officer', managedDevice: false }),
    resource: resource({ kind: 'counterparty' }), action: 'view',
  });
  assert.equal(unmanaged.code, 'UNMANAGED_DEVICE');

  const internet = authorize({
    actor: actor({ role: 'credit_risk_officer', network: 'internet' }),
    resource: resource({ kind: 'counterparty' }), action: 'view',
  });
  assert.equal(internet.code, 'NETWORK_DENIED');

  const vpn = authorize({
    actor: actor({ role: 'credit_risk_officer', network: 'vpn' }),
    resource: resource({ kind: 'counterparty' }), action: 'view',
  });
  assert.equal(vpn.allowed, true, vpn.message);
  assert.equal(vpn.obligations.maskByDefault, true, 'data RESTRICTED wajib masking default');
});

test('persetujuan oleh role berisiko tinggi menuntut MFA phishing-resistant', () => {
  const d = authorize({
    actor: actor({ role: 'risk_management_head', subject: 'rmh-1', mfaLevel: 'step_up' }),
    resource: resource({ kind: 'governance', status: 'checked', createdBy: 'x', checkedBy: 'y' }),
    action: 'approve',
  });
  assert.equal(d.allowed, false);
  assert.equal(d.code, 'PHISHING_RESISTANT_MFA_REQUIRED');
});

test('setiap resource memiliki klasifikasi dan setiap status memiliki daftar aksi', () => {
  for (const r of RESOURCES) assert.ok(RESOURCE_CLASSIFICATION[r], `resource ${r} tanpa klasifikasi`);
  for (const [status, acts] of Object.entries(STATE_ACTIONS)) {
    assert.ok(acts.length > 0, `status ${status} tanpa aksi`);
    for (const a of acts) assert.ok(ACTIONS.includes(a), `aksi ${a} pada status ${status} tidak dikenal`);
  }
  assert.equal(RESOURCE_CLASSIFICATION.counterparty, CLASSIFICATION.RESTRICTED);
});

test('matriks permission hanya memuat role dan aksi yang dikenal', () => {
  for (const [kind, roles] of Object.entries(PERMISSION_MATRIX)) {
    assert.ok(RESOURCES.includes(kind), `resource ${kind} di matriks tidak terdaftar`);
    for (const [role, acts] of Object.entries(roles)) {
      assert.ok(ROLES[role], `role ${role} pada matriks ${kind} tidak dikenal`);
      for (const a of acts) assert.ok(ACTIONS.includes(a), `aksi ${a} pada ${kind}.${role} tidak dikenal`);
    }
  }
});

test('permittedActions hanya mengembalikan aksi yang benar-benar lolos', () => {
  const acts = permittedActions({
    actor: actor({ role: 'internal_auditor' }),
    resource: resource({ kind: 'audit_event', status: 'approved' }),
  });
  assert.deepEqual([...acts].sort(), ['export', 'view']);
});

// --- SoD: 15 aturan, masing-masing positif dan negatif -------------------

test('definisi SoD memuat 15 aturan', () => {
  assert.equal(SOD_RULES.length, 15);
  assert.deepEqual(SOD_RULES.map((r) => r.rule), Array.from({ length: 15 }, (_, i) => i + 1));
});

test('SoD 1 negatif: pembuat tidak dapat memeriksa atau menyetujui record sendiri', () => {
  const a = actor({ subject: 'u1', role: 'checker' });
  const r1 = evaluateSoD({ actor: a, resource: resource({ createdBy: 'u1', status: 'submitted' }), action: 'check' });
  assert.equal(r1.allowed, false);
  assert.equal(r1.rule, 1);

  const r2 = evaluateSoD({ actor: actor({ subject: 'u1', role: 'approver' }), resource: resource({ createdBy: 'u1' }), action: 'approve' });
  assert.equal(r2.rule, 1);

  const r3 = evaluateSoD({ actor: actor({ subject: 'u2', role: 'approver' }), resource: resource({ createdBy: 'u1', checkedBy: 'u2' }), action: 'approve' });
  assert.equal(r3.rule, 1);
  assert.equal(r3.code, 'SOD_CHECKER_IS_APPROVER');
});

test('SoD 1 positif: tiga orang berbeda lolos', () => {
  const r = evaluateSoD({
    actor: actor({ subject: 'u3', role: 'approver' }),
    resource: resource({ createdBy: 'u1', checkedBy: 'u2' }), action: 'approve',
  });
  assert.equal(r.allowed, true);
});

test('SoD 2: pembuat atau pengubah faktor tidak dapat menyetujuinya', () => {
  const neg = evaluateSoD({
    actor: actor({ subject: 'u1', role: 'risk_management_head' }),
    resource: { kind: 'emission_factor', createdBy: 'u9', modifiedBy: ['u1'], tenantId: TENANT },
    action: 'approve',
  });
  assert.equal(neg.rule, 2);
  const pos = evaluateSoD({
    actor: actor({ subject: 'u2', role: 'risk_management_head' }),
    resource: { kind: 'emission_factor', createdBy: 'u9', modifiedBy: ['u1'], tenantId: TENANT },
    action: 'approve',
  });
  assert.equal(pos.allowed, true);
});

test('SoD 3: pengembang model bukan validator versi yang sama', () => {
  const neg = evaluateSoD({
    actor: actor({ subject: 'dev-1', role: 'model_validator' }),
    resource: { kind: 'model_validation', modelDevelopedBy: 'dev-1', tenantId: TENANT }, action: 'create',
  });
  assert.equal(neg.rule, 3);
  const pos = evaluateSoD({
    actor: actor({ subject: 'val-1', role: 'model_validator' }),
    resource: { kind: 'model_validation', modelDevelopedBy: 'dev-1', tenantId: TENANT }, action: 'create',
  });
  assert.equal(pos.allowed, true);
});

test('SoD 4: peminta role tidak dapat menyetujui permintaannya sendiri', () => {
  const neg = evaluateSoD({
    actor: actor({ subject: 'u1', role: 'institution_security_administrator' }),
    resource: { kind: 'tenant_user_role', requestedFor: 'u1', tenantId: TENANT }, action: 'approve',
  });
  assert.equal(neg.rule, 4);
  const pos = evaluateSoD({
    actor: actor({ subject: 'sec-1', role: 'institution_security_administrator' }),
    resource: { kind: 'tenant_user_role', requestedFor: 'u1', tenantId: TENANT }, action: 'approve',
  });
  assert.equal(pos.allowed, true);
});

test('SoD 5: Institution Administrator tidak dapat menaikkan hak dirinya', () => {
  const neg = evaluateSoD({
    actor: actor({ subject: 'adm-1', role: 'institution_administrator' }),
    resource: { kind: 'tenant_user_role', requestedFor: 'adm-1', requestedRole: 'approver', tenantId: TENANT },
    action: 'approve',
  });
  assert.ok([4, 5].includes(neg.rule), `aturan ${neg.rule}`);
  assert.equal(neg.allowed, false);
});

test('SoD 6: auditor tidak boleh create, submit, atau approve', () => {
  for (const action of ['create', 'submit', 'approve']) {
    const r = evaluateSoD({
      actor: actor({ subject: 'aud-1', role: 'internal_auditor' }),
      resource: resource({ createdBy: 'other' }), action,
    });
    assert.equal(r.rule, 6, `aksi ${action} seharusnya ditolak aturan 6`);
  }
  const view = evaluateSoD({
    actor: actor({ subject: 'aud-1', role: 'internal_auditor' }),
    resource: resource({ createdBy: 'other' }), action: 'view',
  });
  assert.equal(view.allowed, true);
});

test('SoD 7: penjalan run tidak dapat menyetujui run yang sama', () => {
  const neg = evaluateSoD({
    actor: actor({ subject: 'q-1', role: 'climate_risk_head' }),
    resource: resource({ kind: 'crsa_run', createdBy: 'other', executedBy: 'q-1' }), action: 'approve',
  });
  assert.equal(neg.rule, 7);
  const pos = evaluateSoD({
    actor: actor({ subject: 'head-1', role: 'climate_risk_head' }),
    resource: resource({ kind: 'crsa_run', createdBy: 'other', executedBy: 'q-1' }), action: 'approve',
  });
  assert.equal(pos.allowed, true);
});

test('SoD 8: sign-off rekonsiliasi keuangan hanya oleh Finance', () => {
  const neg = evaluateSoD({
    actor: actor({ subject: 'u1', role: 'compliance_reviewer' }),
    resource: resource({ kind: 'portfolio', createdBy: 'other' }), action: 'check',
    context: { signOffKind: 'financial_reconciliation' },
  });
  assert.equal(neg.rule, 8);
  const pos = evaluateSoD({
    actor: actor({ subject: 'fin-1', role: 'finance_reviewer' }),
    resource: resource({ kind: 'portfolio', createdBy: 'other' }), action: 'check',
    context: { signOffKind: 'financial_reconciliation' },
  });
  assert.equal(pos.allowed, true);
});

test('SoD 9: sign-off kepatuhan laporan hanya oleh Compliance', () => {
  const neg = evaluateSoD({
    actor: actor({ subject: 'fin-1', role: 'finance_reviewer' }),
    resource: resource({ kind: 'book6_report', createdBy: 'other' }), action: 'check',
    context: { signOffKind: 'report_compliance' },
  });
  assert.equal(neg.rule, 9);
  const pos = evaluateSoD({
    actor: actor({ subject: 'comp-1', role: 'compliance_reviewer' }),
    resource: resource({ kind: 'book6_report', createdBy: 'other' }), action: 'check',
    context: { signOffKind: 'report_compliance' },
  });
  assert.equal(pos.allowed, true);
});

test('SoD 10: alur BUS/UUS wajib melewati Sharia Governance Reviewer', () => {
  const neg = evaluateSoD({
    actor: actor({ subject: 'app-1', role: 'approver' }),
    resource: { kind: 'book6_report', createdBy: 'other', checkedBy: 'c1', shariaCheckedBy: null, tenantId: TENANT },
    action: 'approve', context: { sharia: true },
  });
  assert.equal(neg.rule, 10);
  const pos = evaluateSoD({
    actor: actor({ subject: 'app-1', role: 'approver' }),
    resource: { kind: 'book6_report', createdBy: 'other', checkedBy: 'c1', shariaCheckedBy: 'sharia-1', tenantId: TENANT },
    action: 'approve', context: { sharia: true },
  });
  assert.equal(pos.allowed, true);
});

test('SoD 11: delegasi tidak dapat memindahkan wewenang yang melanggar aturan lain', () => {
  // Penerima delegasi adalah pembuat record, sehingga tetap tidak boleh approve.
  const neg = evaluateSoD({
    actor: actor({
      subject: 'u1', role: 'approver',
      delegation: { fromSubject: 'head-1', delegatedRole: 'approver', validUntil: '2026-12-31T00:00:00.000Z', grantedAt: '2026-11-01T00:00:00.000Z' },
    }),
    resource: resource({ createdBy: 'u1' }), action: 'approve',
    context: { now: '2026-11-02T00:00:00.000Z' },
  });
  assert.equal(neg.allowed, false);
  assert.ok([1, 11].includes(neg.rule), `aturan ${neg.rule}`);

  const pos = evaluateSoD({
    actor: actor({
      subject: 'u2', role: 'approver',
      delegation: { fromSubject: 'head-1', delegatedRole: 'approver', validUntil: '2026-11-20T00:00:00.000Z', grantedAt: '2026-11-01T00:00:00.000Z' },
    }),
    resource: resource({ createdBy: 'u1', checkedBy: 'u3' }), action: 'approve',
    context: { now: '2026-11-02T00:00:00.000Z' },
  });
  assert.equal(pos.allowed, true, pos.message);
});

test('SoD 12: delegasi wajib berbatas waktu, kedaluwarsa otomatis, dan tunduk batas kebijakan', () => {
  const noExpiry = evaluateSoD({
    actor: actor({ delegation: { fromSubject: 'x' } }),
    resource: resource(), action: 'view', context: { now: '2026-11-02T00:00:00.000Z' },
  });
  assert.equal(noExpiry.rule, 12);
  assert.equal(noExpiry.code, 'SOD_DELEGATION_NO_EXPIRY');

  const expired = evaluateSoD({
    actor: actor({ delegation: { fromSubject: 'x', validUntil: '2026-10-01T00:00:00.000Z' } }),
    resource: resource(), action: 'view', context: { now: '2026-11-02T00:00:00.000Z' },
  });
  assert.equal(expired.code, 'SOD_DELEGATION_EXPIRED');

  const tooLong = evaluateSoD({
    actor: actor({ delegation: { fromSubject: 'x', grantedAt: '2026-01-01T00:00:00.000Z', validUntil: '2026-12-31T00:00:00.000Z', maxDays: 30 } }),
    resource: resource(), action: 'view', context: { now: '2026-02-01T00:00:00.000Z' },
  });
  assert.equal(tooLong.code, 'SOD_DELEGATION_TOO_LONG');

  const valid = evaluateSoD({
    actor: actor({ delegation: { fromSubject: 'x', grantedAt: '2026-11-01T00:00:00.000Z', validUntil: '2026-11-20T00:00:00.000Z', maxDays: 30 } }),
    resource: resource(), action: 'view', context: { now: '2026-11-02T00:00:00.000Z' },
  });
  assert.equal(valid.allowed, true);
});

test('SoD 13: override model wajib alasan, lampiran, dan persetujuan satu level di atas', () => {
  const base = { actor: actor({ subject: 'u1', role: 'risk_analyst' }), resource: resource({ createdBy: 'u1' }), action: 'create' };
  const noReason = evaluateSoD({ ...base, context: { isOverride: true, override: {} } });
  assert.equal(noReason.code, 'SOD_OVERRIDE_NO_REASON');

  const noAttachment = evaluateSoD({ ...base, context: { isOverride: true, override: { reason: 'kalibrasi ulang sektor energi' } } });
  assert.equal(noAttachment.code, 'SOD_OVERRIDE_NO_ATTACHMENT');

  const wrongLevel = evaluateSoD({
    ...base,
    context: { isOverride: true, override: { reason: 'kalibrasi ulang sektor energi', attachmentRef: 'doc-1', createdByRole: 'risk_analyst', approvedByRole: 'checker', createdBy: 'u1', approvedBy: 'u2' } },
  });
  assert.equal(wrongLevel.code, 'SOD_OVERRIDE_WRONG_LEVEL');

  const selfApproved = evaluateSoD({
    ...base,
    context: { isOverride: true, override: { reason: 'kalibrasi ulang sektor energi', attachmentRef: 'doc-1', createdByRole: 'risk_analyst', approvedByRole: 'risk_management_head', createdBy: 'u1', approvedBy: 'u1' } },
  });
  assert.equal(selfApproved.code, 'SOD_OVERRIDE_SELF_APPROVAL');

  const valid = evaluateSoD({
    ...base,
    context: { isOverride: true, override: { reason: 'kalibrasi ulang sektor energi', attachmentRef: 'doc-1', createdByRole: 'risk_analyst', approvedByRole: 'risk_management_head', createdBy: 'u1', approvedBy: 'head-1' } },
  });
  assert.equal(valid.allowed, true);
});

test('SoD 14: unlock wajib dual approval dua orang berbeda dan versi baru', () => {
  const base = {
    actor: actor({ subject: 'comp-1', role: 'compliance_reviewer' }),
    resource: resource({ kind: 'book6_report', status: 'locked', createdBy: 'other' }),
    action: 'unlock',
  };
  const single = evaluateSoD({ ...base, context: { unlockApprovals: [{ subject: 'comp-1', role: 'compliance_reviewer' }], createsNewVersion: true } });
  assert.equal(single.code, 'SOD_UNLOCK_DUAL_APPROVAL_REQUIRED');

  const samePerson = evaluateSoD({
    ...base,
    context: {
      unlockApprovals: [
        { subject: 'x', role: 'compliance_reviewer' },
        { subject: 'x', role: 'climate_risk_head' },
      ],
      createsNewVersion: true,
    },
  });
  assert.equal(samePerson.code, 'SOD_UNLOCK_SAME_PERSON');

  const noVersion = evaluateSoD({
    ...base,
    context: {
      unlockApprovals: [
        { subject: 'comp-1', role: 'compliance_reviewer' },
        { subject: 'head-1', role: 'climate_risk_head' },
      ],
      createsNewVersion: false,
    },
  });
  assert.equal(noVersion.code, 'SOD_UNLOCK_NO_NEW_VERSION');

  const valid = evaluateSoD({
    ...base,
    context: {
      unlockApprovals: [
        { subject: 'comp-1', role: 'compliance_reviewer' },
        { subject: 'head-1', role: 'climate_risk_head' },
      ],
      createsNewVersion: true,
    },
  });
  assert.equal(valid.allowed, true, valid.message);
});

test('SoD 15: kombinasi role bertentangan ditolak saat assignment', () => {
  const approval = { subject: 'sec-1', role: 'institution_security_administrator' };
  for (const [a, b] of CONFLICTING_ROLE_PAIRS) {
    const v = checkRoleAssignment({ existingRoles: [a], newRole: b, requestedFor: 'u1', requestedBy: 'adm-1', approval });
    assert.equal(v.allowed, false, `pasangan ${a} dan ${b} seharusnya ditolak`);
    assert.equal(v.rule, 15);
  }
  const ok = checkRoleAssignment({ existingRoles: ['data_steward'], newRole: 'ghg_pcaf_analyst', requestedFor: 'u1', requestedBy: 'adm-1' });
  assert.equal(ok.allowed, true);
});

test('role berisiko tinggi wajib dual control oleh Institution Security Administrator', () => {
  const none = checkRoleAssignment({ existingRoles: [], newRole: 'approver', requestedFor: 'u1', requestedBy: 'adm-1' });
  assert.equal(none.code, 'SOD_HIGH_RISK_NEEDS_APPROVAL');

  const wrong = checkRoleAssignment({
    existingRoles: [], newRole: 'approver', requestedFor: 'u1', requestedBy: 'adm-1',
    approval: { subject: 'adm-2', role: 'institution_administrator' },
  });
  assert.equal(wrong.code, 'SOD_HIGH_RISK_WRONG_APPROVER');

  const selfApprove = checkRoleAssignment({
    existingRoles: [], newRole: 'approver', requestedFor: 'u1', requestedBy: 'adm-1',
    approval: { subject: 'u1', role: 'institution_security_administrator' },
  });
  assert.equal(selfApprove.rule, 4);

  const valid = checkRoleAssignment({
    existingRoles: [], newRole: 'approver', requestedFor: 'u1', requestedBy: 'adm-1',
    approval: { subject: 'sec-1', role: 'institution_security_administrator' },
  });
  assert.equal(valid.allowed, true);
});

test('setiap aturan SoD punya setidaknya satu jalur penolakan yang terbukti', () => {
  // Dikumpulkan dari test di atas: aturan 1 sampai 15 semuanya pernah memicu penolakan.
  const proven = new Set();
  const probes = [
    () => evaluateSoD({ actor: actor({ subject: 'u1', role: 'checker' }), resource: resource({ createdBy: 'u1', status: 'submitted' }), action: 'check' }),
    () => evaluateSoD({ actor: actor({ subject: 'u1', role: 'risk_management_head' }), resource: { kind: 'emission_factor', createdBy: 'maker-9', modifiedBy: ['u1'], tenantId: TENANT }, action: 'approve' }),
    () => evaluateSoD({ actor: actor({ subject: 'd1', role: 'model_validator' }), resource: { kind: 'model_validation', modelDevelopedBy: 'd1', tenantId: TENANT }, action: 'create' }),
    () => evaluateSoD({ actor: actor({ subject: 'u1', role: 'institution_security_administrator' }), resource: { kind: 'tenant_user_role', requestedFor: 'u1', tenantId: TENANT }, action: 'approve' }),
    () => evaluateSoD({ actor: actor({ subject: 'a1', role: 'institution_administrator' }), resource: { kind: 'tenant_user_role', requestedFor: 'a1', requestedRole: 'approver', tenantId: TENANT }, action: 'submit' }),
    () => evaluateSoD({ actor: actor({ subject: 'aud', role: 'internal_auditor' }), resource: resource({ createdBy: 'o' }), action: 'create' }),
    () => evaluateSoD({ actor: actor({ subject: 'q1', role: 'climate_risk_head' }), resource: resource({ kind: 'crsa_run', createdBy: 'o', executedBy: 'q1' }), action: 'approve' }),
    () => evaluateSoD({ actor: actor({ subject: 'u1', role: 'compliance_reviewer' }), resource: resource({ createdBy: 'o' }), action: 'check', context: { signOffKind: 'financial_reconciliation' } }),
    () => evaluateSoD({ actor: actor({ subject: 'u1', role: 'finance_reviewer' }), resource: resource({ createdBy: 'o' }), action: 'check', context: { signOffKind: 'report_compliance' } }),
    () => evaluateSoD({ actor: actor({ subject: 'u1', role: 'approver' }), resource: { kind: 'book6_report', createdBy: 'o', tenantId: TENANT, shariaCheckedBy: null }, action: 'approve', context: { sharia: true } }),
    // Aturan 11: aktor sendiri lolos aturan 8 sebagai Finance Reviewer, tetapi
    // role yang didelegasikan kepadanya tidak boleh melakukan sign-off keuangan.
    () => evaluateSoD({
      actor: actor({ subject: 'fin-1', role: 'finance_reviewer', delegation: { fromSubject: 'comp-1', delegatedRole: 'compliance_reviewer', validUntil: '2026-11-20T00:00:00.000Z', grantedAt: '2026-11-01T00:00:00.000Z' } }),
      resource: resource({ kind: 'portfolio', createdBy: 'other' }), action: 'check',
      context: { now: '2026-11-02T00:00:00.000Z', signOffKind: 'financial_reconciliation' },
    }),
    () => evaluateSoD({ actor: actor({ delegation: { fromSubject: 'x' } }), resource: resource(), action: 'view', context: { now: '2026-11-02T00:00:00.000Z' } }),
    () => evaluateSoD({ actor: actor({ subject: 'u1' }), resource: resource(), action: 'create', context: { isOverride: true, override: {} } }),
    () => evaluateSoD({ actor: actor({ subject: 'c1', role: 'compliance_reviewer' }), resource: resource({ kind: 'book6_report', status: 'locked', createdBy: 'o' }), action: 'unlock', context: { unlockApprovals: [], createsNewVersion: true } }),
    () => checkRoleAssignment({ existingRoles: ['checker'], newRole: 'approver', requestedFor: 'u1', requestedBy: 'a1', approval: { subject: 's1', role: 'institution_security_administrator' } }),
  ];
  for (const probe of probes) {
    const v = probe();
    assert.equal(v.allowed, false, `probe menghasilkan izin: ${JSON.stringify(v)}`);
    proven.add(v.rule);
  }
  for (let rule = 1; rule <= 15; rule += 1) {
    assert.ok(proven.has(rule),
      `aturan ${rule} belum terbukti memicu penolakan; terbukti: ${[...proven].sort((a, b) => a - b).join(',')}`);
  }
  assert.equal(proven.size, 15, 'seluruh 15 aturan SoD wajib terbukti memicu penolakan');
});

// --- Siklus hidup identitas ----------------------------------------------

test('joiner menolak role berisiko tinggi tanpa dual control', () => {
  const p = onJoiner({
    subject: 'new-1', tenantId: TENANT, orgUnitPath: '/bank/hq',
    requestedRoles: ['risk_analyst', 'approver'], requestedBy: 'adm-1',
  });
  const granted = p.actions.filter((a) => a.type === 'GRANT_ROLE').map((a) => a.role);
  assert.deepEqual(granted, ['risk_analyst']);
  assert.ok(p.notes.some((n) => n.includes('approver')));
});

test('joiner memberi role berisiko tinggi bila disetujui Security Administrator', () => {
  const p = onJoiner({
    subject: 'new-2', tenantId: TENANT, orgUnitPath: '/bank/hq',
    requestedRoles: ['approver'], requestedBy: 'adm-1',
    approvals: { approver: { subject: 'sec-1', role: 'institution_security_administrator' } },
  });
  assert.ok(p.actions.some((a) => a.type === 'GRANT_ROLE' && a.role === 'approver'));
  assert.ok(p.actions.some((a) => a.type === 'ENROL_MFA' && a.level === 'phishing_resistant'));
});

test('joiner menolak role yang akan menimbulkan konflik SoD', () => {
  const p = onJoiner({
    subject: 'new-3', tenantId: TENANT, orgUnitPath: '/bank/hq',
    requestedRoles: ['risk_analyst', 'model_validator'], requestedBy: 'adm-1',
    approvals: { model_validator: { subject: 'sec-1', role: 'institution_security_administrator' } },
  });
  const granted = p.actions.filter((a) => a.type === 'GRANT_ROLE').map((a) => a.role);
  assert.deepEqual(granted, ['risk_analyst']);
  assert.ok(p.notes.some((n) => n.includes('model_validator')));
});

test('mover mencabut role lama lebih dulu dan mencabut sesi saat lingkup berubah', () => {
  const p = onMover({
    subject: 'u1', tenantId: TENANT,
    fromOrgUnitPath: '/bank/cabang/bandung', toOrgUnitPath: '/bank/hq',
    currentRoles: ['branch_maker'], targetRoles: ['data_steward'], requestedBy: 'adm-1',
  });
  const order = p.actions.map((a) => a.type);
  assert.ok(order.indexOf('REVOKE_ROLE') < order.indexOf('GRANT_ROLE'), 'pencabutan harus mendahului pemberian');
  assert.ok(p.actions.some((a) => a.type === 'REVOKE_ACTIVE_SESSIONS' && a.reason === 'org_scope_change'));
  assert.ok(p.actions.some((a) => a.type === 'UPDATE_ORG_SCOPE' && a.orgUnitPath === '/bank/hq'));
});

test('leaver mencabut seluruh role, membatalkan delegasi, dan menghentikan sesi dalam 15 menit', () => {
  const p = onLeaver({
    subject: 'u1', tenantId: TENANT,
    currentRoles: ['risk_analyst', 'checker'],
    outgoingDelegations: [{ id: 'del-1' }],
  });
  assert.equal(p.actions.filter((a) => a.type === 'REVOKE_ROLE').length, 2);
  assert.ok(p.actions.some((a) => a.type === 'CANCEL_DELEGATION' && a.delegationId === 'del-1'));
  const revoke = p.actions.find((a) => a.type === 'REVOKE_ACTIVE_SESSIONS');
  assert.equal(revoke.withinMinutes, LIFECYCLE_DEFAULTS.leaverSessionRevocationMinutes);
  assert.equal(revoke.withinMinutes, 15);
  assert.ok(p.actions.some((a) => a.type === 'DISABLE_ACCOUNT'));
});

test('akun tidak aktif melewati 90 hari disuspend', () => {
  assert.deepEqual(evaluateInactivity({ subject: 'u1', tenantId: TENANT, inactiveDays: 89 }).actions, []);
  const p = evaluateInactivity({ subject: 'u1', tenantId: TENANT, inactiveDays: 90 });
  assert.equal(p.actions[0].type, 'SUSPEND_ACCOUNT');
});

test('recertification mencabut role yang tidak dikonfirmasi kedua pihak', () => {
  const p = evaluateRecertification({
    subject: 'u1', tenantId: TENANT,
    entries: [
      { role: 'risk_analyst', managerDecision: 'confirm', dataOwnerDecision: 'confirm' },
      { role: 'checker', managerDecision: 'confirm', dataOwnerDecision: 'revoke' },
      { role: 'data_steward', managerDecision: 'revoke', dataOwnerDecision: 'revoke' },
    ],
  });
  const revoked = p.actions.filter((a) => a.type === 'REVOKE_ROLE').map((a) => a.role);
  assert.deepEqual(revoked.sort(), ['checker', 'data_steward']);
  const retained = p.actions.filter((a) => a.type === 'RECORD_RECERTIFICATION_EVIDENCE' && a.outcome === 'retained');
  assert.equal(retained.length, 1);
  assert.ok(p.actions.some((a) => a.type === 'SCHEDULE_RECERTIFICATION' && a.inDays === 90));
});
