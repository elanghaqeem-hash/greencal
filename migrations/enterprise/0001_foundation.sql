-- Dedicated ENTERPRISE_DB only. Never apply this migration to the public DB.
-- No demo institutions, accounts, factors, or portfolio data are seeded.
PRAGMA foreign_keys = ON;
CREATE TABLE gcx_institutions (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, institution_type TEXT NOT NULL CHECK(institution_type IN ('BUS','UUS','BUK','LJK')),
 currency TEXT NOT NULL CHECK(length(currency)=3), active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_at TEXT NOT NULL
);
CREATE TABLE gcx_memberships (
 tenant_id TEXT NOT NULL REFERENCES gcx_institutions(id), subject TEXT NOT NULL,
 email TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('super_administrator','institution_administrator','crms_project_administrator','data_maker','risk_analyst','climate_model_analyst','checker','approver','risk_management_head','compliance_reviewer','sharia_governance_reviewer','executive_viewer','internal_auditor','external_auditor')),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 PRIMARY KEY(tenant_id,subject)
);
CREATE TABLE gcx_records (
 tenant_id TEXT NOT NULL REFERENCES gcx_institutions(id), id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('risk','factor','emission','regulatory_document','requirement')),
 title TEXT NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','checked','approved','rejected','archived')),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0), created_by TEXT NOT NULL, updated_by TEXT NOT NULL,
 checked_by TEXT, approved_by TEXT, reason TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES gcx_memberships(tenant_id,subject),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES gcx_memberships(tenant_id,subject),
 CHECK(checked_by IS NULL OR checked_by<>created_by),
 CHECK(approved_by IS NULL OR (approved_by<>created_by AND approved_by<>checked_by)),
 CHECK(status<>'checked' OR checked_by IS NOT NULL),
 CHECK(status<>'approved' OR (checked_by IS NOT NULL AND approved_by IS NOT NULL))
);
CREATE INDEX gcx_records_list ON gcx_records(tenant_id,kind,status,updated_at DESC);
CREATE TABLE gcx_record_versions (
 tenant_id TEXT NOT NULL, record_id TEXT NOT NULL, revision INTEGER NOT NULL,
 kind TEXT NOT NULL, title TEXT NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)), status TEXT NOT NULL,
 actor TEXT NOT NULL, checked_by TEXT, approved_by TEXT, reason TEXT NOT NULL, occurred_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,record_id,revision), FOREIGN KEY(tenant_id,record_id) REFERENCES gcx_records(tenant_id,id)
);
CREATE TABLE gcx_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL REFERENCES gcx_institutions(id),
 actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, occurred_at TEXT NOT NULL
);
CREATE INDEX gcx_events_tenant ON gcx_events(tenant_id,id DESC);
CREATE TRIGGER gcx_records_created AFTER INSERT ON gcx_records BEGIN
 INSERT INTO gcx_record_versions VALUES(NEW.tenant_id,NEW.id,NEW.revision,NEW.kind,NEW.title,NEW.payload,NEW.status,NEW.updated_by,NEW.checked_by,NEW.approved_by,NEW.reason,NEW.updated_at);
 INSERT INTO gcx_events(tenant_id,actor,action,target,occurred_at) VALUES(NEW.tenant_id,NEW.updated_by,'record.created',NEW.id,NEW.updated_at);
END;
CREATE TRIGGER gcx_records_version_guard BEFORE UPDATE ON gcx_records BEGIN
 SELECT CASE WHEN NEW.revision<>OLD.revision+1 OR NEW.tenant_id<>OLD.tenant_id OR NEW.id<>OLD.id OR NEW.kind<>OLD.kind OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at THEN RAISE(ABORT,'invalid record revision') END;
 SELECT CASE WHEN OLD.status IN ('approved','archived') THEN RAISE(ABORT,'record is frozen; create a superseding record') END;
END;
CREATE TRIGGER gcx_records_updated AFTER UPDATE ON gcx_records BEGIN
 INSERT INTO gcx_record_versions VALUES(NEW.tenant_id,NEW.id,NEW.revision,NEW.kind,NEW.title,NEW.payload,NEW.status,NEW.updated_by,NEW.checked_by,NEW.approved_by,NEW.reason,NEW.updated_at);
 INSERT INTO gcx_events(tenant_id,actor,action,target,occurred_at) VALUES(NEW.tenant_id,NEW.updated_by,'record.'||NEW.status,NEW.id,NEW.updated_at);
END;
CREATE TRIGGER gcx_records_no_delete BEFORE DELETE ON gcx_records BEGIN SELECT RAISE(ABORT,'retention: hard delete prohibited'); END;
CREATE TRIGGER gcx_versions_no_update BEFORE UPDATE ON gcx_record_versions BEGIN SELECT RAISE(ABORT,'immutable version'); END;
CREATE TRIGGER gcx_versions_no_delete BEFORE DELETE ON gcx_record_versions BEGIN SELECT RAISE(ABORT,'immutable version'); END;
CREATE TRIGGER gcx_events_no_update BEFORE UPDATE ON gcx_events BEGIN SELECT RAISE(ABORT,'immutable audit'); END;
CREATE TRIGGER gcx_events_no_delete BEFORE DELETE ON gcx_events BEGIN SELECT RAISE(ABORT,'immutable audit'); END;
