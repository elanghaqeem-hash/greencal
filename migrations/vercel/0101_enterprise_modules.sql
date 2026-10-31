-- GreenCal Enterprise PostgreSQL extension. Requires 0100_enterprise_core.sql.
-- Reimplements original D1 0004..0008 + 0100; no bank users/data are seeded.
BEGIN;
CREATE TABLE gcx_advanced_runs(
 tenant_id TEXT NOT NULL REFERENCES gcx_institutions(id),id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN('source_manifest','physical_damage','lifetime_ecl','capital_bridge')),
 input_json TEXT NOT NULL CHECK(input_json IS JSON),
 output_json TEXT NOT NULL CHECK(output_json IS JSON),
 input_sha256 TEXT NOT NULL CHECK(length(input_sha256)=64),
 output_sha256 TEXT NOT NULL CHECK(length(output_sha256)=64),
 actor TEXT NOT NULL,created_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'internal_only' CHECK(status='internal_only'),
 PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,actor) REFERENCES gcx_memberships(tenant_id,subject)
);
CREATE INDEX gcx_advanced_runs_tenant ON gcx_advanced_runs(tenant_id,kind,created_at DESC);
CREATE FUNCTION gcx_advanced_audit() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO gcx_events(tenant_id,actor,action,target,occurred_at)
 VALUES(NEW.tenant_id,NEW.actor,'advanced.'||NEW.kind,NEW.id,NEW.created_at);
 RETURN NEW;
END; $$;
CREATE TRIGGER gcx_advanced_audit_insert AFTER INSERT ON gcx_advanced_runs
 FOR EACH ROW EXECUTE FUNCTION gcx_advanced_audit();
CREATE TRIGGER gcx_advanced_runs_immutable BEFORE UPDATE OR DELETE ON gcx_advanced_runs
 FOR EACH ROW EXECUTE FUNCTION gcx_immutable();

CREATE TABLE gcx_portfolio_sources(
 tenant_id TEXT NOT NULL REFERENCES gcx_institutions(id),
 source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64),
 as_of TEXT NOT NULL,currency TEXT NOT NULL CHECK(length(currency)=3),
 source_system TEXT NOT NULL,control_reference TEXT NOT NULL,
 expected_total TEXT NOT NULL,expected_count INTEGER NOT NULL CHECK(expected_count>0),
 created_by TEXT NOT NULL,created_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,source_sha256,as_of),
 FOREIGN KEY(tenant_id,created_by) REFERENCES gcx_memberships(tenant_id,subject)
);
CREATE FUNCTION gcx_portfolio_source_audit() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO gcx_events(tenant_id,actor,action,target,occurred_at)
 VALUES(NEW.tenant_id,NEW.created_by,'quant.source_control',NEW.source_sha256,NEW.created_at);
 RETURN NEW;
END; $$;
CREATE TRIGGER gcx_portfolio_source_audit_insert AFTER INSERT ON gcx_portfolio_sources
 FOR EACH ROW EXECUTE FUNCTION gcx_portfolio_source_audit();
CREATE TRIGGER gcx_portfolio_sources_immutable BEFORE UPDATE OR DELETE ON gcx_portfolio_sources
 FOR EACH ROW EXECUTE FUNCTION gcx_immutable();
CREATE FUNCTION gcx_positions_unique_source() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(
  SELECT 1 FROM gcx_portfolio_positions p
   JOIN gcx_portfolio_batches existing ON
      existing.tenant_id=p.tenant_id AND existing.id=p.batch_id
   JOIN gcx_portfolio_batches candidate ON
      candidate.tenant_id=NEW.tenant_id AND candidate.id=NEW.batch_id
   WHERE p.tenant_id=NEW.tenant_id AND p.facility_ref=NEW.facility_ref
     AND existing.source_sha256=candidate.source_sha256 AND existing.as_of=candidate.as_of
 ) THEN RAISE EXCEPTION 'duplicate facility across source batches'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER gcx_positions_unique_source_insert BEFORE INSERT ON gcx_portfolio_positions
 FOR EACH ROW EXECUTE FUNCTION gcx_positions_unique_source();

