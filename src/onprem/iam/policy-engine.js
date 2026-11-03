// Policy engine terpusat, default deny.
//
// Master Execution Prompt v2.0 Bagian 03.1:
//   Keputusan akses = RBAC (role) AND organization scope AND data
//   classification AND workflow state AND SoD AND context (MFA level,
//   perangkat, jaringan, waktu, delegasi aktif).
//
// Engine ini berbasis data dan murni: tidak melakukan I/O dan tidak membaca
// waktu sistem. Seluruh masukan diberikan pemanggil, sehingga keputusan dapat
// direproduksi dan diuji. Frontend hanya membaca hasil untuk menampilkan menu;
// penegakan terjadi di server pada setiap endpoint dan job.

import { ROLES, READ_ONLY_ROLES, PLATFORM_ROLES, resolveRole } from './roles.js';
import { evaluateSoD } from './sod.js';

export const ACTIONS = Object.freeze(['view', 'create', 'submit', 'check', 'approve', 'export', 'unlock']);

export const CLASSIFICATION = Object.freeze({
  PUBLIC: 'PUBLIC',
  INTERNAL: 'INTERNAL',
  CONFIDENTIAL: 'CONFIDENTIAL',
  RESTRICTED: 'RESTRICTED',
});

const CLASSIFICATION_RANK = Object.freeze({ PUBLIC: 0, INTERNAL: 1, CONFIDENTIAL: 2, RESTRICTED: 3 });

/** Aksi yang selalu menuntut MFA step-up, apa pun klasifikasi datanya. */
const STEP_UP_ACTIONS = Object.freeze(new Set(['approve', 'unlock']));

export const RESOURCES = Object.freeze([
  'emission_activity', 'emission_factor', 'regulatory_parameter', 'portfolio', 'counterparty',
  'scenario_dataset', 'physical_hazard', 'crsa_run', 'standardised_run', 'model_inventory',
  'model_validation', 'book6_report', 'reporting_cycle', 'tenant_user_role', 'audit_event',
  'governance', 'transition_assessment', 'report_package', 'break_glass',
]);

// Matriks permission inti. Bagian 03.2 memakai kode V/C/S/K/A/X; di sini
// dipetakan ke view/create/submit/check/approve/export. Tanda hubung pada
// matriks berarti tidak ada akses, yang diwakili dengan ketiadaan entri.
// Default engine adalah DENY, sehingga resource atau role yang tidak tercantum
// otomatis tertolak.
const M = (...actions) => Object.freeze(actions);

