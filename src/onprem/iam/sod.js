// Lima belas aturan Separation of Duties, Bagian 03.3.
//
// Setiap aturan diimplementasikan sebagai policy berkode, diuji dengan test
// positif dan negatif, dan pelanggarannya dicatat sebagai audit event.
//
// Aturan 1 sampai 14 dievaluasi saat transaksi. Aturan 15 dievaluasi saat
// pemberian role, karena kombinasi role yang bertentangan harus ditolak pada
// saat assignment, bukan hanya saat transaksi.

import { ROLES, READ_ONLY_ROLES, resolveRole } from './roles.js';

const FINANCE_SIGNOFF_ROLES = Object.freeze(['finance_reviewer']);
const COMPLIANCE_SIGNOFF_ROLES = Object.freeze(['compliance_reviewer']);
const MUTATING_ACTIONS = Object.freeze(new Set(['create', 'submit', 'approve']));

/** Hierarki untuk aturan 13: override wajib disetujui satu level di atas. */
const ESCALATION = Object.freeze({
  branch_maker: 'climate_risk_head',
  data_maker: 'climate_risk_head',
  ghg_pcaf_analyst: 'climate_risk_head',
  risk_analyst: 'risk_management_head',
  climate_model_analyst: 'risk_management_head',
  credit_risk_officer: 'risk_management_head',
  market_treasury_officer: 'risk_management_head',
  operational_risk_officer: 'risk_management_head',
  climate_risk_head: 'risk_management_head',
  checker: 'approver',
});

/** Pasangan role yang tidak boleh dipegang orang yang sama (aturan 15). */
export const CONFLICTING_ROLE_PAIRS = Object.freeze([
  ['checker', 'approver'],
  ['data_maker', 'approver'],
  ['branch_maker', 'checker'],
  ['branch_maker', 'approver'],
  ['ghg_pcaf_analyst', 'approver'],
  ['risk_analyst', 'model_validator'],
  ['climate_model_analyst', 'model_validator'],
  ['institution_administrator', 'approver'],
  ['institution_administrator', 'institution_security_administrator'],
  ['internal_auditor', 'approver'],
  ['internal_auditor', 'checker'],
  ['internal_auditor', 'data_maker'],
  ['internal_auditor', 'risk_analyst'],
  ['external_auditor', 'approver'],
  ['model_validator', 'approver'],
  ['finance_reviewer', 'compliance_reviewer'],
  ['platform_super_administrator', 'institution_administrator'],
  ['platform_operations', 'approver'],
]);

const violation = (rule, code, message) => Object.freeze({ allowed: false, rule, code, message });
const ok = Object.freeze({ allowed: true, rule: null, code: 'SOD_OK', message: '' });

/**
 * Evaluasi aturan 1 sampai 14 untuk satu transaksi.
 * Mengembalikan pelanggaran PERTAMA yang ditemukan agar pesan tetap spesifik.
 */