CREATE TABLE gcx_release_candidates(
 tenant_id TEXT NOT NULL REFERENCES gcx_institutions(id),id TEXT NOT NULL,
 commit_sha TEXT NOT NULL CHECK(length(commit_sha)=40),
 build_sha256 TEXT NOT NULL CHECK(length(build_sha256)=64),
 evidence_sha256 TEXT NOT NULL CHECK(length(evidence_sha256)=64),
 created_by TEXT NOT NULL,created_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'under_review' CHECK(status='under_review'),
 PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES gcx_memberships(tenant_id,subject)
);
CREATE TABLE gcx_release_assignments(
 tenant_id TEXT NOT NULL REFERENCES gcx_institutions(id),
 "function" TEXT NOT NULL CHECK("function" IN('risk','finance','compliance','it','independent_model_validation')),
 reviewer_subject TEXT NOT NULL,reviewer_role TEXT NOT NULL,
 approved_appointment_reference TEXT NOT NULL,
 appointed_by TEXT NOT NULL,appointed_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,"function"),UNIQUE(tenant_id,reviewer_subject),
 FOREIGN KEY(tenant_id,reviewer_subject) REFERENCES gcx_memberships(tenant_id,subject),
 FOREIGN KEY(tenant_id,appointed_by) REFERENCES gcx_memberships(tenant_id,subject),
 CHECK(reviewer_subject<>appointed_by)
);
CREATE TABLE gcx_release_reviews(
 tenant_id TEXT NOT NULL,candidate_id TEXT NOT NULL,
 "function" TEXT NOT NULL CHECK("function" IN('risk','finance','compliance','it','independent_model_validation')),
 reviewer_subject TEXT NOT NULL,
 outcome TEXT NOT NULL CHECK(outcome IN('approved','rejected')),
 evidence_sha256 TEXT NOT NULL CHECK(length(evidence_sha256)=64),
 evidence_reference TEXT NOT NULL,attestation TEXT NOT NULL,reviewed_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,candidate_id,"function"),
 UNIQUE(tenant_id,candidate_id,reviewer_subject),
 FOREIGN KEY(tenant_id,candidate_id) REFERENCES gcx_release_candidates(tenant_id,id),
 FOREIGN KEY(tenant_id,reviewer_subject) REFERENCES gcx_memberships(tenant_id,subject)
);
CREATE FUNCTION gcx_release_review_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM gcx_release_assignments a
  JOIN gcx_memberships m ON m.tenant_id=a.tenant_id AND m.subject=a.reviewer_subject
  WHERE a.tenant_id=NEW.tenant_id AND a."function"=NEW."function"
  AND a.reviewer_subject=NEW.reviewer_subject AND a.reviewer_role=m.role AND m.active=1
 ) THEN RAISE EXCEPTION 'reviewer not independently appointed'; END IF;
 IF EXISTS(
  SELECT 1 FROM gcx_release_candidates c
  WHERE c.tenant_id=NEW.tenant_id AND c.id=NEW.candidate_id AND c.created_by=NEW.reviewer_subject
 ) THEN RAISE EXCEPTION 'candidate author cannot self-attest'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER gcx_release_reviews_guard_insert BEFORE INSERT ON gcx_release_reviews
 FOR EACH ROW EXECUTE FUNCTION gcx_release_review_guard();
CREATE FUNCTION gcx_release_audit() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO gcx_events(tenant_id,actor,action,target,occurred_at)
 VALUES(NEW.tenant_id,
 CASE TG_TABLE_NAME WHEN 'gcx_release_candidates' THEN NEW.created_by ELSE NULL END,
 'release.created',NEW.id,NEW.created_at);
 RETURN NEW;
END; $$;
CREATE FUNCTION gcx_release_candidate_audit() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO gcx_events(tenant_id,actor,action,target,occurred_at)
 VALUES(NEW.tenant_id,NEW.created_by,'release.created',NEW.id,NEW.created_at);
 RETURN NEW;
