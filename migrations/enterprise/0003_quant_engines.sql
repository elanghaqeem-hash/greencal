-- CRMS analytic records. DEDICATED ENTERPRISE_DB only; apply after 0001 and 0002.
-- No real bank data or third-party scenario series is bundled.
PRAGMA foreign_keys=ON;
CREATE TABLE gcx_portfolio_batches (
 tenant_id TEXT NOT NULL REFERENCES gcx_institutions(id),
 id TEXT NOT NULL,
 as_of TEXT NOT NULL,
 currency TEXT NOT NULL CHECK(length(currency)=3),
 source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64),
 source_system TEXT NOT NULL,
 gl_reference TEXT NOT NULL,
 gl_control_total TEXT NOT NULL,
 gl_control_count INTEGER NOT NULL CHECK(gl_control_count>0),
 owner_subject TEXT NOT NULL,
 created_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'reconciled_internal' CHECK(status='reconciled_internal'),
 PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,owner_subject) REFERENCES gcx_memberships(tenant_id,subject)
);
CREATE UNIQUE INDEX gcx_portfolio_source_unique ON gcx_portfolio_batches(tenant_id,source_sha256,as_of);
CREATE TABLE gcx_portfolio_positions (
 tenant_id TEXT NOT NULL,
 batch_id TEXT NOT NULL,
 facility_ref TEXT NOT NULL,
 data_json TEXT NOT NULL CHECK(json_valid(data_json)),
 result_json TEXT NOT NULL CHECK(json_valid(result_json)),
 PRIMARY KEY(tenant_id,batch_id,facility_ref),
 FOREIGN KEY(tenant_id,batch_id) REFERENCES gcx_portfolio_batches(tenant_id,id)
);
CREATE INDEX gcx_positions_batch ON gcx_portfolio_positions(tenant_id,batch_id);
CREATE TABLE gcx_analytic_runs (
 tenant_id TEXT NOT NULL REFERENCES gcx_institutions(id),
 id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('ngfs_interpolation','geospatial_overlay','credit_transmission','book7_standardized','ojk_reconciliation')),
 request_json TEXT NOT NULL CHECK(json_valid(request_json)),
 result_json TEXT NOT NULL CHECK(json_valid(result_json)),
 source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64),
 actor TEXT NOT NULL,
 occurred_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'internal_only' CHECK(status='internal_only'),
 PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,actor) REFERENCES gcx_memberships(tenant_id,subject)
);
CREATE INDEX gcx_analytic_by_tenant ON gcx_analytic_runs(tenant_id,kind,occurred_at DESC);
CREATE TRIGGER gcx_portfolio_batch_audit AFTER INSERT ON gcx_portfolio_batches BEGIN
 INSERT INTO gcx_events(tenant_id,actor,action,target,occurred_at)
 VALUES(NEW.tenant_id,NEW.owner_subject,'quant.portfolio_import',NEW.id,NEW.created_at);
END;
CREATE TRIGGER gcx_analytic_run_audit AFTER INSERT ON gcx_analytic_runs BEGIN
 INSERT INTO gcx_events(tenant_id,actor,action,target,occurred_at)
 VALUES(NEW.tenant_id,NEW.actor,'quant.'||NEW.kind,NEW.id,NEW.occurred_at);
END;
CREATE TRIGGER gcx_batch_frozen_u BEFORE UPDATE ON gcx_portfolio_batches BEGIN SELECT RAISE(ABORT,'immutable import'); END;
CREATE TRIGGER gcx_batch_frozen_d BEFORE DELETE ON gcx_portfolio_batches BEGIN SELECT RAISE(ABORT,'immutable import'); END;
CREATE TRIGGER gcx_positions_frozen_u BEFORE UPDATE ON gcx_portfolio_positions BEGIN SELECT RAISE(ABORT,'immutable positions'); END;
CREATE TRIGGER gcx_positions_frozen_d BEFORE DELETE ON gcx_portfolio_positions BEGIN SELECT RAISE(ABORT,'immutable positions'); END;
CREATE TRIGGER gcx_runs_frozen_u BEFORE UPDATE ON gcx_analytic_runs BEGIN SELECT RAISE(ABORT,'immutable run'); END;
CREATE TRIGGER gcx_runs_frozen_d BEFORE DELETE ON gcx_analytic_runs BEGIN SELECT RAISE(ABORT,'immutable run'); END;