export function evaluateSoD({ actor, resource, action, context = {} }) {
  const role = resolveRole(actor.role);
  const subject = actor.subject;
  if (!subject) return violation(0, 'SUBJECT_MISSING', 'Identitas aktor wajib ada untuk evaluasi SoD.');

  // Aturan 1: Maker, Checker, dan Approver harus orang yang berbeda pada
  // record yang sama. Diperiksa terhadap subject, bukan role.
  if (action === 'check' && resource.createdBy === subject) {
    return violation(1, 'SOD_MAKER_IS_CHECKER', 'Pembuat record tidak dapat memeriksa record yang sama.');
  }
  if (action === 'approve') {
    if (resource.createdBy === subject) {
      return violation(1, 'SOD_MAKER_IS_APPROVER', 'Pembuat record tidak dapat menyetujui record yang sama.');
    }
    if (resource.checkedBy === subject) {
      return violation(1, 'SOD_CHECKER_IS_APPROVER', 'Pemeriksa record tidak dapat menyetujui record yang sama.');
    }
  }

  // Aturan 2: pembuat atau pengubah faktor emisi dan parameter regulatori
  // tidak dapat menaikkan statusnya menjadi APPROVED.
  if (action === 'approve'
      && (resource.kind === 'emission_factor' || resource.kind === 'regulatory_parameter')
      && (resource.createdBy === subject || (resource.modifiedBy || []).includes(subject))) {
    return violation(2, 'SOD_FACTOR_SELF_APPROVAL',
      'Pembuat atau pengubah faktor dan parameter tidak dapat menyetujuinya.');
  }

  // Aturan 3: pengembang model bukan validator model untuk versi yang sama.
  if (resource.kind === 'model_validation' && resource.modelDevelopedBy === subject) {
    return violation(3, 'SOD_DEVELOPER_IS_VALIDATOR',
      'Pengembang model tidak dapat memvalidasi versi model yang sama.');
  }

  // Aturan 4: peminta role tidak dapat menyetujui permintaannya sendiri.
  if (resource.kind === 'tenant_user_role' && action === 'approve' && resource.requestedFor === subject) {
    return violation(4, 'SOD_SELF_ROLE_APPROVAL', 'Peminta role tidak dapat menyetujui permintaan role-nya sendiri.');
  }

  // Aturan 5: Institution Administrator tidak dapat memberi dirinya role Approver.
  if (resource.kind === 'tenant_user_role'
      && role === 'institution_administrator'
      && resource.requestedFor === subject
      && ROLES[resolveRole(resource.requestedRole)]?.sensitivity === 'high_risk') {
    return violation(5, 'SOD_ADMIN_SELF_ELEVATION',
      'Institution Administrator tidak dapat memberikan role berisiko tinggi kepada dirinya sendiri.');
  }

  // Aturan 6: Internal Auditor tidak boleh create, submit, atau approve data bisnis.
  if (READ_ONLY_ROLES.includes(role) && MUTATING_ACTIONS.has(action)) {
    return violation(6, 'SOD_AUDITOR_MUTATION',
      `Role ${role} tidak boleh melakukan aksi ${action} pada data bisnis.`);
  }

  // Aturan 7: penjalan run CRSA tidak dapat menjadi approver run yang sama.
  if ((resource.kind === 'crsa_run' || resource.kind === 'standardised_run')
      && action === 'approve'
      && (resource.executedBy === subject || resource.createdBy === subject)) {
    return violation(7, 'SOD_RUN_EXECUTOR_IS_APPROVER',
      'Penjalan run tidak dapat menyetujui run yang sama.');
  }

  // Aturan 8: sign-off rekonsiliasi keuangan hanya oleh role Finance.
  if (context.signOffKind === 'financial_reconciliation' && !FINANCE_SIGNOFF_ROLES.includes(role)) {
    return violation(8, 'SOD_FINANCE_SIGNOFF_ONLY',
      'Sign-off rekonsiliasi keuangan hanya dapat dilakukan Finance Reviewer.');
  }

  // Aturan 9: sign-off kepatuhan laporan hanya oleh role Compliance.
  if (context.signOffKind === 'report_compliance' && !COMPLIANCE_SIGNOFF_ROLES.includes(role)) {
    return violation(9, 'SOD_COMPLIANCE_SIGNOFF_ONLY',
      'Sign-off kepatuhan laporan hanya dapat dilakukan Compliance Reviewer.');
  }

  // Aturan 10: Sharia Governance Reviewer wajib ada dalam alur BUS/UUS.
  if (context.sharia === true && action === 'approve'
      && (resource.kind === 'book6_report' || resource.kind === 'report_package' || context.contractIsSharia === true)
      && resource.shariaCheckedBy == null) {
    return violation(10, 'SOD_SHARIA_REVIEW_REQUIRED',
      'Alur laporan BUS/UUS dan akad syariah wajib melewati Sharia Governance Reviewer.');
  }

  // Aturan 11: delegasi tidak dapat memindahkan wewenang kepada orang yang
  // melanggar aturan 1 sampai 10. Dicek dengan mengevaluasi ulang aturan atas
  // identitas penerima delegasi tanpa konteks delegasinya.
  if (actor.delegation && actor.delegation.fromSubject) {
    const asDelegate = {
      actor: { ...actor, delegation: null, role: actor.delegation.delegatedRole || actor.role },
      resource,
      action,
      context: { ...context, _delegationReentry: true },
    };
    if (!context._delegationReentry) {
      const nested = evaluateSoD(asDelegate);
      if (!nested.allowed) {
        return violation(11, 'SOD_DELEGATION_LAUNDERING',
          `Delegasi tidak dapat memindahkan wewenang: ${nested.message}`);
      }
    }
  }

  // Aturan 12: delegasi wajib punya batas waktu dan kedaluwarsa otomatis.
  if (actor.delegation) {
    const { validUntil, maxDays } = actor.delegation;
    if (!validUntil) return violation(12, 'SOD_DELEGATION_NO_EXPIRY', 'Delegasi wajib memiliki batas waktu.');
    if (!context.now) return violation(12, 'SOD_DELEGATION_NO_CLOCK', 'Waktu evaluasi wajib diberikan untuk menilai delegasi.');
    if (context.now > validUntil) return violation(12, 'SOD_DELEGATION_EXPIRED', 'Delegasi sudah kedaluwarsa.');
    if (typeof maxDays === 'number' && actor.delegation.grantedAt) {
      const spanDays = (Date.parse(validUntil) - Date.parse(actor.delegation.grantedAt)) / 86400000;
      if (spanDays > maxDays) {
        return violation(12, 'SOD_DELEGATION_TOO_LONG',
          `Durasi delegasi ${spanDays} hari melampaui batas kebijakan ${maxDays} hari.`);
      }
    }
  }

  // Aturan 13: override hasil model wajib alasan, lampiran, dan persetujuan
  // satu level di atas pembuat.
  if (context.isOverride === true) {
    const o = context.override || {};
    if (!o.reason || String(o.reason).trim().length < 10) {
      return violation(13, 'SOD_OVERRIDE_NO_REASON', 'Override hasil model wajib menyertakan alasan.');
    }
    if (!o.attachmentRef) {
      return violation(13, 'SOD_OVERRIDE_NO_ATTACHMENT', 'Override hasil model wajib menyertakan lampiran.');
    }
    const required = ESCALATION[resolveRole(o.createdByRole)];
    if (!required) {
      return violation(13, 'SOD_OVERRIDE_NO_ESCALATION_PATH',
        `Tidak ada jalur eskalasi yang ditetapkan untuk role ${o.createdByRole}.`);
    }
    if (resolveRole(o.approvedByRole) !== required) {
      return violation(13, 'SOD_OVERRIDE_WRONG_LEVEL',
        `Override oleh ${o.createdByRole} wajib disetujui ${required}.`);
    }
    if (o.approvedBy === o.createdBy) {
      return violation(13, 'SOD_OVERRIDE_SELF_APPROVAL', 'Override tidak dapat disetujui pembuatnya sendiri.');
    }
  }

  // Aturan 14: unlock laporan LOCKED wajib dual approval dan membuat versi baru.
  if (action === 'unlock') {
    const approvals = context.unlockApprovals || [];
    const roles = new Set(approvals.map((a) => resolveRole(a.role)));
    const subjects = new Set(approvals.map((a) => a.subject));
    if (!roles.has('compliance_reviewer') || !roles.has('climate_risk_head')) {
      return violation(14, 'SOD_UNLOCK_DUAL_APPROVAL_REQUIRED',
        'Unlock laporan LOCKED wajib disetujui Compliance Reviewer dan Climate Risk Head.');
    }
    if (subjects.size < 2) {
      return violation(14, 'SOD_UNLOCK_SAME_PERSON',
        'Dua persetujuan unlock wajib berasal dari dua orang berbeda.');
    }
    if (context.createsNewVersion !== true) {
      return violation(14, 'SOD_UNLOCK_NO_NEW_VERSION',
        'Unlock wajib membuat versi laporan baru, bukan mengubah versi terkunci.');
    }
  }

  return ok;
}