END; $$;
CREATE FUNCTION gcx_release_assignment_audit() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO gcx_events(tenant_id,actor,action,target,occurred_at)
 VALUES(NEW.tenant_id,NEW.appointed_by,'release.assigned',NEW."function",NEW.appointed_at);
 RETURN NEW;
END; $$;
CREATE FUNCTION gcx_release_review_audit() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO gcx_events(tenant_id,actor,action,target,occurred_at)
 VALUES(NEW.tenant_id,NEW.reviewer_subject,'release.'||NEW.outcome,
 NEW.candidate_id||':'||NEW."function",NEW.reviewed_at);
 RETURN NEW;
END; $$;
CREATE TRIGGER gcx_release_candidates_audit_insert AFTER INSERT ON gcx_release_candidates
 FOR EACH ROW EXECUTE FUNCTION gcx_release_candidate_audit();
CREATE TRIGGER gcx_release_assignments_audit_insert AFTER INSERT ON gcx_release_assignments
 FOR EACH ROW EXECUTE FUNCTION gcx_release_assignment_audit();
CREATE TRIGGER gcx_release_reviews_audit_insert AFTER INSERT ON gcx_release_reviews
 FOR EACH ROW EXECUTE FUNCTION gcx_release_review_audit();
CREATE TRIGGER gcx_release_candidates_immutable BEFORE UPDATE OR DELETE ON gcx_release_candidates
 FOR EACH ROW EXECUTE FUNCTION gcx_immutable();
CREATE TRIGGER gcx_release_assignments_immutable BEFORE UPDATE OR DELETE ON gcx_release_assignments
 FOR EACH ROW EXECUTE FUNCTION gcx_immutable();
CREATE TRIGGER gcx_release_reviews_immutable BEFORE UPDATE OR DELETE ON gcx_release_reviews
 FOR EACH ROW EXECUTE FUNCTION gcx_immutable();

CREATE TABLE gcx_verified_source_candidates(
 tenant_id TEXT NOT NULL REFERENCES gcx_institutions(id),id TEXT NOT NULL,
 source_kind TEXT NOT NULL CHECK(source_kind IN ('cbs','gl','ckpn','ngfs_iamc','hazard_geojson')),
 source_system TEXT NOT NULL,source_url TEXT NOT NULL,
 file_sha256 TEXT NOT NULL CHECK(length(file_sha256)=64),
 verification_artifact_sha256 TEXT NOT NULL CHECK(length(verification_artifact_sha256)=64),
 as_of TEXT NOT NULL,version TEXT NOT NULL,license_reference TEXT NOT NULL,
 submitted_by TEXT NOT NULL,submitted_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending_evidence_review' CHECK(status='pending_evidence_review'),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,source_kind,source_system,file_sha256),
 FOREIGN KEY(tenant_id,submitted_by) REFERENCES gcx_memberships(tenant_id,subject)
);
CREATE TABLE gcx_source_attestations(
 tenant_id TEXT NOT NULL,source_id TEXT NOT NULL,
 reviewer_function TEXT NOT NULL CHECK(reviewer_function IN('data_quality','model_validation','authorization')),
 reviewer_subject TEXT NOT NULL,reviewer_role TEXT NOT NULL,
 outcome TEXT NOT NULL CHECK(outcome IN('approved','rejected')),
 evidence_reference TEXT NOT NULL,evidence_sha256 TEXT NOT NULL CHECK(length(evidence_sha256)=64),
 attestation TEXT NOT NULL,reviewed_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,source_id,reviewer_function),
 UNIQUE(tenant_id,source_id,reviewer_subject),
 FOREIGN KEY(tenant_id,source_id) REFERENCES gcx_verified_source_candidates(tenant_id,id),
 FOREIGN KEY(tenant_id,reviewer_subject) REFERENCES gcx_memberships(tenant_id,subject)
);
CREATE FUNCTION gcx_source_review_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM gcx_memberships m JOIN gcx_verified_source_candidates c
   ON c.tenant_id=m.tenant_id AND c.tenant_id=NEW.tenant_id AND c.id=NEW.source_id
  WHERE m.tenant_id=NEW.tenant_id AND m.subject=NEW.reviewer_subject
   AND m.active=1 AND m.role=NEW.reviewer_role AND m.subject<>c.submitted_by
 ) THEN RAISE EXCEPTION 'reviewer identity/SoD mismatch'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER gcx_source_review_guard_insert BEFORE INSERT ON gcx_source_attestations
 FOR EACH ROW EXECUTE FUNCTION gcx_source_review_guard();