export const PERMISSION_MATRIX = Object.freeze({
  emission_activity: {
    branch_maker: M('view', 'create', 'submit'),
    data_maker: M('view', 'create', 'submit'),
    ghg_pcaf_analyst: M('view', 'check'),
    climate_risk_head: M('view', 'approve'),
    risk_analyst: M('view'),
    compliance_reviewer: M('view'),
    model_validator: M('view'),
    internal_auditor: M('view'),
    external_auditor: M('view'),
  },
  emission_factor: {
    ghg_pcaf_analyst: M('view', 'create', 'submit'),
    institution_administrator: M('view', 'create', 'submit'),
    climate_model_analyst: M('view', 'create', 'submit'),
    climate_risk_head: M('view', 'check'),
    risk_analyst: M('view'),
    compliance_reviewer: M('view'),
    model_validator: M('view'),
    internal_auditor: M('view'),
    external_auditor: M('view'),
  },
  regulatory_parameter: {
    compliance_reviewer: M('view', 'create', 'submit'),
    crms_project_administrator: M('view', 'create', 'submit'),
    climate_model_analyst: M('view'),
    climate_risk_head: M('view', 'check'),
    risk_management_head: M('view', 'approve'),
    model_validator: M('view', 'check'),
    internal_auditor: M('view'),
    external_auditor: M('view'),
  },
  portfolio: {
    data_maker: M('view', 'create', 'submit'),
    data_steward: M('view', 'create', 'submit'),
    credit_risk_officer: M('view', 'create'),
    risk_analyst: M('view', 'create'),
    ghg_pcaf_analyst: M('view'),
    climate_risk_head: M('view'),
    finance_reviewer: M('view', 'check'),
    compliance_reviewer: M('view'),
    model_validator: M('view'),
    internal_auditor: M('view'),
    external_auditor: M('view'),
  },
  counterparty: {
    data_maker: M('view', 'create', 'submit'),
    credit_risk_officer: M('view', 'create'),
    risk_analyst: M('view', 'create'),
    climate_risk_head: M('view'),
    compliance_reviewer: M('view'),
    model_validator: M('view'),
    internal_auditor: M('view'),
  },
  scenario_dataset: {
    climate_model_analyst: M('view', 'create', 'submit'),
    risk_analyst: M('view', 'create', 'submit'),
    climate_risk_head: M('view', 'approve'),
    finance_reviewer: M('view'),
    compliance_reviewer: M('view'),
    model_validator: M('view', 'check'),
    internal_auditor: M('view'),
    external_auditor: M('view'),
  },
  physical_hazard: {
    risk_analyst: M('view', 'create', 'submit'),
    climate_model_analyst: M('view', 'create', 'submit'),
    climate_risk_head: M('view', 'approve'),
    model_validator: M('view', 'check'),
    internal_auditor: M('view'),
  },
  crsa_run: {
    risk_analyst: M('view', 'create', 'submit'),
    credit_risk_officer: M('view', 'create', 'submit'),
    market_treasury_officer: M('view', 'create', 'submit'),
    operational_risk_officer: M('view', 'create', 'submit'),
    climate_risk_head: M('view', 'approve'),
    finance_reviewer: M('view', 'check'),
    compliance_reviewer: M('view'),
    model_validator: M('view'),
    internal_auditor: M('view'),
    external_auditor: M('view'),
  },
  standardised_run: {
    risk_analyst: M('view', 'create', 'submit'),
    climate_model_analyst: M('view', 'create', 'submit'),
    climate_risk_head: M('view', 'approve'),
    finance_reviewer: M('view', 'check'),
    model_validator: M('view'),
    internal_auditor: M('view'),
  },
  model_inventory: {
    risk_analyst: M('view', 'create'),
    climate_model_analyst: M('view', 'create'),
    climate_risk_head: M('view'),
    finance_reviewer: M('view'),
    compliance_reviewer: M('view'),
    model_validator: M('view', 'create', 'approve'),
    internal_auditor: M('view'),
  },
  model_validation: {
    model_validator: M('view', 'create', 'submit', 'approve'),
    climate_risk_head: M('view'),
    risk_management_head: M('view'),
    compliance_reviewer: M('view'),
    internal_auditor: M('view'),
    external_auditor: M('view'),
  },
  book6_report: {
    ghg_pcaf_analyst: M('view', 'create'),
    risk_analyst: M('view', 'create'),
    climate_risk_head: M('view', 'check'),
    finance_reviewer: M('view', 'check'),
    compliance_reviewer: M('view', 'approve', 'export'),
    risk_management_head: M('view', 'check'),
    sharia_governance_reviewer: M('view', 'check'),
    model_validator: M('view'),
    internal_auditor: M('view'),
    external_auditor: M('view'),
    board_viewer: M('view'),
    executive_viewer: M('view'),
  },
  reporting_cycle: {
    crms_program_owner: M('view', 'create', 'submit'),
    crms_project_administrator: M('view', 'create'),
    climate_risk_head: M('view', 'approve'),
    data_steward: M('view'),
    finance_reviewer: M('view'),
    compliance_reviewer: M('view'),
    model_validator: M('view'),
    internal_auditor: M('view'),
    executive_viewer: M('view'),
    board_viewer: M('view'),
  },
  tenant_user_role: {
    institution_administrator: M('view', 'create', 'submit'),
    institution_security_administrator: M('view', 'approve'),
    internal_auditor: M('view'),
  },
  audit_event: {
    branch_maker: M('view'),
    data_maker: M('view'),
    ghg_pcaf_analyst: M('view'),
    risk_analyst: M('view'),
    climate_risk_head: M('view'),
    finance_reviewer: M('view'),
    compliance_reviewer: M('view'),
    risk_management_head: M('view'),
    model_validator: M('view'),
    internal_auditor: M('view', 'export'),
    external_auditor: M('view'),
    institution_security_administrator: M('view'),
  },
  governance: {
    crms_project_administrator: M('view', 'create', 'submit'),
    risk_analyst: M('view', 'create', 'submit'),
    climate_risk_head: M('view', 'check'),
    risk_management_head: M('view', 'approve'),
    compliance_reviewer: M('view', 'check'),
    internal_auditor: M('view'),
    executive_viewer: M('view'),
    board_viewer: M('view'),
  },
  transition_assessment: {
    risk_analyst: M('view', 'create', 'submit'),
    climate_model_analyst: M('view', 'create', 'submit'),
    credit_risk_officer: M('view', 'create'),
    climate_risk_head: M('view', 'approve'),
    model_validator: M('view', 'check'),
    internal_auditor: M('view'),
  },
  report_package: {
    compliance_reviewer: M('view', 'create', 'submit', 'approve', 'export'),
    crms_project_administrator: M('view', 'create', 'submit'),
    climate_risk_head: M('view', 'check'),
    finance_reviewer: M('view', 'check'),
    internal_auditor: M('view'),
    external_auditor: M('view'),
  },
  break_glass: {
    platform_super_administrator: M('view', 'submit'),
    institution_security_administrator: M('view', 'approve'),
    internal_auditor: M('view'),
  },
});

