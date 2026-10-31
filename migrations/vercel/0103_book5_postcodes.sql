-- OJK Book 5 Appendix 2: postcode-to-kecamatan raw-source mapping; intentionally non-unique.
-- Apply only after 0102_book5_physical_risk.sql in a reviewed bank maintenance window.
BEGIN;
CREATE TABLE IF NOT EXISTS gcx_book5_postcode_datasets(
 tenant_id TEXT NOT NULL REFERENCES gcx_institutions(id),
 id TEXT NOT NULL,
 source_sha256 TEXT NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 source_reference TEXT NOT NULL,
 source_version TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'loaded_pending_validation'
 CHECK(status IN('loaded_pending_validation','validated','rejected')),
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES gcx_memberships(tenant_id,subject)
);
CREATE TABLE IF NOT EXISTS gcx_book5_postcodes(
 tenant_id TEXT NOT NULL,
 mapping_id TEXT NOT NULL,
 source_row INTEGER NOT NULL CHECK(source_row>1),
 province_code TEXT,
 province TEXT NOT NULL,
 regency_code TEXT,
 regency TEXT NOT NULL,
 district_code TEXT,
 district TEXT NOT NULL,
 village_code TEXT,
 village TEXT,
 postal_code TEXT NOT NULL CHECK(postal_code ~ '^[0-9]{5}$'),
 book5_id TEXT NOT NULL,
 PRIMARY KEY(tenant_id,mapping_id,source_row),
 FOREIGN KEY(tenant_id,mapping_id) REFERENCES gcx_book5_postcode_datasets(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS gcx_book5_postcodes_lookup
 ON gcx_book5_postcodes(tenant_id,mapping_id,postal_code);
CREATE INDEX IF NOT EXISTS gcx_book5_postcodes_names
 ON gcx_book5_postcodes(tenant_id,mapping_id,province,district);
CREATE FUNCTION gcx_book5_postcode_rows_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP IN('UPDATE','DELETE') THEN RAISE EXCEPTION 'Book 5 mapping evidence immutable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM gcx_book5_postcode_datasets
   WHERE tenant_id=NEW.tenant_id AND id=NEW.mapping_id AND status='loaded_pending_validation')
 THEN RAISE EXCEPTION 'Buku 5 postcode source must be staged for import'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER gcx_book5_postcode_rows_guard_before
 BEFORE INSERT OR UPDATE OR DELETE ON gcx_book5_postcodes
 FOR EACH ROW EXECUTE FUNCTION gcx_book5_postcode_rows_guard();
COMMIT;
