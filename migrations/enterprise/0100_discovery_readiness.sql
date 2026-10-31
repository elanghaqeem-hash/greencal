-- GreenCal CRMS Enterprise Discovery Readiness — separate institutional D1 only.
-- Apply after enterprise foundation migrations; no institutions, users or bank responses seeded.
PRAGMA foreign_keys=ON;
CREATE TABLE gcx_readiness_assessments(
 tenant_id TEXT NOT NULL REFERENCES gcx_institutions(id),
 id TEXT NOT NULL,
 title TEXT NOT NULL CHECK(length(title) BETWEEN 3 AND 200),
 payload TEXT NOT NULL CHECK(json_valid(payload)),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','checked','approved','rejected')),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by TEXT NOT NULL, updated_by TEXT NOT NULL,
 checked_by TEXT, approved_by TEXT, reason TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
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
CREATE INDEX gcx_readiness_tenant_list ON gcx_readiness_assessments(tenant_id,updated_at DESC,id);
CREATE TABLE gcx_readiness_versions(
 tenant_id TEXT NOT NULL,assessment_id TEXT NOT NULL,revision INTEGER NOT NULL,
 title TEXT NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),
 status TEXT NOT NULL,actor TEXT NOT NULL,checked_by TEXT,approved_by TEXT,
 reason TEXT NOT NULL,occurred_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,assessment_id,revision),
 FOREIGN KEY(tenant_id,assessment_id) REFERENCES gcx_readiness_assessments(tenant_id,id)
);
CREATE TRIGGER gcx_readiness_created AFTER INSERT ON gcx_readiness_assessments BEGIN
 INSERT INTO gcx_readiness_versions VALUES(NEW.tenant_id,NEW.id,NEW.revision,NEW.title,NEW.payload,NEW.status,NEW.updated_by,NEW.checked_by,NEW.approved_by,NEW.reason,NEW.updated_at);
 INSERT INTO gcx_events(tenant_id,actor,action,target,occurred_at) VALUES(NEW.tenant_id,NEW.updated_by,'readiness.created',NEW.id,NEW.updated_at);
END;
CREATE TRIGGER gcx_readiness_revision_guard BEFORE UPDATE ON gcx_readiness_assessments BEGIN
 SELECT CASE WHEN NEW.revision<>OLD.revision+1 OR NEW.tenant_id<>OLD.tenant_id OR NEW.id<>OLD.id OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at THEN RAISE(ABORT,'invalid readiness revision') END;
 SELECT CASE WHEN OLD.status='approved' THEN RAISE(ABORT,'approved readiness snapshot immutable') END;
END;
CREATE TRIGGER gcx_readiness_updated AFTER UPDATE ON gcx_readiness_assessments BEGIN
 INSERT INTO gcx_readiness_versions VALUES(NEW.tenant_id,NEW.id,NEW.revision,NEW.title,NEW.payload,NEW.status,NEW.updated_by,NEW.checked_by,NEW.approved_by,NEW.reason,NEW.updated_at);
 INSERT INTO gcx_events(tenant_id,actor,action,target,occurred_at) VALUES(NEW.tenant_id,NEW.updated_by,'readiness.'||NEW.status,NEW.id,NEW.updated_at);
END;
CREATE TRIGGER gcx_readiness_no_delete BEFORE DELETE ON gcx_readiness_assessments BEGIN SELECT RAISE(ABORT,'readiness retention: hard delete prohibited'); END;
CREATE TRIGGER gcx_readiness_versions_immutable_update BEFORE UPDATE ON gcx_readiness_versions BEGIN SELECT RAISE(ABORT,'immutable readiness evidence'); END;
CREATE TRIGGER gcx_readiness_versions_immutable_delete BEFORE DELETE ON gcx_readiness_versions BEGIN SELECT RAISE(ABORT,'immutable readiness evidence'); END;