/** Klasifikasi default per resource. RESTRICTED menuntut MFA step-up. */
export const RESOURCE_CLASSIFICATION = Object.freeze({
  emission_activity: CLASSIFICATION.INTERNAL,
  emission_factor: CLASSIFICATION.INTERNAL,
  regulatory_parameter: CLASSIFICATION.INTERNAL,
  portfolio: CLASSIFICATION.RESTRICTED,
  counterparty: CLASSIFICATION.RESTRICTED,
  scenario_dataset: CLASSIFICATION.INTERNAL,
  physical_hazard: CLASSIFICATION.CONFIDENTIAL,
  crsa_run: CLASSIFICATION.RESTRICTED,
  standardised_run: CLASSIFICATION.RESTRICTED,
  model_inventory: CLASSIFICATION.CONFIDENTIAL,
  model_validation: CLASSIFICATION.CONFIDENTIAL,
  book6_report: CLASSIFICATION.RESTRICTED,
  reporting_cycle: CLASSIFICATION.INTERNAL,
  tenant_user_role: CLASSIFICATION.CONFIDENTIAL,
  audit_event: CLASSIFICATION.CONFIDENTIAL,
  governance: CLASSIFICATION.INTERNAL,
  transition_assessment: CLASSIFICATION.CONFIDENTIAL,
  report_package: CLASSIFICATION.RESTRICTED,
  break_glass: CLASSIFICATION.CONFIDENTIAL,
});

/** State machine: aksi yang sah pada tiap status record. */
export const STATE_ACTIONS = Object.freeze({
  draft: M('view', 'create', 'submit'),
  submitted: M('view', 'check'),
  returned: M('view', 'create', 'submit'),
  rejected: M('view', 'create', 'submit'),
  checked: M('view', 'approve'),
  approved: M('view', 'export'),
  locked: M('view', 'export', 'unlock'),
  archived: M('view'),
});

const deny = (code, message) => Object.freeze({ allowed: false, code, message });
const allow = (obligations) => Object.freeze({ allowed: true, code: 'ALLOW', obligations: Object.freeze(obligations) });

/**
 * Keputusan otorisasi tunggal.
 *
 * @param {object} request
 * @param {object} request.actor   { subject, tenantId, role, orgUnitPath, mfaLevel, managedDevice, network, delegation }
 * @param {object} request.resource{ kind, tenantId, orgUnitPath, status, classification, createdBy, checkedBy, approvedBy }
 * @param {string} request.action
 * @param {object} [request.context] { now, sharia, hasSodHistory }
 */
