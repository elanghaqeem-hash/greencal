-- Buku 6 2026 internal drafts, separate ENTERPRISE_DB only. No OJK official workbook, no bank data seed.
PRAGMA foreign_keys=ON;
CREATE TABLE gcx_book6_workpapers (
 tenant_id TEXT NOT NULL REFERENCES gcx_institutions(id),
 id TEXT NOT NULL,
 reporting_year INTEGER NOT NULL CHECK(reporting_year BETWEEN 2026 AND 2050),
 bank_code TEXT NOT NULL,
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status='draft'),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by TEXT NOT NULL,
 updated_by TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES gcx_memberships(tenant_id,subject),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES gcx_memberships(tenant_id,subject)
);
CREATE INDEX gcx_book6_list ON gcx_book6_workpapers(tenant_id,reporting_year,updated_at DESC);
CREATE TABLE gcx_book6_versions(
 tenant_id TEXT NOT NULL,
 workpaper_id TEXT NOT NULL,
 revision INTEGER NOT NULL,
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 actor TEXT NOT NULL,
 occurred_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,workpaper_id,revision),
 FOREIGN KEY(tenant_id,workpaper_id) REFERENCES gcx_book6_workpapers(tenant_id,id)
);
CREATE TRIGGER gcx_book6_workpaper_insert AFTER INSERT ON gcx_book6_workpapers BEGIN
 INSERT INTO gcx_book6_versions(tenant_id,workpaper_id,revision,payload_json,actor,occurred_at)
 VALUES(NEW.tenant_id,NEW.id,NEW.revision,NEW.payload_json,NEW.updated_by,NEW.updated_at);
 INSERT INTO gcx_events(tenant_id,actor,action,target,occurred_at)
 VALUES(NEW.tenant_id,NEW.updated_by,'book6.draft.created',NEW.id,NEW.updated_at);
END;
CREATE TRIGGER gcx_book6_workpaper_revision BEFORE UPDATE ON gcx_book6_workpapers BEGIN
 SELECT CASE WHEN NEW.tenant_id<>OLD.tenant_id OR NEW.id<>OLD.id OR NEW.created_by<>OLD.created_by
  OR NEW.created_at<>OLD.created_at OR NEW.status<>'draft' OR NEW.revision<>OLD.revision+1
  THEN RAISE(ABORT,'book6 revision/identity cannot be modified') END;
END;
CREATE TRIGGER gcx_book6_workpaper_update AFTER UPDATE ON gcx_book6_workpapers BEGIN
 INSERT INTO gcx_book6_versions(tenant_id,workpaper_id,revision,payload_json,actor,occurred_at)
 VALUES(NEW.tenant_id,NEW.id,NEW.revision,NEW.payload_json,NEW.updated_by,NEW.updated_at);
 INSERT INTO gcx_events(tenant_id,actor,action,target,occurred_at)
 VALUES(NEW.tenant_id,NEW.updated_by,'book6.draft.updated',NEW.id||':'||NEW.revision,NEW.updated_at);
END;
CREATE TRIGGER gcx_book6_workpaper_delete BEFORE DELETE ON gcx_book6_workpapers BEGIN
 SELECT RAISE(ABORT,'book6 evidence cannot be deleted');
END;
CREATE TRIGGER gcx_book6_version_update BEFORE UPDATE ON gcx_book6_versions BEGIN
 SELECT RAISE(ABORT,'book6 version immutable');
END;
CREATE TRIGGER gcx_book6_version_delete BEFORE DELETE ON gcx_book6_versions BEGIN
 SELECT RAISE(ABORT,'book6 version immutable');
END;
