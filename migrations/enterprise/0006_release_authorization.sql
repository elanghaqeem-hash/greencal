-- 0006 Institutional release authorization / independent validation. Dedicated ENTERPRISE_DB only.
-- No pre-approved banking personnel or fictitious attestations.
PRAGMA foreign_keys=ON;
CREATE TABLE gcx_release_candidates(
 tenant_id TEXT NOT NULL REFERENCES gcx_institutions(id),
 id TEXT NOT NULL,
 commit_sha TEXT NOT NULL CHECK(length(commit_sha)=40),
 build_sha256 TEXT NOT NULL CHECK(length(build_sha256)=64),
 evidence_sha256 TEXT NOT NULL CHECK(length(evidence_sha256)=64),
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'under_review' CHECK(status='under_review'),
 PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES gcx_memberships(tenant_id,subject)
);
CREATE TABLE gcx_release_assignments(
 tenant_id TEXT NOT NULL REFERENCES gcx_institutions(id),
 function TEXT NOT NULL CHECK(function IN ('risk','finance','compliance','it','independent_model_validation')),
 reviewer_subject TEXT NOT NULL,
 reviewer_role TEXT NOT NULL,
 approved_appointment_reference TEXT NOT NULL,
 appointed_by TEXT NOT NULL,
 appointed_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,function),
 UNIQUE(tenant_id,reviewer_subject),
 FOREIGN KEY(tenant_id,reviewer_subject) REFERENCES gcx_memberships(tenant_id,subject),
 FOREIGN KEY(tenant_id,appointed_by) REFERENCES gcx_memberships(tenant_id,subject),
 CHECK(reviewer_subject<>appointed_by)
);
CREATE TABLE gcx_release_reviews(
 tenant_id TEXT NOT NULL,
 candidate_id TEXT NOT NULL,
 function TEXT NOT NULL CHECK(function IN ('risk','finance','compliance','it','independent_model_validation')),
 reviewer_subject TEXT NOT NULL,
 outcome TEXT NOT NULL CHECK(outcome IN ('approved','rejected')),
 evidence_sha256 TEXT NOT NULL CHECK(length(evidence_sha256)=64),
 evidence_reference TEXT NOT NULL,
 attestation TEXT NOT NULL,
 reviewed_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,candidate_id,function),
 UNIQUE(tenant_id,candidate_id,reviewer_subject),
 FOREIGN KEY(tenant_id,candidate_id) REFERENCES gcx_release_candidates(tenant_id,id),
 FOREIGN KEY(tenant_id,reviewer_subject) REFERENCES gcx_memberships(tenant_id,subject)
);
CREATE TRIGGER gcx_release_review_guard BEFORE INSERT ON gcx_release_reviews BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM gcx_release_assignments a
  JOIN gcx_memberships m ON m.tenant_id=a.tenant_id AND m.subject=a.reviewer_subject
  WHERE a.tenant_id=NEW.tenant_id AND a.function=NEW.function
    AND a.reviewer_subject=NEW.reviewer_subject AND a.reviewer_role=m.role AND m.active=1
 ) THEN RAISE(ABORT,'reviewer not independently appointed') END;
 SELECT CASE WHEN EXISTS(
  SELECT 1 FROM gcx_release_candidates c
  WHERE c.tenant_id=NEW.tenant_id AND c.id=NEW.candidate_id
    AND c.created_by=NEW.reviewer_subject
 ) THEN RAISE(ABORT,'candidate author cannot self-attest') END;
END;
CREATE TRIGGER gcx_release_events_candidates AFTER INSERT ON gcx_release_candidates BEGIN
 INSERT INTO gcx_events(tenant_id,actor,action,target,occurred_at)
 VALUES(NEW.tenant_id,NEW.created_by,'release.created',NEW.id,NEW.created_at);
END;
CREATE TRIGGER gcx_release_events_assignments AFTER INSERT ON gcx_release_assignments BEGIN
 INSERT INTO gcx_events(tenant_id,actor,action,target,occurred_at)
 VALUES(NEW.tenant_id,NEW.appointed_by,'release.assigned',NEW.function,NEW.appointed_at);
END;
CREATE TRIGGER gcx_release_events_reviews AFTER INSERT ON gcx_release_reviews BEGIN
 INSERT INTO gcx_events(tenant_id,actor,action,target,occurred_at)
 VALUES(NEW.tenant_id,NEW.reviewer_subject,'release.'||NEW.outcome,NEW.candidate_id||':'||NEW.function,NEW.reviewed_at);
END;
CREATE TRIGGER gcx_release_candidates_frozen_u BEFORE UPDATE ON gcx_release_candidates BEGIN SELECT RAISE(ABORT,'immutable candidate'); END;
CREATE TRIGGER gcx_release_candidates_frozen_d BEFORE DELETE ON gcx_release_candidates BEGIN SELECT RAISE(ABORT,'immutable candidate'); END;
CREATE TRIGGER gcx_release_assignments_frozen_u BEFORE UPDATE ON gcx_release_assignments BEGIN SELECT RAISE(ABORT,'immutable appointment; new controlled migration required'); END;
CREATE TRIGGER gcx_release_assignments_frozen_d BEFORE DELETE ON gcx_release_assignments BEGIN SELECT RAISE(ABORT,'immutable appointment'); END;
CREATE TRIGGER gcx_release_reviews_frozen_u BEFORE UPDATE ON gcx_release_reviews BEGIN SELECT RAISE(ABORT,'immutable review'); END;
CREATE TRIGGER gcx_release_reviews_frozen_d BEFORE DELETE ON gcx_release_reviews BEGIN SELECT RAISE(ABORT,'immutable review'); END;
