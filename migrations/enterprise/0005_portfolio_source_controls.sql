-- Enterprise quantitative source-level reconciliation migration. Dedicated ENTERPRISE_DB ONLY.
-- Existing 0003 unique source SHA index prevented batches from sharing a real source file.
PRAGMA foreign_keys=ON;
DROP INDEX IF EXISTS gcx_portfolio_source_unique;
CREATE UNIQUE INDEX gcx_portfolio_batch_control_key ON gcx_portfolio_batches(tenant_id,source_sha256,as_of,gl_reference);
CREATE TABLE gcx_portfolio_sources (
 tenant_id TEXT NOT NULL REFERENCES gcx_institutions(id),
 source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64),
 as_of TEXT NOT NULL,
 currency TEXT NOT NULL CHECK(length(currency)=3),
 source_system TEXT NOT NULL,
 control_reference TEXT NOT NULL,
 expected_total TEXT NOT NULL,
 expected_count INTEGER NOT NULL CHECK(expected_count>0),
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,source_sha256,as_of),
 FOREIGN KEY(tenant_id,created_by) REFERENCES gcx_memberships(tenant_id,subject)
);
CREATE TRIGGER gcx_sources_inserted AFTER INSERT ON gcx_portfolio_sources BEGIN
 INSERT INTO gcx_events(tenant_id,actor,action,target,occurred_at)
 VALUES(NEW.tenant_id,NEW.created_by,'quant.source_control',NEW.source_sha256,NEW.created_at);
END;
CREATE TRIGGER gcx_sources_no_update BEFORE UPDATE ON gcx_portfolio_sources BEGIN SELECT RAISE(ABORT,'immutable source control'); END;
CREATE TRIGGER gcx_sources_no_delete BEFORE DELETE ON gcx_portfolio_sources BEGIN SELECT RAISE(ABORT,'immutable source control'); END;
-- Reusing one facility across multiple batches from the same source would double-count exposure.
CREATE TRIGGER gcx_positions_unique_source BEFORE INSERT ON gcx_portfolio_positions BEGIN
 SELECT CASE WHEN EXISTS(
 SELECT 1 FROM gcx_portfolio_positions p
 JOIN gcx_portfolio_batches existing ON existing.tenant_id=p.tenant_id AND existing.id=p.batch_id
 JOIN gcx_portfolio_batches candidate ON candidate.tenant_id=NEW.tenant_id AND candidate.id=NEW.batch_id
 WHERE p.tenant_id=NEW.tenant_id AND p.facility_ref=NEW.facility_ref
 AND existing.source_sha256=candidate.source_sha256 AND existing.as_of=candidate.as_of
 ) THEN RAISE(ABORT,'duplicate facility across source batches') END;
END;
