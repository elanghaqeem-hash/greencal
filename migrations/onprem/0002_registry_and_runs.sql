-- Registry regulasi-sebagai-data dan calculation_run yang dapat direproduksi.
-- Master Execution Prompt v2.0 Bagian 01.1 butir 1 dan 2, Bagian 04, Bagian 09.1.
--
-- Tidak ada satu pun konstanta regulatori yang hard-coded di aplikasi. Setiap
-- angka berasal dari tabel di sini, membawa dokumen sumber, halaman, versi,
-- status verifikasi, dan jejak verifier serta approver.

BEGIN;
SET search_path = crms, public;

-- ---------------------------------------------------------------------------
-- 1. Dokumen regulatori
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crms.regulatory_documents (
  tenant_id      UUID NOT NULL REFERENCES crms.institutions(id) ON DELETE RESTRICT,
  id             TEXT NOT NULL CHECK (length(id) BETWEEN 3 AND 128),
  title          TEXT NOT NULL,
  book_no        SMALLINT CHECK (book_no BETWEEN 1 AND 7),
  annex_ref      TEXT,
  issuer         TEXT NOT NULL DEFAULT 'OJK',
  version        TEXT NOT NULL,
  effective_from DATE NOT NULL,
  -- Checksum berkas sumber. Wajib ada sebelum status parameter mana pun yang
  -- merujuk dokumen ini dapat naik ke APPROVED.
  source_sha256  crms.sha256_hex,
  page_count     INTEGER CHECK (page_count > 0),
  registered_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  registered_by  crms.subject_id NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

-- ---------------------------------------------------------------------------
-- 2. Parameter regulatori
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crms.regulatory_parameters (
  tenant_id     UUID NOT NULL REFERENCES crms.institutions(id) ON DELETE RESTRICT,
  parameter_key TEXT NOT NULL CHECK (parameter_key ~ '^[a-z0-9_.\[\]-]{3,160}$'),
  version       INTEGER NOT NULL CHECK (version > 0),
  value_numeric crms.amount,
  value_text    TEXT,
  unit          TEXT,
  status        crms.parameter_status NOT NULL DEFAULT 'SOURCE_PENDING',
  document_id   TEXT NOT NULL,
  page_ref      TEXT NOT NULL,
  table_ref     TEXT,
  cell_ref      TEXT,
  -- Dual independent extraction. Dua ekstraksi berbeda wajib cocok sebelum
  -- status dapat mencapai VERIFIED_DUAL.
  extraction_a_digest crms.sha256_hex,
  extraction_b_digest crms.sha256_hex,
  verified_by   crms.subject_id,
  verified_at   TIMESTAMPTZ,
  approved_by   crms.subject_id,
  approved_at   TIMESTAMPTZ,
  superseded_by INTEGER,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    crms.subject_id NOT NULL,
  PRIMARY KEY (tenant_id, parameter_key, version),
  FOREIGN KEY (tenant_id, document_id) REFERENCES crms.regulatory_documents(tenant_id, id),

  -- Nilai wajib ada dalam salah satu bentuk, tidak keduanya kosong.
  CONSTRAINT parameter_has_value
    CHECK (value_numeric IS NOT NULL OR value_text IS NOT NULL),

  -- Fail closed pada tangga status: tiap tingkat menuntut buktinya sendiri.
  CONSTRAINT dual_requires_two_extractions
    CHECK (status NOT IN ('VERIFIED_DUAL', 'APPROVED')
           OR (extraction_a_digest IS NOT NULL
               AND extraction_b_digest IS NOT NULL
               AND extraction_a_digest = extraction_b_digest)),
  CONSTRAINT verified_requires_verifier
    CHECK (status NOT IN ('SOURCE_VERIFIED', 'VERIFIED_DUAL', 'APPROVED')
           OR (verified_by IS NOT NULL AND verified_at IS NOT NULL)),
  CONSTRAINT approved_requires_approver
    CHECK (status <> 'APPROVED'
           OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  -- Pemisahan tugas: pengekstrak, pemverifikasi, dan penyetuju wajib tiga
  -- orang berbeda. Inilah SoD aturan 1 sampai 3 pada tingkat basis data.
  CONSTRAINT parameter_sod_three_persons
    CHECK ((verified_by IS NULL OR verified_by <> created_by)
           AND (approved_by IS NULL OR approved_by <> created_by)
           AND (approved_by IS NULL OR verified_by IS NULL OR approved_by <> verified_by))
);

CREATE UNIQUE INDEX IF NOT EXISTS one_approved_version_per_parameter
  ON crms.regulatory_parameters (tenant_id, parameter_key)
  WHERE status = 'APPROVED';

CREATE INDEX IF NOT EXISTS parameters_by_status
  ON crms.regulatory_parameters (tenant_id, status, parameter_key);

-- Parameter yang sudah APPROVED tidak dapat diubah nilainya. Perubahan hanya
-- lewat versi baru yang mensupersede versi lama.
CREATE OR REPLACE FUNCTION crms.freeze_approved_parameter() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'APPROVED' AND NEW.status = 'APPROVED' THEN
    IF NEW.value_numeric IS DISTINCT FROM OLD.value_numeric
       OR NEW.value_text IS DISTINCT FROM OLD.value_text
       OR NEW.unit IS DISTINCT FROM OLD.unit
       OR NEW.document_id IS DISTINCT FROM OLD.document_id
       OR NEW.page_ref IS DISTINCT FROM OLD.page_ref THEN
      RAISE EXCEPTION
        'PARAMETER_FROZEN: parameter % versi % sudah APPROVED; terbitkan versi baru',
        OLD.parameter_key, OLD.version USING ERRCODE = 'raise_exception';
    END IF;
  END IF;
  IF OLD.status = 'APPROVED' AND NEW.status NOT IN ('APPROVED', 'SUPERSEDED') THEN
    RAISE EXCEPTION
      'PARAMETER_STATUS_REGRESSION: % versi % tidak dapat turun dari APPROVED ke %',
      OLD.parameter_key, OLD.version, NEW.status USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS parameters_freeze ON crms.regulatory_parameters;
CREATE TRIGGER parameters_freeze BEFORE UPDATE ON crms.regulatory_parameters
  FOR EACH ROW EXECUTE FUNCTION crms.freeze_approved_parameter();

-- APPROVED hanya sah bila dokumen sumbernya sudah punya checksum.
CREATE OR REPLACE FUNCTION crms.require_source_checksum() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE doc_hash crms.sha256_hex;
BEGIN
  IF NEW.status IN ('VERIFIED_DUAL', 'APPROVED') THEN
    SELECT source_sha256 INTO doc_hash
      FROM crms.regulatory_documents
     WHERE tenant_id = NEW.tenant_id AND id = NEW.document_id;
    IF doc_hash IS NULL THEN
      RAISE EXCEPTION
        'SOURCE_CHECKSUM_MISSING: dokumen % belum memiliki source_sha256; parameter % tidak dapat berstatus %',
        NEW.document_id, NEW.parameter_key, NEW.status USING ERRCODE = 'raise_exception';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS parameters_require_checksum ON crms.regulatory_parameters;
CREATE TRIGGER parameters_require_checksum BEFORE INSERT OR UPDATE ON crms.regulatory_parameters
  FOR EACH ROW EXECUTE FUNCTION crms.require_source_checksum();

-- ---------------------------------------------------------------------------
-- 3. Formula berversi
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crms.formulas (
  tenant_id   UUID NOT NULL REFERENCES crms.institutions(id) ON DELETE RESTRICT,
  formula_id  TEXT NOT NULL CHECK (formula_id ~ '^[a-z0-9_.]{3,120}$'),
  version     TEXT NOT NULL CHECK (version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  expression  TEXT NOT NULL,
  unit        TEXT,
  inputs      JSONB NOT NULL CHECK (jsonb_typeof(inputs) = 'array'),
  parameters  JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(parameters) = 'array'),
  reference   TEXT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  crms.subject_id NOT NULL,
  PRIMARY KEY (tenant_id, formula_id, version)
);

-- ---------------------------------------------------------------------------
-- 4. Snapshot data dan calculation_run
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crms.data_snapshots (
  tenant_id     UUID NOT NULL REFERENCES crms.institutions(id) ON DELETE RESTRICT,
  id            TEXT NOT NULL,
  source_system TEXT NOT NULL,
  as_of_date    DATE NOT NULL,
  row_count     BIGINT NOT NULL CHECK (row_count >= 0),
  snapshot_hash crms.sha256_hex NOT NULL,
  ingested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ingested_by   crms.subject_id NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS crms.calculation_runs (
  tenant_id            UUID NOT NULL REFERENCES crms.institutions(id) ON DELETE RESTRICT,
  run_id               TEXT NOT NULL CHECK (length(run_id) BETWEEN 3 AND 128),
  mode                 crms.run_mode NOT NULL,
  scenario             TEXT,
  projection_year      SMALLINT CHECK (projection_year BETWEEN 2020 AND 2100),
  snapshot_id          TEXT NOT NULL,
  snapshot_hash        crms.sha256_hex NOT NULL,
  parameter_set_digest crms.sha256_hex NOT NULL,
  formula_set_digest   crms.sha256_hex NOT NULL,
  input_digest         crms.sha256_hex NOT NULL,
  output_digest        crms.sha256_hex NOT NULL,
  manifest_digest      crms.sha256_hex NOT NULL,
  -- Seed wajib dicatat bila run memakai komponen stokastik; NULL berarti
  -- deterministik penuh. Tidak ada jalur ketiga.
  random_seed          BIGINT,
  engine_contract      TEXT NOT NULL CHECK (engine_contract = 'greencal-onprem-run/1'),
  executed_by          crms.subject_id NOT NULL,
  executed_at          TIMESTAMPTZ NOT NULL,
  -- Reproduksi oleh validator independen, tahap 12 siklus pelaporan.
  reproduced_by        crms.subject_id,
  reproduced_at        TIMESTAMPTZ,
  reproduction_matched BOOLEAN,
  PRIMARY KEY (tenant_id, run_id),
  FOREIGN KEY (tenant_id, snapshot_id) REFERENCES crms.data_snapshots(tenant_id, id),
  CONSTRAINT reproduction_evidence_complete
    CHECK ((reproduced_by IS NULL AND reproduced_at IS NULL AND reproduction_matched IS NULL)
           OR (reproduced_by IS NOT NULL AND reproduced_at IS NOT NULL AND reproduction_matched IS NOT NULL)),
  -- Validator tidak boleh mereproduksi run yang ia jalankan sendiri.
  CONSTRAINT reproduction_independent
    CHECK (reproduced_by IS NULL OR reproduced_by <> executed_by)
);

CREATE INDEX IF NOT EXISTS runs_by_scenario
  ON crms.calculation_runs (tenant_id, scenario, projection_year);

-- calculation_run bersifat immutable kecuali pengisian bukti reproduksi.
CREATE OR REPLACE FUNCTION crms.freeze_calculation_run() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.mode IS DISTINCT FROM OLD.mode
     OR NEW.scenario IS DISTINCT FROM OLD.scenario
     OR NEW.projection_year IS DISTINCT FROM OLD.projection_year
     OR NEW.snapshot_hash IS DISTINCT FROM OLD.snapshot_hash
     OR NEW.parameter_set_digest IS DISTINCT FROM OLD.parameter_set_digest
     OR NEW.formula_set_digest IS DISTINCT FROM OLD.formula_set_digest
     OR NEW.input_digest IS DISTINCT FROM OLD.input_digest
     OR NEW.output_digest IS DISTINCT FROM OLD.output_digest
     OR NEW.manifest_digest IS DISTINCT FROM OLD.manifest_digest
     OR NEW.random_seed IS DISTINCT FROM OLD.random_seed
     OR NEW.executed_by IS DISTINCT FROM OLD.executed_by
     OR NEW.executed_at IS DISTINCT FROM OLD.executed_at THEN
    RAISE EXCEPTION
      'RUN_IMMUTABLE: run % tidak dapat diubah; jalankan run baru',
      OLD.run_id USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS runs_freeze ON crms.calculation_runs;
CREATE TRIGGER runs_freeze BEFORE UPDATE ON crms.calculation_runs
  FOR EACH ROW EXECUTE FUNCTION crms.freeze_calculation_run();

-- Output per sel, inilah sumber trace-to-cell pada Buku 6.
CREATE TABLE IF NOT EXISTS crms.run_outputs (
  tenant_id    UUID NOT NULL REFERENCES crms.institutions(id) ON DELETE RESTRICT,
  run_id       TEXT NOT NULL,
  component_id TEXT NOT NULL,
  -- Kanal perhitungan. Pasangan kanal terlarang dicegah aplikasi
  -- (assertNoDoubleCounting) dan diperiksa ulang oleh constraint di 0003.
  channel      TEXT NOT NULL CHECK (channel IN
                 ('credit', 'market', 'liquidity', 'operational',
                  'ecl', 'mtm', 'lgd', 'bank_physical_loss')),
  formula_id   TEXT NOT NULL,
  formula_version TEXT NOT NULL,
  value        crms.amount NOT NULL,
  unit         TEXT NOT NULL,
  trace        JSONB NOT NULL,
  PRIMARY KEY (tenant_id, run_id, component_id, channel),
  FOREIGN KEY (tenant_id, run_id) REFERENCES crms.calculation_runs(tenant_id, run_id),
  FOREIGN KEY (tenant_id, formula_id, formula_version)
    REFERENCES crms.formulas(tenant_id, formula_id, version)
);

COMMIT;