/**
 * Aturan 15: kombinasi role yang bertentangan ditolak saat assignment.
 *
 * @param {object} params
 * @param {string[]} params.existingRoles role yang sudah dipegang subject
 * @param {string}   params.newRole       role yang akan diberikan
 * @param {string}   params.requestedFor  subject penerima
 * @param {string}   params.requestedBy   subject peminta
 * @param {object}   [params.approval]    { subject, role } persetujuan dual control
 */
export function checkRoleAssignment({ existingRoles = [], newRole, requestedFor, requestedBy, approval }) {
  const target = resolveRole(newRole);
  if (!target) return violation(15, 'UNKNOWN_ROLE', `Role ${newRole} tidak dikenal.`);

  const held = existingRoles.map(resolveRole).filter(Boolean);

  // Aturan 15: cek seluruh pasangan yang bertentangan.
  for (const [a, b] of CONFLICTING_ROLE_PAIRS) {
    if ((target === a && held.includes(b)) || (target === b && held.includes(a))) {
      return violation(15, 'SOD_CONFLICTING_ROLES',
        `Role ${a} dan ${b} tidak boleh dipegang orang yang sama.`);
    }
  }

  // Aturan 4 pada jalur assignment: peminta tidak menyetujui permintaan sendiri.
  if (approval && approval.subject === requestedFor) {
    return violation(4, 'SOD_SELF_ROLE_APPROVAL', 'Penerima role tidak dapat menyetujui permintaan role-nya sendiri.');
  }
  if (approval && approval.subject === requestedBy) {
    return violation(4, 'SOD_REQUESTER_APPROVES', 'Peminta role tidak dapat menyetujui permintaannya sendiri.');
  }

  // Role berisiko tinggi wajib dual control oleh Institution Security Administrator.
  if (ROLES[target].sensitivity === 'high_risk') {
    if (!approval) {
      return violation(15, 'SOD_HIGH_RISK_NEEDS_APPROVAL',
        `Pemberian role ${target} wajib disetujui Institution Security Administrator.`);
    }
    if (resolveRole(approval.role) !== 'institution_security_administrator') {
      return violation(15, 'SOD_HIGH_RISK_WRONG_APPROVER',
        'Persetujuan role berisiko tinggi hanya sah dari Institution Security Administrator.');
    }
  }

  return ok;
}

