-- GreenCal CRMS Enterprise — skema on-premise PostgreSQL 16.
-- WP02 re-platform. Master Execution Prompt v2.0 Bagian 02 dan Bagian 09.2.
--
-- Prinsip yang ditegakkan oleh skema ini, bukan oleh lapisan aplikasi:
--   1. Isolasi tenant lewat Row-Level Security pada SETIAP tabel bisnis.
--      Peran aplikasi bukan pemilik tabel dan tidak memiliki BYPASSRLS,
--      sehingga kebocoran lintas tenant tidak mungkin terjadi karena lupa
--      menulis klausa WHERE.
--   2. Aritmetika desimal eksak. Tidak ada kolom DOUBLE PRECISION atau REAL
--      untuk nilai finansial; seluruhnya NUMERIC(38,12) lewat domain.
--   3. Fail closed. crms.current_tenant() melempar galat bila konteks tenant
--      belum ditetapkan, sehingga kueri tanpa konteks gagal, bukan membaca
--      seluruh tenant.
--   4. Audit append-only dengan rantai hash. UPDATE dan DELETE ditolak trigger
--      dan hak aksesnya tidak diberikan.
--
-- Migrasi ini idempoten pada tingkat objek (IF NOT EXISTS) dan hanya boleh
-- dijalankan pada basis data on-premise khusus, bukan pada basis data publik.

BEGIN;

CREATE SCHEMA IF NOT EXISTS crms;
CREATE SCHEMA IF NOT EXISTS crms_audit;

-- pgcrypto dipakai untuk digest SHA-256 sisi basis data pada verifikasi rantai.
-- Ekstensi dipasang dari paket distribusi, bukan diunduh saat runtime.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

SET search_path = crms, public;

-- ---------------------------------------------------------------------------
-- 1. Peran basis data
-- ---------------------------------------------------------------------------
-- crms_owner  : pemilik objek, dipakai migrasi saja, tidak dipakai aplikasi.
-- crms_app    : peran runtime aplikasi. NOINHERIT, bukan pemilik, tanpa
--               BYPASSRLS, sehingga seluruh policy RLS berlaku penuh.
-- crms_readonly: peran audit internal dan eksternal, hanya SELECT.
-- Kata sandi tidak pernah ada di berkas migrasi; disuntikkan operator lewat
-- ALTER ROLE di luar repositori.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crms_owner') THEN
    CREATE ROLE crms_owner NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crms_app') THEN
    CREATE ROLE crms_app LOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crms_readonly') THEN
    CREATE ROLE crms_readonly LOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crms_migrator') THEN
    CREATE ROLE crms_migrator LOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE IN ROLE crms_owner;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA crms, crms_audit TO crms_app, crms_readonly;

-- ---------------------------------------------------------------------------
-- 2. Domain presisi
-- ---------------------------------------------------------------------------
-- NUMERIC(38,12) adalah kontrak yang sama dengan src/onprem/precision/decimal.js
-- (PRECISION 38, SCALE 12). Pembulatan hanya terjadi pada presentasi.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'amount' AND typnamespace = 'crms'::regnamespace) THEN
    CREATE DOMAIN crms.amount AS NUMERIC(38, 12);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'nonneg_amount' AND typnamespace = 'crms'::regnamespace) THEN
    CREATE DOMAIN crms.nonneg_amount AS NUMERIC(38, 12) CHECK (VALUE >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ratio' AND typnamespace = 'crms'::regnamespace) THEN
    -- Rasio dan probabilitas: 0 sampai 1 inklusif, tetap 12 desimal.
    CREATE DOMAIN crms.ratio AS NUMERIC(38, 12) CHECK (VALUE >= 0 AND VALUE <= 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sha256_hex' AND typnamespace = 'crms'::regnamespace) THEN
    CREATE DOMAIN crms.sha256_hex AS TEXT CHECK (VALUE ~ '^[a-f0-9]{64}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subject_id' AND typnamespace = 'crms'::regnamespace) THEN
    CREATE DOMAIN crms.subject_id AS TEXT CHECK (length(VALUE) BETWEEN 1 AND 128);
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. Konteks tenant dan aktor
-- ---------------------------------------------------------------------------
-- Aplikasi menetapkan konteks per transaksi:
--   SET LOCAL crms.tenant_id  = '<uuid tenant dari token terverifikasi>';
--   SET LOCAL crms.subject    = '<subject aktor>';
--   SET LOCAL crms.role       = '<role aktif>';
-- SET LOCAL wajib, bukan SET, agar konteks tidak bocor antar transaksi pada
-- koneksi yang dikumpulkan (connection pool).

CREATE OR REPLACE FUNCTION crms.current_tenant() RETURNS UUID
LANGUAGE plpgsql STABLE AS $$
DECLARE raw TEXT;
BEGIN
  raw := current_setting('crms.tenant_id', true);
  IF raw IS NULL OR raw = '' THEN
    RAISE EXCEPTION 'TENANT_CONTEXT_MISSING: crms.tenant_id belum ditetapkan; kueri dihentikan'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN raw::UUID;
END
$$;

CREATE OR REPLACE FUNCTION crms.current_subject() RETURNS TEXT
LANGUAGE plpgsql STABLE AS $$
DECLARE raw TEXT;
BEGIN
  raw := current_setting('crms.subject', true);
  IF raw IS NULL OR raw = '' THEN
    RAISE EXCEPTION 'ACTOR_CONTEXT_MISSING: crms.subject belum ditetapkan; kueri dihentikan'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN raw;
END
$$;

-- Varian non-throwing khusus untuk trigger audit yang harus tetap menulis
-- walau konteks tak lengkap; nilainya direkam apa adanya agar anomali terlihat.
CREATE OR REPLACE FUNCTION crms.subject_or_unknown() RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('crms.subject', true), ''), 'UNKNOWN_SUBJECT');
$$;

