-- Reporting Cycle 16 tahap, anti double counting, dan audit append-only
-- berantai hash. Master Execution Prompt v2.0 Bagian 06 dan Bagian 07.

BEGIN;
SET search_path = crms, public;

-- ---------------------------------------------------------------------------
-- 1. Reporting Cycle
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crms.reporting_cycles (
  tenant_id        UUID NOT NULL REFERENCES crms.institutions(id) ON DELETE RESTRICT,
  id               TEXT NOT NULL,
  period_label     TEXT NOT NULL,
  cut_off_date     DATE NOT NULL,
  -- Versi 7 Buku yang dipakai siklus ini; gate tahap 2 menuntut 7 entri.
  book_versions    JSONB NOT NULL CHECK (jsonb_array_length(book_versions) = 7),
  mandatory_scenarios JSONB NOT NULL CHECK (jsonb_array_length(mandatory_scenarios) >= 3),
  calendar_approved_by crms.subject_id,
  calendar_approved_at TIMESTAMPTZ,
  opened_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  opened_by        crms.subject_id NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS crms.cycle_stages (
  tenant_id    UUID NOT NULL REFERENCES crms.institutions(id) ON DELETE RESTRICT,
  cycle_id     TEXT NOT NULL,
  stage_no     SMALLINT NOT NULL CHECK (stage_no BETWEEN 1 AND 16),
  stage_key    TEXT NOT NULL,
  due_at       TIMESTAMPTZ,
  -- Status gate. PASSED hanya sah bila gate_evidence terisi dan
  -- passed_by bukan pelaksana tahap; lihat constraint di bawah.
  gate_status  TEXT NOT NULL DEFAULT 'OPEN'
               CHECK (gate_status IN ('LOCKED', 'OPEN', 'FAILED', 'PASSED')),
  gate_evidence JSONB,
  gate_detail  TEXT,
  passed_by    crms.subject_id,
  passed_at    TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, cycle_id, stage_no),
  UNIQUE (tenant_id, cycle_id, stage_key),
  FOREIGN KEY (tenant_id, cycle_id) REFERENCES crms.reporting_cycles(tenant_id, id),
  -- "Evidence or it did not happen": PASSED tanpa bukti tersimpan ditolak.
  CONSTRAINT gate_pass_requires_evidence
    CHECK (gate_status <> 'PASSED'
           OR (gate_evidence IS NOT NULL
               AND passed_by IS NOT NULL
               AND passed_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS crms.report_submissions (
  tenant_id       UUID NOT NULL REFERENCES crms.institutions(id) ON DELETE RESTRICT,
  cycle_id        TEXT NOT NULL,
  id              TEXT NOT NULL,
  status          crms.submission_status NOT NULL DEFAULT 'DRAFT',
  package_checksum crms.sha256_hex,
  export_template_version TEXT,
  ojk_receipt_ref TEXT,
  receipt_attachment_ref TEXT,
  locked_at       TIMESTAMPTZ,
  exported_at     TIMESTAMPTZ,
  submitted_at    TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, cycle_id, id),
  FOREIGN KEY (tenant_id, cycle_id) REFERENCES crms.reporting_cycles(tenant_id, id),
  -- Status SUBMITTED menuntut nomor referensi DAN lampiran tanda terima OJK.
  -- Sama dengan canMarkSubmitted() pada reporting-cycle.js.
  CONSTRAINT submitted_requires_receipt
    CHECK (status NOT IN ('SUBMITTED', 'ACKNOWLEDGED', 'FEEDBACK', 'RESUBMITTED')
           OR (ojk_receipt_ref IS NOT NULL AND length(ojk_receipt_ref) > 0
               AND receipt_attachment_ref IS NOT NULL AND length(receipt_attachment_ref) > 0)),
  CONSTRAINT exported_requires_checksum
    CHECK (status = 'DRAFT' OR status = 'LOCKED' OR package_checksum IS NOT NULL)
);

-- ---------------------------------------------------------------------------
-- 2. Anti double counting, Bagian 05.11
-- ---------------------------------------------------------------------------
-- Satu komponen tidak boleh muncul pada pasangan kanal terlarang dalam satu
-- agregasi. Aturan ini sudah ada di assertNoDoubleCounting(); di sini menjadi
-- constraint basis data agar tidak bisa dilewati lewat jalur apa pun.

CREATE TABLE IF NOT EXISTS crms.aggregation_components (
  tenant_id     UUID NOT NULL REFERENCES crms.institutions(id) ON DELETE RESTRICT,
  aggregation_id TEXT NOT NULL,
  component_id  TEXT NOT NULL,
  channel       TEXT NOT NULL,
  source_run_id TEXT NOT NULL,
  value         crms.amount NOT NULL,
  PRIMARY KEY (tenant_id, aggregation_id, component_id, channel),
  FOREIGN KEY (tenant_id, source_run_id) REFERENCES crms.calculation_runs(tenant_id, run_id)
);

CREATE OR REPLACE FUNCTION crms.assert_no_double_counting() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  forbidden CONSTANT TEXT[][] := ARRAY[
    ARRAY['collateral_physical_haircut', 'lgd', 'bank_physical_loss'],
    ARRAY['bank_own_asset_damage', 'operational', 'credit'],
    ARRAY['amortised_cost_impairment', 'ecl', 'mtm']
  ];
  rule TEXT[];
  hit  INTEGER;
BEGIN
  FOREACH rule SLICE 1 IN ARRAY forbidden LOOP
    IF NEW.component_id = rule[1] THEN
      SELECT count(*) INTO hit
        FROM crms.aggregation_components
       WHERE tenant_id = NEW.tenant_id
         AND aggregation_id = NEW.aggregation_id
         AND component_id = rule[1]
         AND channel IN (rule[2], rule[3]);
      -- Baris yang sedang dimasukkan belum terhitung pada BEFORE INSERT,
      -- sehingga satu baris lain pada kanal pasangan sudah berarti pelanggaran.
      IF hit >= 1 AND NEW.channel IN (rule[2], rule[3]) THEN
        RAISE EXCEPTION
          'DOUBLE_COUNTING: komponen % tidak boleh dihitung pada kanal % dan % sekaligus',
          rule[1], rule[2], rule[3] USING ERRCODE = 'raise_exception';
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS aggregation_no_double_counting ON crms.aggregation_components;
CREATE TRIGGER aggregation_no_double_counting
  BEFORE INSERT OR UPDATE ON crms.aggregation_components
  FOR EACH ROW EXECUTE FUNCTION crms.assert_no_double_counting();

-- ---------------------------------------------------------------------------
-- 3. Audit log append-only berantai hash
-- ---------------------------------------------------------------------------
-- Kontrak hash identik dengan src/onprem/audit/hash-chain.js: kanonikalisasi
-- kunci terurut, prev_hash menautkan event sebelumnya, genesis 64 nol.

CREATE TABLE IF NOT EXISTS crms_audit.event_log (
  tenant_id      UUID NOT NULL REFERENCES crms.institutions(id) ON DELETE RESTRICT,
  sequence       BIGINT NOT NULL CHECK (sequence > 0),
  occurred_at    TIMESTAMPTZ NOT NULL,
  recorded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_type     TEXT NOT NULL CHECK (length(event_type) BETWEEN 3 AND 80),
  actor_subject  crms.subject_id NOT NULL,
  actor_role     crms.crms_role,
  resource_kind  TEXT NOT NULL,
  resource_id    TEXT,
  action         TEXT NOT NULL,
  outcome        TEXT NOT NULL CHECK (outcome IN ('allowed', 'denied', 'error')),
  deny_reason    TEXT,
  -- Payload tidak disimpan utuh; hanya digest-nya, agar log audit tidak
  -- menjadi salinan kedua data pribadi (UU 27/2022 PDP, minimalisasi data).
  payload_digest crms.sha256_hex,
  source_ip      INET,
  prev_hash      crms.sha256_hex NOT NULL,
  hash           crms.sha256_hex NOT NULL,
  PRIMARY KEY (tenant_id, sequence),
  UNIQUE (tenant_id, hash),
  CONSTRAINT deny_requires_reason
    CHECK (outcome <> 'denied' OR deny_reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS audit_by_actor
  ON crms_audit.event_log (tenant_id, actor_subject, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_by_resource
  ON crms_audit.event_log (tenant_id, resource_kind, resource_id, occurred_at DESC);

-- Rantai ditegakkan basis data: prev_hash wajib sama dengan hash event
-- terakhir tenant, dan sequence wajib menerus tanpa celah.
CREATE OR REPLACE FUNCTION crms_audit.enforce_chain() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  last_seq  BIGINT;
  last_hash crms.sha256_hex;
  genesis CONSTANT TEXT := repeat('0', 64);
BEGIN
  SELECT sequence, hash INTO last_seq, last_hash
    FROM crms_audit.event_log
   WHERE tenant_id = NEW.tenant_id
   ORDER BY sequence DESC
   LIMIT 1;

  IF last_seq IS NULL THEN
    IF NEW.sequence <> 1 THEN
      RAISE EXCEPTION 'AUDIT_SEQUENCE_START: event pertama tenant wajib sequence 1, diterima %', NEW.sequence
        USING ERRCODE = 'raise_exception';
    END IF;
    IF NEW.prev_hash <> genesis THEN
      RAISE EXCEPTION 'AUDIT_GENESIS_EXPECTED: event pertama wajib menautkan genesis hash'
        USING ERRCODE = 'raise_exception';
    END IF;
  ELSE
    IF NEW.sequence <> last_seq + 1 THEN
      RAISE EXCEPTION 'AUDIT_SEQUENCE_GAP: sequence wajib %, diterima %', last_seq + 1, NEW.sequence
        USING ERRCODE = 'raise_exception';
    END IF;
    IF NEW.prev_hash <> last_hash THEN
      RAISE EXCEPTION 'AUDIT_CHAIN_BROKEN: prev_hash tidak sama dengan hash event %', last_seq
        USING ERRCODE = 'raise_exception';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS audit_enforce_chain ON crms_audit.event_log;
CREATE TRIGGER audit_enforce_chain BEFORE INSERT ON crms_audit.event_log
  FOR EACH ROW EXECUTE FUNCTION crms_audit.enforce_chain();

-- Append-only. UPDATE dan DELETE ditolak tanpa kecuali, termasuk oleh pemilik
-- tabel. Hak akses juga tidak diberikan pada 0004; trigger adalah lapis kedua.
CREATE OR REPLACE FUNCTION crms_audit.reject_mutation() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AUDIT_APPEND_ONLY: log audit tidak dapat diubah atau dihapus (%)', TG_OP
    USING ERRCODE = 'raise_exception';
END
$$;

DROP TRIGGER IF EXISTS audit_no_update ON crms_audit.event_log;
CREATE TRIGGER audit_no_update BEFORE UPDATE ON crms_audit.event_log
  FOR EACH ROW EXECUTE FUNCTION crms_audit.reject_mutation();

DROP TRIGGER IF EXISTS audit_no_delete ON crms_audit.event_log;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON crms_audit.event_log
  FOR EACH ROW EXECUTE FUNCTION crms_audit.reject_mutation();

-- Juga tolak TRUNCATE, yang tidak memicu trigger baris.
DROP TRIGGER IF EXISTS audit_no_truncate ON crms_audit.event_log;
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON crms_audit.event_log
  FOR EACH STATEMENT EXECUTE FUNCTION crms_audit.reject_mutation();

-- Verifikasi rantai sisi basis data, dipakai pemeriksaan harian dan auditor.
CREATE OR REPLACE FUNCTION crms_audit.verify_chain(p_tenant UUID)
RETURNS TABLE (sequence BIGINT, code TEXT, detail TEXT)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  r RECORD;
  expected_seq BIGINT := 1;
  expected_prev TEXT := repeat('0', 64);
  last_time TIMESTAMPTZ := NULL;
BEGIN
  FOR r IN
    SELECT * FROM crms_audit.event_log WHERE tenant_id = p_tenant ORDER BY sequence
  LOOP
    IF r.sequence <> expected_seq THEN
      RETURN QUERY SELECT r.sequence, 'SEQUENCE_GAP'::TEXT,
        format('diharapkan %s', expected_seq)::TEXT;
    END IF;
    IF r.prev_hash <> expected_prev THEN
      RETURN QUERY SELECT r.sequence, 'CHAIN_BROKEN'::TEXT,
        'prev_hash tidak menautkan event sebelumnya'::TEXT;
    END IF;
    IF last_time IS NOT NULL AND r.occurred_at < last_time THEN
      RETURN QUERY SELECT r.sequence, 'CLOCK_REGRESSION'::TEXT,
        'occurred_at lebih awal dari event sebelumnya'::TEXT;
    END IF;
    expected_seq := r.sequence + 1;
    expected_prev := r.hash;
    last_time := r.occurred_at;
  END LOOP;
END
$$;

-- Catatan ekspor WORM. Satu baris per ekspor, memuat head hash saat ekspor.
CREATE TABLE IF NOT EXISTS crms_audit.worm_exports (
  tenant_id      UUID NOT NULL REFERENCES crms.institutions(id) ON DELETE RESTRICT,
  id             TEXT NOT NULL,
  from_sequence  BIGINT NOT NULL CHECK (from_sequence > 0),
  to_sequence    BIGINT NOT NULL,
  event_count    BIGINT NOT NULL CHECK (event_count > 0),
  head_hash      crms.sha256_hex NOT NULL,
  manifest_digest crms.sha256_hex NOT NULL,
  target_uri     TEXT NOT NULL,
  exported_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  exported_by    crms.subject_id NOT NULL,
  PRIMARY KEY (tenant_id, id),
  CHECK (to_sequence >= from_sequence)
);

DROP TRIGGER IF EXISTS worm_no_update ON crms_audit.worm_exports;
CREATE TRIGGER worm_no_update BEFORE UPDATE OR DELETE ON crms_audit.worm_exports
  FOR EACH ROW EXECUTE FUNCTION crms_audit.reject_mutation();

COMMIT;
