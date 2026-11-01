// Register 27 role GreenCal CRMS Enterprise.
//
// Master Execution Prompt v2.0 Bagian 03 menyebut 27 role tanpa merinci
// namanya; rinciannya berada di v1.0 Bagian 04 yang tidak tersedia. Register
// ini disusun sebagai superset yang mempertahankan seluruh 14 role yang sudah
// berjalan di src/enterprise/policy.js dan menambahkan setiap role yang
// dinamai eksplisit pada matriks permission v2.0 Bagian 03.2 serta kelompok
// navigasi Bagian 04.2. Jumlahnya tepat 27. Bila v1.0 tersedia, daftar ini
// wajib direkonsiliasi dan selisihnya dicatat sebagai temuan.

/** Tingkat kepercayaan yang diperlukan untuk memegang role. */
export const SENSITIVITY = Object.freeze({
  PLATFORM: 'platform',      // di luar tenant bank
  HIGH_RISK: 'high_risk',    // pemberian wajib dual control
  STANDARD: 'standard',
  READ_ONLY: 'read_only',
});

export const ROLES = Object.freeze({
  // --- Platform (tanpa akses data bisnis tenant) -------------------------
  platform_super_administrator: {
    group: 'platform', sensitivity: SENSITIVITY.PLATFORM, legacy: 'super_administrator',
    label: 'Platform Super Administrator',
    note: 'Tidak memiliki akses data bisnis tenant. Dukungan hanya via break-glass.',
  },
  platform_operations: {
    group: 'platform', sensitivity: SENSITIVITY.PLATFORM,
    label: 'Platform Operations',
    note: 'Operasi infrastruktur dan rilis. Tanpa akses data bisnis.',
  },

  // --- Administrasi institusi -------------------------------------------
  institution_administrator: {
    group: 'administration', sensitivity: SENSITIVITY.HIGH_RISK, legacy: 'institution_administrator',
    label: 'Institution Administrator',
  },
  institution_security_administrator: {
    group: 'administration', sensitivity: SENSITIVITY.HIGH_RISK,
    label: 'Institution Security Administrator',
    note: 'Menyetujui pemberian role berisiko tinggi dan sesi break-glass.',
  },
  crms_program_owner: {
    group: 'administration', sensitivity: SENSITIVITY.STANDARD,
    label: 'CRMS Program Owner',
    note: 'Membuka dan menutup Reporting Cycle.',
  },
  crms_project_administrator: {
    group: 'administration', sensitivity: SENSITIVITY.STANDARD, legacy: 'crms_project_administrator',
    label: 'CRMS Project Administrator',
  },

  // --- Data --------------------------------------------------------------
  data_steward: {
    group: 'data', sensitivity: SENSITIVITY.STANDARD,
    label: 'Data Steward',
    note: 'Ingest, snapshot, dan kualitas data sumber.',
  },
  branch_maker: {
    group: 'data', sensitivity: SENSITIVITY.STANDARD,
    label: 'Branch Maker',
    note: 'Input aktivitas pada unit atau cabang sendiri saja.',
    scopeRestriction: 'own_org_unit',
  },
  data_maker: {
    group: 'data', sensitivity: SENSITIVITY.STANDARD, legacy: 'data_maker',
    label: 'Data Maker',
  },

  // --- Emisi dan pemodelan ----------------------------------------------
  ghg_pcaf_analyst: {
    group: 'emission', sensitivity: SENSITIVITY.STANDARD,
    label: 'GHG/PCAF Analyst',
  },
  climate_model_analyst: {
    group: 'modelling', sensitivity: SENSITIVITY.STANDARD, legacy: 'climate_model_analyst',
    label: 'Climate Model Analyst',
  },
  risk_analyst: {
    group: 'modelling', sensitivity: SENSITIVITY.STANDARD, legacy: 'risk_analyst',
    label: 'Risk Analyst / Quant',
  },

  // --- Pemilik domain risiko --------------------------------------------
  credit_risk_officer: { group: 'risk_domain', sensitivity: SENSITIVITY.STANDARD, label: 'Credit Risk Officer' },
  market_treasury_officer: { group: 'risk_domain', sensitivity: SENSITIVITY.STANDARD, label: 'Market & Treasury Officer' },
  operational_risk_officer: { group: 'risk_domain', sensitivity: SENSITIVITY.STANDARD, label: 'Operational Risk Officer' },

  // --- Alur kerja --------------------------------------------------------
  checker: { group: 'workflow', sensitivity: SENSITIVITY.STANDARD, legacy: 'checker', label: 'Checker' },
  approver: { group: 'workflow', sensitivity: SENSITIVITY.HIGH_RISK, legacy: 'approver', label: 'Approver' },

  // --- Pimpinan ----------------------------------------------------------
  climate_risk_head: { group: 'leadership', sensitivity: SENSITIVITY.HIGH_RISK, label: 'Climate Risk Head' },
  risk_management_head: {
    group: 'leadership', sensitivity: SENSITIVITY.HIGH_RISK, legacy: 'risk_management_head',
    label: 'Risk Management Head',
  },

  // --- Lini kedua --------------------------------------------------------
  finance_reviewer: {
    group: 'second_line', sensitivity: SENSITIVITY.STANDARD,
    label: 'Finance Reviewer',
    note: 'Satu-satunya role yang boleh sign-off rekonsiliasi keuangan.',
  },
  compliance_reviewer: {
    group: 'second_line', sensitivity: SENSITIVITY.STANDARD, legacy: 'compliance_reviewer',
    label: 'Compliance Reviewer',
    note: 'Satu-satunya role yang boleh sign-off kepatuhan laporan.',
  },
  sharia_governance_reviewer: {
    group: 'second_line', sensitivity: SENSITIVITY.STANDARD, legacy: 'sharia_governance_reviewer',
    label: 'Sharia Governance Reviewer',
    note: 'Wajib dalam alur laporan BUS/UUS dan akad syariah.',
  },

  // --- Assurance ---------------------------------------------------------
  model_validator: {
    group: 'assurance', sensitivity: SENSITIVITY.HIGH_RISK,
    label: 'Independent Model Validator',
  },
  internal_auditor: {
    group: 'assurance', sensitivity: SENSITIVITY.READ_ONLY, legacy: 'internal_auditor',
    label: 'Internal Auditor',
    note: 'Tidak boleh memiliki aksi create, submit, atau approve pada data bisnis.',
  },
  external_auditor: {
    group: 'assurance', sensitivity: SENSITIVITY.READ_ONLY, legacy: 'external_auditor',
    label: 'External Auditor',
  },

  // --- Pembaca -----------------------------------------------------------
  executive_viewer: {
    group: 'viewer', sensitivity: SENSITIVITY.READ_ONLY, legacy: 'executive_viewer',
    label: 'Executive Viewer',
  },
  board_viewer: {
    group: 'viewer', sensitivity: SENSITIVITY.READ_ONLY, legacy: null,
    label: 'Board Viewer',
    note: 'Hanya melihat laporan setelah berstatus LOCKED.',
  },
});

