-- OJK CRMS 2026 Buku 5: source-published impact scores. Empty until official annexes are imported.
-- PostgreSQL only; execute after migrations/vercel/0100 and 0101 in a bank-approved transaction.
BEGIN;
CREATE TABLE IF NOT EXISTS gcx_book5_datasets(
 tenant_id TEXT NOT NULL REFERENCES gcx_institutions(id),
 id TEXT NOT NULL,
 version TEXT NOT NULL,
 sha256 TEXT NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 source_reference TEXT NOT NULL,
 latest_data_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(latest_data_confirmed IN(0,1)),
 status TEXT NOT NULL DEFAULT 'loaded_pending_validation'
  CHECK(status IN('loaded_pending_validation','validated','rejected')),
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES gcx_memberships(tenant_id,subject)
);
CREATE TABLE IF NOT EXISTS gcx_book5_scores(
 tenant_id TEXT NOT NULL,
 dataset_id TEXT NOT NULL,
 province TEXT NOT NULL,regency TEXT NOT NULL,district TEXT NOT NULL,
 asset_line TEXT NOT NULL CHECK(asset_line IN('residential','commercial','industrial','other')),
 scenario TEXT NOT NULL CHECK(scenario IN('Net Zero 2050','Delayed Transition','Current Policy')),
 year INTEGER NOT NULL CHECK(year IN(2020,2030,2040,2050)),
 flood NUMERIC(9,6),sea_level_rise NUMERIC(9,6),wildfire NUMERIC(9,6),
 heat_stress NUMERIC(9,6),water_stress NUMERIC(9,6),storm NUMERIC(9,6),combined NUMERIC(9,6),
 PRIMARY KEY(tenant_id,dataset_id,province,regency,district,asset_line,scenario,year),
 FOREIGN KEY(tenant_id,dataset_id) REFERENCES gcx_book5_datasets(tenant_id,id),
 CHECK(flood IS NULL OR flood BETWEEN 0 AND 100),
 CHECK(sea_level_rise IS NULL OR sea_level_rise BETWEEN 0 AND 100),
 CHECK(wildfire IS NULL OR wildfire BETWEEN 0 AND 100),
 CHECK(heat_stress IS NULL OR heat_stress BETWEEN 0 AND 100),
 CHECK(water_stress IS NULL OR water_stress BETWEEN 0 AND 100),
 CHECK(storm IS NULL OR storm BETWEEN 0 AND 100),
 CHECK(combined IS NULL OR combined BETWEEN 0 AND 100)
);
CREATE INDEX IF NOT EXISTS gcx_book5_region_idx ON gcx_book5_scores(tenant_id,dataset_id,province,regency,district);
CREATE FUNCTION gcx_book5_source_audit() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO gcx_events(tenant_id,actor,action,target,occurred_at)
 VALUES(NEW.tenant_id,NEW.created_by,'book5.dataset.created',NEW.id,NEW.created_at);
 RETURN NEW;
END; $$;
CREATE TRIGGER gcx_book5_source_audit_insert AFTER INSERT ON gcx_book5_datasets
 FOR EACH ROW EXECUTE FUNCTION gcx_book5_source_audit();
-- Once verified, content may not be silently rewritten. New vintages require new dataset IDs.
CREATE FUNCTION gcx_book5_score_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') THEN
  RAISE EXCEPTION 'Book 5 source rows are immutable; new dataset version required';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM gcx_book5_datasets
  WHERE tenant_id=NEW.tenant_id AND id=NEW.dataset_id AND status='loaded_pending_validation')
 THEN RAISE EXCEPTION 'Book 5 source must be in staging status for import'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER gcx_book5_scores_guard BEFORE INSERT OR UPDATE OR DELETE ON gcx_book5_scores
 FOR EACH ROW EXECUTE FUNCTION gcx_book5_score_guard();
COMMIT;