/** Daftar seluruh aturan untuk dokumentasi dan pelaporan cakupan uji. */
export const SOD_RULES = Object.freeze([
  { rule: 1, name: 'Maker, Checker, dan Approver harus orang berbeda pada record yang sama' },
  { rule: 2, name: 'Pembuat faktor atau parameter tidak dapat menyetujuinya' },
  { rule: 3, name: 'Pengembang model bukan validator model versi yang sama' },
  { rule: 4, name: 'Peminta role tidak dapat menyetujui permintaannya sendiri' },
  { rule: 5, name: 'Institution Administrator tidak dapat menaikkan hak dirinya sendiri' },
  { rule: 6, name: 'Auditor tidak boleh create, submit, atau approve data bisnis' },
  { rule: 7, name: 'Penjalan run tidak dapat menyetujui run yang sama' },
  { rule: 8, name: 'Sign-off rekonsiliasi keuangan hanya oleh Finance' },
  { rule: 9, name: 'Sign-off kepatuhan laporan hanya oleh Compliance' },
  { rule: 10, name: 'Sharia Governance Reviewer wajib dalam alur BUS/UUS' },
  { rule: 11, name: 'Delegasi tidak dapat memindahkan wewenang yang melanggar aturan 1 sampai 10' },
  { rule: 12, name: 'Delegasi wajib berbatas waktu dan kedaluwarsa otomatis' },
  { rule: 13, name: 'Override model wajib alasan, lampiran, dan persetujuan satu level di atas' },
  { rule: 14, name: 'Unlock laporan LOCKED wajib dual approval dan versi baru' },
  { rule: 15, name: 'Kombinasi role bertentangan ditolak saat assignment' },
]);
