-- GreenCal bank quantitative stage 4. Dedicated ENTERPRISE_DB only.
-- Outputs are immutable internal-analysis artifacts; no official regulatory submission.
PRAGMA foreign_keys=ON;
CREATE TABLE gcx_advanced_runs (
 tenant_id TEXT NOT NULL REFERENCES gcx_institutions(id),
 id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('source_manifest','physical_damage','lifetime_ecl','capital_bridge')),
 input_json TEXT NOT NULL CHECK(json_valid(input_json)),
 output_json TEXT NOT NULL CHECK(json_valid(output_json)),
 input_sha256 TEXT NOT NULL CHECK(length(input_sha256)=64),
 output_sha256 TEXT NOT NULL CHECK(length(output_sha256)=64),
 actor TEXT NOT NULL,
 created_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'internal_only' CHECK(status='internal_only'),
 PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,actor) REFERENCES gcx_memberships(tenant_id,subject)
);
CREATE INDEX gcx_advanced_runs_tenant ON gcx_advanced_runs(tenant_id,kind,created_at DESC);
CREATE TRIGGER gcx_advanced_run_created AFTER INSERT ON gcx_advanced_runs BEGIN
 INSERT INTO gcx_events(tenant_id,actor,action,target,occurred_at)
 VALUES(NEW.tenant_id,NEW.actor,'advanced.'||NEW.kind,NEW.id,NEW.created_at);
END;
CREATE TRIGGER gcx_advanced_runs_no_update BEFORE UPDATE ON gcx_advanced_runs BEGIN
 SELECT RAISE(ABORT,'immutable analytical snapshot');
END;
CREATE TRIGGER gcx_advanced_runs_no_delete BEFORE DELETE ON gcx_advanced_runs BEGIN
 SELECT RAISE(ABORT,'immutable analytical snapshot');
END;