export const ROLE_NAMES = Object.freeze(Object.keys(ROLES));

/** Role yang pemberiannya wajib disetujui Institution Security Administrator. */
export const HIGH_RISK_ROLES = Object.freeze(
  ROLE_NAMES.filter((r) => ROLES[r].sensitivity === SENSITIVITY.HIGH_RISK),
);

/** Role platform yang tidak boleh memiliki akses data bisnis tenant. */
export const PLATFORM_ROLES = Object.freeze(
  ROLE_NAMES.filter((r) => ROLES[r].sensitivity === SENSITIVITY.PLATFORM),
);

/** Role read-only yang tidak boleh memiliki aksi mutasi apa pun. */
export const READ_ONLY_ROLES = Object.freeze(
  ROLE_NAMES.filter((r) => ROLES[r].sensitivity === SENSITIVITY.READ_ONLY),
);

/** Pemetaan 14 role lama agar membership yang sudah ada tidak putus. */
export const LEGACY_ROLE_MAP = Object.freeze(
  Object.fromEntries(
    ROLE_NAMES.filter((r) => ROLES[r].legacy).map((r) => [ROLES[r].legacy, r]),
  ),
);

export const resolveRole = (name) => (ROLES[name] ? name : LEGACY_ROLE_MAP[name] || null);
export const isRole = (name) => Boolean(ROLES[name]);