CREATE FUNCTION gcx_source_candidate_audit() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO gcx_events(tenant_id,actor,action,target,occurred_at)
 VALUES(NEW.tenant_id,NEW.submitted_by,'source.candidate',NEW.id,NEW.submitted_at);
 RETURN NEW;
END; $$;
CREATE FUNCTION gcx_source_review_audit() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO gcx_events(tenant_id,actor,action,target,occurred_at)
 VALUES(NEW.tenant_id,NEW.reviewer_subject,'source.review.'||NEW.outcome,
 NEW.source_id||':'||NEW.reviewer_function,NEW.reviewed_at);
 RETURN NEW;
END; $$;
CREATE TRIGGER gcx_source_candidates_audit_insert AFTER INSERT ON gcx_verified_source_candidates
 FOR EACH ROW EXECUTE FUNCTION gcx_source_candidate_audit();
CREATE TRIGGER gcx_source_reviews_audit_insert AFTER INSERT ON gcx_source_attestations
 FOR EACH ROW EXECUTE FUNCTION gcx_source_review_audit();
CREATE TRIGGER gcx_verified_source_candidates_immutable BEFORE UPDATE OR DELETE ON gcx_verified_source_candidates
 FOR EACH ROW EXECUTE FUNCTION gcx_immutable();
CREATE TRIGGER gcx_source_attestations_immutable BEFORE UPDATE OR DELETE ON gcx_source_attestations
 FOR EACH ROW EXECUTE FUNCTION gcx_immutable();

CREATE TABLE gcx_book6_workpapers(
 tenant_id TEXT NOT NULL REFERENCES gcx_institutions(id),id TEXT NOT NULL,
 reporting_year INTEGER NOT NULL CHECK(reporting_year BETWEEN 2026 AND 2050),
 bank_code TEXT NOT NULL,payload_json TEXT NOT NULL CHECK(payload_json IS JSON),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status='draft'),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by TEXT NOT NULL,updated_by TEXT NOT NULL,
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES gcx_memberships(tenant_id,subject),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES gcx_memberships(tenant_id,subject)
);
CREATE INDEX gcx_book6_list ON gcx_book6_workpapers(tenant_id,reporting_year,updated_at DESC);
CREATE TABLE gcx_book6_versions(
 tenant_id TEXT NOT NULL,workpaper_id TEXT NOT NULL,revision INTEGER NOT NULL,
 payload_json TEXT NOT NULL CHECK(payload_json IS JSON),
 actor TEXT NOT NULL,occurred_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,workpaper_id,revision),
 FOREIGN KEY(tenant_id,workpaper_id) REFERENCES gcx_book6_workpapers(tenant_id,id)
);
CREATE FUNCTION gcx_book6_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.status<>'draft'
    OR NEW.revision<>OLD.revision+1 THEN
  RAISE EXCEPTION 'book6 revision/identity cannot be modified';
 END IF;
 RETURN NEW;
END; $$;
CREATE FUNCTION gcx_book6_capture() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO gcx_book6_versions(tenant_id,workpaper_id,revision,payload_json,actor,occurred_at)
 VALUES(NEW.tenant_id,NEW.id,NEW.revision,NEW.payload_json,NEW.updated_by,NEW.updated_at);
 INSERT INTO gcx_events(tenant_id,actor,action,target,occurred_at)
 VALUES(NEW.tenant_id,NEW.updated_by,
  CASE WHEN TG_OP='INSERT' THEN 'book6.draft.created' ELSE 'book6.draft.updated' END,
  CASE WHEN TG_OP='INSERT' THEN NEW.id ELSE NEW.id||':'||NEW.revision END,NEW.updated_at);
 RETURN NEW;
