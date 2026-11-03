-- Row-Level Security pada SETIAP tabel bisnis, plus hak akses minimum.
-- Master Execution Prompt v2.0 Bagian 02.3 dan Bagian 07.
--
-- Isolasi tenant tidak boleh bergantung pada klausa WHERE yang ditulis
-- pengembang. Policy di sini berlaku untuk semua kueri, termasuk kueri ad hoc
-- dan laporan, dan FORCE ROW LEVEL SECURITY membuatnya berlaku juga bagi
-- pemilik tabel, sehingga satu-satunya jalan keluar adalah superuser atau
-- peran dengan BYPASSRLS, yang tidak diberikan kepada aplikasi.

BEGIN;
SET search_path = crms, public;

-- ---------------------------------------------------------------------------
-- 1. Terapkan RLS secara menyeluruh
-- ---------------------------------------------------------------------------
-- Dilakukan lewat katalog, bukan daftar manual, agar tabel baru tidak pernah
-- luput. Guard di bagian 4 menolak migrasi berikutnya yang melanggar.

-- Seluruh objek dimiliki crms_owner, bukan superuser, agar jalur superuser
-- tidak dipakai runtime sama sekali.
DO $$
DECLARE o RECORD;
BEGIN
  FOR o IN
    SELECT n.nspname, c.relname, c.relkind
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname IN ('crms', 'crms_audit') AND c.relkind IN ('r', 'S', 'v')
  LOOP
    IF o.relkind = 'r' THEN
      EXECUTE format('ALTER TABLE %I.%I OWNER TO crms_owner', o.nspname, o.relname);
    ELSIF o.relkind = 'S' THEN
      EXECUTE format('ALTER SEQUENCE %I.%I OWNER TO crms_owner', o.nspname, o.relname);
    ELSE
      EXECUTE format('ALTER VIEW %I.%I OWNER TO crms_owner', o.nspname, o.relname);
    END IF;
  END LOOP;
  EXECUTE 'ALTER SCHEMA crms OWNER TO crms_owner';
  EXECUTE 'ALTER SCHEMA crms_audit OWNER TO crms_owner';
END
$$;

DO $$
DECLARE
  t RECORD;
  tenant_col TEXT;
BEGIN
  FOR t IN
    SELECT c.oid, n.nspname, c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname IN ('crms', 'crms_audit')
       AND c.relkind = 'r'
     ORDER BY n.nspname, c.relname
  LOOP
    -- crms.institutions memakai kolom id sebagai identitas tenant.
    IF t.nspname = 'crms' AND t.relname = 'institutions' THEN
      tenant_col := 'id';
    ELSIF EXISTS (
      SELECT 1 FROM pg_attribute a
       WHERE a.attrelid = t.oid AND a.attname = 'tenant_id' AND a.attnum > 0 AND NOT a.attisdropped
    ) THEN
      tenant_col := 'tenant_id';
    ELSE
      CONTINUE;  -- tabel non-tenant, mis. catatan migrasi
    END IF;

    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', t.nspname, t.relname);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', t.nspname, t.relname);

    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I.%I', t.nspname, t.relname);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I.%I
        FOR ALL
        TO crms_app, crms_readonly
        USING (%I = crms.current_tenant())
        WITH CHECK (%I = crms.current_tenant())
    $f$, t.nspname, t.relname, tenant_col, tenant_col);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 1b. Provisioning platform