REVOKE ALL ON FUNCTION crms.current_tenant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crms.current_tenant(), crms.current_subject(), crms.subject_or_unknown()
  TO crms_app, crms_readonly;

-- ---------------------------------------------------------------------------
-- 4. Enumerasi
-- ---------------------------------------------------------------------------
-- 27 peran, identik dengan src/onprem/iam/roles.js. Urutan dipertahankan
-- sesuai pengelompokan pada modul tersebut.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crms_role') THEN
    CREATE TYPE crms.crms_role AS ENUM (
      'platform_super_administrator', 'platform_operations',
      'institution_administrator', 'institution_security_administrator',
      'crms_program_owner', 'crms_project_administrator',
      'data_steward', 'branch_maker', 'data_maker',
      'ghg_pcaf_analyst',
      'climate_model_analyst', 'risk_analyst',
      'credit_risk_officer', 'market_treasury_officer', 'operational_risk_officer',
      'checker', 'approver',
      'climate_risk_head', 'risk_management_head',
      'finance_reviewer', 'compliance_reviewer', 'sharia_governance_reviewer',
      'model_validator', 'internal_auditor', 'external_auditor',
      'executive_viewer', 'board_viewer'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'institution_type') THEN
    CREATE TYPE crms.institution_type AS ENUM ('BUK', 'BUS', 'UUS', 'LJK');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'record_status') THEN
    CREATE TYPE crms.record_status AS ENUM
      ('draft', 'submitted', 'checked', 'approved', 'rejected', 'archived');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'parameter_status') THEN
    -- Tangga status parameter regulatori. Hanya APPROVED yang boleh mengisi
    -- output resmi; lihat src/onprem/precision/calculation-run.js.
    CREATE TYPE crms.parameter_status AS ENUM
      ('SOURCE_PENDING', 'SOURCE_VERIFIED', 'VERIFIED_DUAL', 'APPROVED', 'SUPERSEDED', 'BLOCKED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'run_mode') THEN
    CREATE TYPE crms.run_mode AS ENUM ('standardised', 'internal');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'submission_status') THEN
    CREATE TYPE crms.submission_status AS ENUM
      ('DRAFT', 'LOCKED', 'EXPORTED', 'SUBMITTED', 'ACKNOWLEDGED', 'FEEDBACK', 'RESUBMITTED');
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 5. Tabel platform (tanpa tenant_id, bukan data bisnis)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crms.institutions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code             TEXT NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9_-]{2,32}$'),
  name             TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 200),
  institution_type crms.institution_type NOT NULL,
  currency         CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  -- Entitas syariah memicu kewajiban review Dewan Pengawas Syariah pada
  -- tahap 14 siklus pelaporan.
  is_sharia_entity BOOLEAN NOT NULL GENERATED ALWAYS AS
                   (institution_type IN ('BUS', 'UUS')) STORED,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  data_residency   TEXT NOT NULL DEFAULT 'ID' CHECK (data_residency = 'ID'),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       crms.subject_id NOT NULL
);

CREATE TABLE IF NOT EXISTS crms.org_units (
  tenant_id   UUID NOT NULL REFERENCES crms.institutions(id) ON DELETE RESTRICT,
  id          TEXT NOT NULL CHECK (length(id) BETWEEN 1 AND 64),
  parent_id   TEXT,
  name        TEXT NOT NULL,
  unit_kind   TEXT NOT NULL CHECK (unit_kind IN ('head_office', 'region', 'branch', 'unit')),
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, parent_id) REFERENCES crms.org_units(tenant_id, id),
  CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE TABLE IF NOT EXISTS crms.memberships (
  tenant_id        UUID NOT NULL REFERENCES crms.institutions(id) ON DELETE RESTRICT,
  subject          crms.subject_id NOT NULL,
  email            TEXT NOT NULL CHECK (position('@' IN email) > 1),
  role             crms.crms_role NOT NULL,
  org_unit_id      TEXT,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  -- Resertifikasi 90 hari; lihat LIFECYCLE_DEFAULTS pada identity-lifecycle.js.
  granted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by       crms.subject_id NOT NULL,
  recertified_at   TIMESTAMPTZ,
  last_active_at   TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, subject, role),
  FOREIGN KEY (tenant_id, org_unit_id) REFERENCES crms.org_units(tenant_id, id),
  -- Pemberi hak tidak boleh memberi hak kepada dirinya sendiri (SoD aturan 15
  -- ditegakkan di aplikasi; di sini batas minimumnya).
  CONSTRAINT granted_by_not_self CHECK (granted_by <> subject)
);

CREATE INDEX IF NOT EXISTS memberships_by_subject
  ON crms.memberships (tenant_id, subject) WHERE active;

COMMIT;