export function authorize({ actor, resource, action, context = {} }) {
  // 0. Validasi bentuk masukan. Masukan cacat ditolak, tidak diperbaiki.
  if (!actor || !resource || typeof action !== 'string') return deny('MALFORMED_REQUEST', 'Permintaan otorisasi tidak lengkap.');
  if (!ACTIONS.includes(action)) return deny('UNKNOWN_ACTION', `Aksi ${action} tidak dikenal.`);
  if (!RESOURCES.includes(resource.kind)) return deny('UNKNOWN_RESOURCE', `Resource ${resource.kind} tidak dikenal.`);

  const role = resolveRole(actor.role);
  if (!role) return deny('UNKNOWN_ROLE', `Role ${actor.role} tidak dikenal.`);

  // 1. Isolasi tenant. tenantId diambil dari token terverifikasi, bukan body.
  if (!actor.tenantId || !resource.tenantId) return deny('TENANT_MISSING', 'tenant_id wajib ada pada aktor dan resource.');
  if (actor.tenantId !== resource.tenantId) {
    return deny('CROSS_TENANT', 'Akses lintas tenant ditolak.');
  }

  // 2. Role platform tidak boleh menyentuh data bisnis tenant.
  if (PLATFORM_ROLES.includes(role) && resource.kind !== 'break_glass') {
    return deny('PLATFORM_ROLE_NO_BUSINESS_DATA', 'Role platform tidak memiliki akses data bisnis tenant.');
  }

  // 3. Role read-only tidak boleh melakukan mutasi apa pun.
  if (READ_ONLY_ROLES.includes(role) && action !== 'view' && action !== 'export') {
    return deny('READ_ONLY_ROLE', `Role ${role} bersifat read-only.`);
  }

  // 4. RBAC.
  const granted = PERMISSION_MATRIX[resource.kind]?.[role];
  if (!granted || !granted.includes(action)) {
    return deny('RBAC_DENIED', `Role ${role} tidak memiliki aksi ${action} pada ${resource.kind}.`);
  }

  // 5. Organization scope.
  if (ROLES[role].scopeRestriction === 'own_org_unit') {
    if (!actor.orgUnitPath || !resource.orgUnitPath) {
      return deny('ORG_SCOPE_MISSING', 'Lingkup unit organisasi wajib ada untuk role ini.');
    }
    if (!resource.orgUnitPath.startsWith(actor.orgUnitPath)) {
      return deny('ORG_SCOPE_DENIED', 'Resource berada di luar unit organisasi aktor.');
    }
  }

  // 6. Workflow state.
  if (resource.status) {
    const stateAllowed = STATE_ACTIONS[resource.status];
    if (!stateAllowed) return deny('UNKNOWN_STATE', `Status ${resource.status} tidak dikenal.`);
    if (!stateAllowed.includes(action)) {
      return deny('STATE_DENIED', `Aksi ${action} tidak sah pada status ${resource.status}.`);
    }
  }

  // 7. Separation of duties.
  const sod = evaluateSoD({ actor, resource, action, context });
  if (!sod.allowed) return deny(sod.code, sod.message);

  // 8. Context: klasifikasi data, MFA, perangkat, jaringan.
  const classification = resource.classification || RESOURCE_CLASSIFICATION[resource.kind];
  const rank = CLASSIFICATION_RANK[classification];
  if (rank === undefined) return deny('UNKNOWN_CLASSIFICATION', `Klasifikasi ${classification} tidak dikenal.`);

  const obligations = { maskByDefault: false, stepUpSatisfied: true, classification };

  const needsStepUp = rank >= CLASSIFICATION_RANK.RESTRICTED
    || STEP_UP_ACTIONS.has(action)
    || (action === 'export' && rank >= CLASSIFICATION_RANK.CONFIDENTIAL);

  if (needsStepUp && actor.mfaLevel !== 'step_up' && actor.mfaLevel !== 'phishing_resistant') {
    return deny('MFA_STEP_UP_REQUIRED', `Aksi ${action} pada data ${classification} menuntut MFA step-up.`);
  }

  // Admin dan approver wajib MFA phishing-resistant.
  if ((ROLES[role].sensitivity === 'high_risk' || role === 'institution_security_administrator')
      && action === 'approve' && actor.mfaLevel !== 'phishing_resistant') {
    return deny('PHISHING_RESISTANT_MFA_REQUIRED', 'Persetujuan oleh role berisiko tinggi menuntut MFA phishing-resistant.');
  }

  // Data RESTRICTED hanya dari perangkat terkelola pada jaringan intranet atau VPN.
  if (rank >= CLASSIFICATION_RANK.RESTRICTED) {
    if (actor.managedDevice !== true) return deny('UNMANAGED_DEVICE', 'Data RESTRICTED hanya dapat diakses dari perangkat terkelola.');
    if (actor.network !== 'intranet' && actor.network !== 'vpn') {
      return deny('NETWORK_DENIED', 'Data RESTRICTED hanya dapat diakses dari intranet bank atau VPN.');
    }
    obligations.maskByDefault = true;
  }

  // 9. Konsistensi role delegasi. Masa berlaku delegasi, pencegahan pencucian
  //    wewenang, dan kewajiban review syariah ditegakkan di sod.js (aturan 10
  //    sampai 12) agar aturan SoD punya satu sumber kebenaran.
  if (actor.delegation?.delegatedRole && resolveRole(actor.delegation.delegatedRole) !== role) {
    return deny('DELEGATION_ROLE_MISMATCH', 'Role aktif tidak sesuai dengan role yang didelegasikan.');
  }

  return allow(obligations);
}

/** Daftar aksi yang diizinkan, dipakai frontend untuk menyusun menu. */
export function permittedActions(request) {
  return ACTIONS.filter((action) => authorize({ ...request, action }).allowed);
}
