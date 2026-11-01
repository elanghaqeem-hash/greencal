// Siklus hidup identitas Joiner, Mover, Leaver dan access recertification.
// Master Execution Prompt v2.0 Bagian 03.4.
//
// Modul ini murni: menghasilkan rencana perubahan yang harus dieksekusi
// pemanggil secara transaksional, sehingga keputusannya dapat diuji tanpa
// basis data dan tanpa jam sistem.

import { ROLES, resolveRole } from './roles.js';
import { checkRoleAssignment } from './sod.js';

/** Nilai default yang dapat dikonfigurasi sesuai kebijakan TI bank. */
export const LIFECYCLE_DEFAULTS = Object.freeze({
  leaverSessionRevocationMinutes: 15,
  inactiveAccountSuspendDays: 90,
  recertificationIntervalDays: 90,
  maxDelegationDays: 30,
});

const plan = (actions, notes = []) => Object.freeze({ actions: Object.freeze(actions), notes: Object.freeze(notes) });

/**
 * Joiner: membuat membership baru. Setiap role berisiko tinggi tetap melewati
 * dual control, sehingga onboarding dari HR atau SCIM tidak bisa menjadi jalur
 * pintas pemberian hak istimewa.
 */
export function onJoiner({ subject, tenantId, orgUnitPath, requestedRoles = [], requestedBy, approvals = {} }) {
  const actions = [];
  const notes = [];
  const held = [];

  for (const raw of requestedRoles) {
    const role = resolveRole(raw);
    if (!role) {
      notes.push(`Role ${raw} tidak dikenal dan diabaikan.`);
      continue;
    }
    const verdict = checkRoleAssignment({
      existingRoles: held,
      newRole: role,
      requestedFor: subject,
      requestedBy,
      approval: approvals[role],
    });
    if (!verdict.allowed) {
      notes.push(`Role ${role} ditolak: ${verdict.message}`);
      continue;
    }
    held.push(role);
    actions.push({ type: 'GRANT_ROLE', subject, tenantId, orgUnitPath, role });
  }

  actions.push({ type: 'ENROL_MFA', subject, level: held.some((r) => ROLES[r].sensitivity === 'high_risk') ? 'phishing_resistant' : 'standard' });
  actions.push({ type: 'SCHEDULE_RECERTIFICATION', subject, inDays: LIFECYCLE_DEFAULTS.recertificationIntervalDays });
  return plan(actions, notes);
}

/**
 * Mover: perpindahan unit atau jabatan. Role lama dicabut lebih dulu, lalu
 * role baru diberikan. Mencabut dulu mencegah akumulasi hak yang menjadi
 * pelanggaran SoD saat transisi.
 */
export function onMover({ subject, tenantId, fromOrgUnitPath, toOrgUnitPath, currentRoles = [], targetRoles = [], requestedBy, approvals = {} }) {
  const actions = [];
  const notes = [];
  const current = currentRoles.map(resolveRole).filter(Boolean);
  const target = targetRoles.map(resolveRole).filter(Boolean);

  for (const role of current) {
    if (!target.includes(role)) {
      actions.push({ type: 'REVOKE_ROLE', subject, tenantId, role, reason: 'mover' });
    }
  }

  const retained = current.filter((r) => target.includes(r));
  const held = [...retained];
  for (const role of target) {
    if (retained.includes(role)) continue;
    const verdict = checkRoleAssignment({
      existingRoles: held,
      newRole: role,
      requestedFor: subject,
      requestedBy,
      approval: approvals[role],
    });
    if (!verdict.allowed) {
      notes.push(`Role ${role} ditolak: ${verdict.message}`);
      continue;
    }
    held.push(role);
    actions.push({ type: 'GRANT_ROLE', subject, tenantId, orgUnitPath: toOrgUnitPath, role });
  }

  if (fromOrgUnitPath !== toOrgUnitPath) {
    actions.push({ type: 'UPDATE_ORG_SCOPE', subject, tenantId, orgUnitPath: toOrgUnitPath });
    actions.push({ type: 'REVOKE_ACTIVE_SESSIONS', subject, reason: 'org_scope_change' });
  }
  actions.push({ type: 'SCHEDULE_RECERTIFICATION', subject, inDays: LIFECYCLE_DEFAULTS.recertificationIntervalDays });
  return plan(actions, notes);
}

/**
 * Leaver: seluruh role dicabut dan sesi aktif dihentikan dalam batas waktu
 * yang ditetapkan. Delegasi yang diberikan orang ini juga dibatalkan agar
 * wewenangnya tidak bertahan lewat pihak lain.
 */
export function onLeaver({ subject, tenantId, currentRoles = [], outgoingDelegations = [] }) {
  const actions = [];
  for (const raw of currentRoles) {
    const role = resolveRole(raw);
    if (role) actions.push({ type: 'REVOKE_ROLE', subject, tenantId, role, reason: 'leaver' });
  }
  for (const d of outgoingDelegations) {
    actions.push({ type: 'CANCEL_DELEGATION', delegationId: d.id, reason: 'delegator_left' });
  }
  actions.push({
    type: 'REVOKE_ACTIVE_SESSIONS',
    subject,
    withinMinutes: LIFECYCLE_DEFAULTS.leaverSessionRevocationMinutes,
    reason: 'leaver',
  });
  actions.push({ type: 'DISABLE_ACCOUNT', subject, tenantId });
  return plan(actions);
}

/**
 * Akun tidak aktif melewati ambang batas disuspend otomatis.
 * @param {number} inactiveDays hari sejak login terakhir
 */
export function evaluateInactivity({ subject, tenantId, inactiveDays, thresholdDays = LIFECYCLE_DEFAULTS.inactiveAccountSuspendDays }) {
  if (typeof inactiveDays !== 'number' || Number.isNaN(inactiveDays)) {
    return plan([], ['Hari tidak aktif tidak diketahui; tidak ada tindakan otomatis.']);
  }
  if (inactiveDays < thresholdDays) return plan([]);
  return plan([{ type: 'SUSPEND_ACCOUNT', subject, tenantId, reason: `inactive_${inactiveDays}d` }]);
}

/**
 * Access recertification triwulanan oleh atasan dan pemilik data.
 * Hasilnya disimpan sebagai evidence; role yang tidak dikonfirmasi dicabut.
 */
export function evaluateRecertification({ subject, tenantId, entries = [] }) {
  const actions = [];
  const notes = [];
  for (const e of entries) {
    const role = resolveRole(e.role);
    if (!role) continue;
    const confirmedByManager = e.managerDecision === 'confirm';
    const confirmedByDataOwner = e.dataOwnerDecision === 'confirm';
    if (confirmedByManager && confirmedByDataOwner) {
      actions.push({ type: 'RECORD_RECERTIFICATION_EVIDENCE', subject, tenantId, role, outcome: 'retained' });
      continue;
    }
    actions.push({ type: 'REVOKE_ROLE', subject, tenantId, role, reason: 'recertification_not_confirmed' });
    actions.push({ type: 'RECORD_RECERTIFICATION_EVIDENCE', subject, tenantId, role, outcome: 'revoked' });
    if (!confirmedByManager && !confirmedByDataOwner) {
      notes.push(`Role ${role} tidak dikonfirmasi atasan maupun pemilik data.`);
    } else {
      notes.push(`Role ${role} hanya dikonfirmasi satu pihak; dicabut secara konservatif.`);
    }
  }
  actions.push({ type: 'SCHEDULE_RECERTIFICATION', subject, inDays: LIFECYCLE_DEFAULTS.recertificationIntervalDays });
  return plan(actions, notes);
}