END; $$;
CREATE TRIGGER gcx_book6_guard_update BEFORE UPDATE ON gcx_book6_workpapers
 FOR EACH ROW EXECUTE FUNCTION gcx_book6_guard();
CREATE TRIGGER gcx_book6_capture_audit AFTER INSERT OR UPDATE ON gcx_book6_workpapers
 FOR EACH ROW EXECUTE FUNCTION gcx_book6_capture();
CREATE TRIGGER gcx_book6_workpapers_immutable_delete BEFORE DELETE ON gcx_book6_workpapers
 FOR EACH ROW EXECUTE FUNCTION gcx_immutable();
CREATE TRIGGER gcx_book6_versions_immutable BEFORE UPDATE OR DELETE ON gcx_book6_versions
 FOR EACH ROW EXECUTE FUNCTION gcx_immutable();

CREATE TABLE gcx_readiness_assessments(
 tenant_id TEXT NOT NULL REFERENCES gcx_institutions(id),id TEXT NOT NULL,
 title TEXT NOT NULL CHECK(length(title) BETWEEN 3 AND 200),
 payload TEXT NOT NULL CHECK(payload IS JSON),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','submitted','checked','approved','rejected')),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by TEXT NOT NULL,updated_by TEXT NOT NULL,
 checked_by TEXT,approved_by TEXT,reason TEXT NOT NULL DEFAULT '',
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
 title TEXT NOT NULL,payload TEXT NOT NULL CHECK(payload IS JSON),
 status TEXT NOT NULL,actor TEXT NOT NULL,checked_by TEXT,approved_by TEXT,
 reason TEXT NOT NULL,occurred_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,assessment_id,revision),
 FOREIGN KEY(tenant_id,assessment_id) REFERENCES gcx_readiness_assessments(tenant_id,id)
);
CREATE FUNCTION gcx_readiness_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.revision<>OLD.revision+1 OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
   OR NEW.id IS DISTINCT FROM OLD.id OR NEW.created_by IS DISTINCT FROM OLD.created_by
   OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
  RAISE EXCEPTION 'invalid readiness revision';
 END IF;
 IF OLD.status='approved' THEN RAISE EXCEPTION 'approved readiness snapshot immutable'; END IF;
 RETURN NEW;
END; $$;
CREATE FUNCTION gcx_readiness_capture() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO gcx_readiness_versions
  (tenant_id,assessment_id,revision,title,payload,status,actor,checked_by,approved_by,reason,occurred_at)
 VALUES(NEW.tenant_id,NEW.id,NEW.revision,NEW.title,NEW.payload,NEW.status,
  NEW.updated_by,NEW.checked_by,NEW.approved_by,NEW.reason,NEW.updated_at);
 INSERT INTO gcx_events(tenant_id,actor,action,target,occurred_at)
 VALUES(NEW.tenant_id,NEW.updated_by,
  CASE WHEN TG_OP='INSERT' THEN 'readiness.created' ELSE 'readiness.'||NEW.status END,
  NEW.id,NEW.updated_at);
 RETURN NEW;
END; $$;
CREATE TRIGGER gcx_readiness_guard_update BEFORE UPDATE ON gcx_readiness_assessments
 FOR EACH ROW EXECUTE FUNCTION gcx_readiness_guard();
CREATE TRIGGER gcx_readiness_capture_audit AFTER INSERT OR UPDATE ON gcx_readiness_assessments
 FOR EACH ROW EXECUTE FUNCTION gcx_readiness_capture();
CREATE TRIGGER gcx_readiness_immutable_delete BEFORE DELETE ON gcx_readiness_assessments
 FOR EACH ROW EXECUTE FUNCTION gcx_immutable();
CREATE TRIGGER gcx_readiness_versions_immutable BEFORE UPDATE OR DELETE ON gcx_readiness_versions
 FOR EACH ROW EXECUTE FUNCTION gcx_immutable();
COMMIT;
