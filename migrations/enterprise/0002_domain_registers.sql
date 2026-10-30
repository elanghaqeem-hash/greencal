-- GreenCal CRMS Enterprise domain-register increment (staging only).
-- Separate extension table: preserve the five existing kinds and every frozen historical record.
-- Requires 0001_foundation.sql on a DEDICATED ENTERPRISE_DB, never the public DB.
PRAGMA foreign_keys=ON;
CREATE TABLE gcx_domain_records (
 tenant_id TEXT NOT NULL REFERENCES gcx_institutions(id),
 id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('governance','portfolio','scenario','physical','transition','report_package')),
 title TEXT NOT NULL,
 payload TEXT NOT NULL CHECK(json_valid(payload)),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','checked','approved','rejected','archived')),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by TEXT NOT NULL, updated_by TEXT NOT NULL,
 checked_by TEXT, approved_by TEXT, reason TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES gcx_memberships(tenant_id,subject),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES gcx_memberships(tenant_id,subject),
 FOREIGN KEY(tenant_id,checked_by) REFERENCES gcx_memberships(tenant_id,subject),
 FOREIGN KEY(tenant_id,approved_by) REFERENCES gcx_memberships(tenant_id,subject),
 CHECK(checked_by IS NULL OR checked_by<>created_by),
 CHECK(approved_by IS NULL OR (approved_by<>created_by AND approved_by<>checked_by)),
 CHECK(status<>'checked' OR checked_by IS NOT NULL),
 CHECK(status<>'approved' OR (checked_by IS NOT NULL AND approved_by IS NOT NULL))
);
CREATE INDEX gcx_domain_list ON gcx_domain_records(tenant_id,kind,status,updated_at DESC);
CREATE TABLE gcx_domain_versions (
 tenant_id TEXT NOT NULL, record_id TEXT NOT NULL, revision INTEGER NOT NULL,
 kind TEXT NOT NULL, title TEXT NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)),
 status TEXT NOT NULL, actor TEXT NOT NULL, checked_by TEXT, approved_by TEXT,
 reason TEXT NOT NULL, occurred_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,record_id,revision),
 FOREIGN KEY(tenant_id,record_id) REFERENCES gcx_domain_records(tenant_id,id)
);
CREATE TRIGGER gcx_domain_created AFTER INSERT ON gcx_domain_records BEGIN
 INSERT INTO gcx_domain_versions VALUES(NEW.tenant_id,NEW.id,NEW.revision,NEW.kind,NEW.title,NEW.payload,NEW.status,NEW.updated_by,NEW.checked_by,NEW.approved_by,NEW.reason,NEW.updated_at);
 INSERT INTO gcx_events(tenant_id,actor,action,target,occurred_at) VALUES(NEW.tenant_id,NEW.updated_by,'domain.created',NEW.id,NEW.updated_at);
END;
CREATE TRIGGER gcx_domain_version_guard BEFORE UPDATE ON gcx_domain_records BEGIN
 SELECT CASE WHEN NEW.revision<>OLD.revision+1 OR NEW.tenant_id<>OLD.tenant_id OR NEW.id<>OLD.id OR NEW.kind<>OLD.kind OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at THEN RAISE(ABORT,'invalid domain revision') END;
 SELECT CASE WHEN OLD.status IN ('approved','archived') THEN RAISE(ABORT,'domain record frozen') END;
END;
CREATE TRIGGER gcx_domain_updated AFTER UPDATE ON gcx_domain_records BEGIN
 INSERT INTO gcx_domain_versions VALUES(NEW.tenant_id,NEW.id,NEW.revision,NEW.kind,NEW.title,NEW.payload,NEW.status,NEW.updated_by,NEW.checked_by,NEW.approved_by,NEW.reason,NEW.updated_at);
 INSERT INTO gcx_events(tenant_id,actor,action,target,occurred_at) VALUES(NEW.tenant_id,NEW.updated_by,'domain.'||NEW.status,NEW.id,NEW.updated_at);
END;
CREATE TRIGGER gcx_domain_no_delete BEFORE DELETE ON gcx_domain_records BEGIN SELECT RAISE(ABORT,'domain retention: hard delete prohibited'); END;
CREATE TRIGGER gcx_domain_versions_no_update BEFORE UPDATE ON gcx_domain_versions BEGIN SELECT RAISE(ABORT,'immutable domain version'); END;
CREATE TRIGGER gcx_domain_versions_no_delete BEFORE DELETE ON gcx_domain_versions BEGIN SELECT RAISE(ABORT,'immutable domain version'); END;