-- ---------------------------------------------------------------------------
-- FORCE ROW LEVEL SECURITY berlaku juga bagi pemilik tabel, sehingga tanpa
-- policy khusus tidak ada satu pun peran non-superuser yang dapat mendaftarkan
-- institusi baru. Pendaftaran institusi, unit organisasi, dan keanggotaan
-- adalah operasi platform, bukan operasi data bisnis, dan diberikan HANYA pada
-- tiga tabel tersebut untuk crms_owner. Tabel data, run, dan audit tetap
-- terkunci per tenant bahkan bagi pemilik tabel.

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['institutions', 'org_units', 'memberships'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS platform_provisioning ON crms.%I', t);
    EXECUTE format($f$
      CREATE POLICY platform_provisioning ON crms.%I
        FOR ALL TO crms_owner USING (true) WITH CHECK (true)
    $f$, t);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Hak akses minimum
-- ---------------------------------------------------------------------------

REVOKE ALL ON ALL TABLES IN SCHEMA crms, crms_audit FROM PUBLIC;
REVOKE ALL ON SCHEMA crms, crms_audit FROM PUBLIC;
GRANT USAGE ON SCHEMA crms, crms_audit TO crms_app, crms_readonly;

-- Aplikasi: baca dan tulis data bisnis. Tidak ada hak DELETE sama sekali;
-- retensi dijalankan prosedur terkontrol, bukan DELETE sembarang.
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA crms TO crms_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA crms TO crms_app;

-- Log audit: hanya append dan baca. Tidak ada UPDATE, tidak ada DELETE.
GRANT SELECT, INSERT ON crms_audit.event_log TO crms_app;
GRANT SELECT, INSERT ON crms_audit.worm_exports TO crms_app;

-- Auditor internal dan eksternal: hanya baca, termasuk log audit.
GRANT SELECT ON ALL TABLES IN SCHEMA crms TO crms_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA crms_audit TO crms_readonly;

-- Pastikan tabel yang dibuat migrasi berikutnya mewarisi pola yang sama.
ALTER DEFAULT PRIVILEGES IN SCHEMA crms
  GRANT SELECT, INSERT, UPDATE ON TABLES TO crms_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA crms
  GRANT SELECT ON TABLES TO crms_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA crms_audit
  GRANT SELECT, INSERT ON TABLES TO crms_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA crms_audit
  GRANT SELECT ON TABLES TO crms_readonly;

-- ---------------------------------------------------------------------------
-- 3. Larangan tipe pecahan biner
-- ---------------------------------------------------------------------------
-- Nilai finansial wajib NUMERIC. DOUBLE PRECISION dan REAL dilarang karena
-- 0.1 + 0.2 <> 0.3 pada biner. Fungsi ini dipakai uji rilis.

CREATE OR REPLACE FUNCTION crms.find_float_columns()
RETURNS TABLE (schema_name TEXT, table_name TEXT, column_name TEXT, data_type TEXT)
LANGUAGE sql STABLE AS $$
  SELECT n.nspname::TEXT, c.relname::TEXT, a.attname::TEXT, format_type(a.atttypid, a.atttypmod)::TEXT
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname IN ('crms', 'crms_audit')
     AND c.relkind = 'r'
     AND a.attnum > 0 AND NOT a.attisdropped
     AND format_type(a.atttypid, a.atttypmod) IN ('double precision', 'real')
   ORDER BY 1, 2, 3;
$$;

-- ---------------------------------------------------------------------------
-- 4. Guard: tabel ber-tenant tanpa RLS adalah kegagalan rilis
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION crms.find_tables_without_rls()
RETURNS TABLE (schema_name TEXT, table_name TEXT, reason TEXT)
LANGUAGE sql STABLE AS $$
  SELECT n.nspname::TEXT, c.relname::TEXT,
         CASE
           WHEN NOT c.relrowsecurity THEN 'RLS tidak aktif'
           WHEN NOT c.relforcerowsecurity THEN 'FORCE ROW LEVEL SECURITY tidak aktif'
           ELSE 'tidak ada policy tenant_isolation'
         END::TEXT
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname IN ('crms', 'crms_audit')
     AND c.relkind = 'r'
     AND (
       EXISTS (SELECT 1 FROM pg_attribute a
                WHERE a.attrelid = c.oid AND a.attname = 'tenant_id'
                  AND a.attnum > 0 AND NOT a.attisdropped)
       OR (n.nspname = 'crms' AND c.relname = 'institutions')
     )
     AND (
       NOT c.relrowsecurity
       OR NOT c.relforcerowsecurity
       OR NOT EXISTS (SELECT 1 FROM pg_policy p
                       WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation')
     )
   ORDER BY 1, 2;
$$;

-- Jalankan guard sekarang: migrasi gagal bila ada tabel yang luput.
DO $$
DECLARE offenders TEXT;
BEGIN
  SELECT string_agg(format('%s.%s (%s)', schema_name, table_name, reason), '; ')
    INTO offenders FROM crms.find_tables_without_rls();
  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION 'RLS_INCOMPLETE: %', offenders USING ERRCODE = 'raise_exception';
  END IF;

  SELECT string_agg(format('%s.%s.%s is %s', schema_name, table_name, column_name, data_type), '; ')
    INTO offenders FROM crms.find_float_columns();
  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION 'FLOAT_COLUMN_FORBIDDEN: %', offenders USING ERRCODE = 'raise_exception';
  END IF;
END
$$;

GRANT EXECUTE ON FUNCTION crms.find_tables_without_rls(), crms.find_float_columns()
  TO crms_app, crms_readonly;

COMMIT;
