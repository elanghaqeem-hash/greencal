-- 0007 Climate/bank dataset lineage registry, isolated ENTERPRISE_DB only.
-- Records are immutable, reviewer acknowledgements are not regulatory or independent source approval.
PRAGMA foreign_keys=ON;
CREATE TABLE gcx_verified_source_candidates (
 tenant_id TEXT NOT NULL REFERENCES gcx_institutions(id),
 id TEXT NOT NULL,
 source_kind TEXT NOT NULL CHECK(source_kind IN ('cbs','gl','ckpn','ngfs_iamc','hazard_geojson')),
 source_system TEXT NOT NULL,
 source_url TEXT NOT NULL,
 file_sha256 TEXT NOT NULL CHECK(length(file_sha256)=64),
 verification_artifact_sha256 TEXT NOT NULL CHECK(length(verification_artifact_sha256)=64),
 as_of TEXT NOT NULL,
 version TEXT NOT NULL,
 license_reference TEXT NOT NULL,
 submitted_by TEXT NOT NULL,
 submitted_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending_evidence_review' CHECK(status='pending_evidence_review'),
 PRIMARY KEY(tenant_id,id),
 UNIQUE(tenant_id,source_kind,source_system,file_sha256),
 FOREIGN KEY(tenant_id,submitted_by) REFERENCES gcx_memberships(tenant_id,subject)
);
CREATE TABLE gcx_source_attestations (
 tenant_id TEXT NOT NULL,
 source_id TEXT NOT NULL,
 reviewer_function TEXT NOT NULL CHECK(reviewer_function IN ('data_quality','model_validation','authorization')),
 reviewer_subject TEXT NOT NULL,
 reviewer_role TEXT NOT NULL,
 outcome TEXT NOT NULL CHECK(outcome IN ('approved','rejected')),
 evidence_reference TEXT NOT NULL,
 evidence_sha256 TEXT NOT NULL CHECK(length(evidence_sha256)=64),
 attestation TEXT NOT NULL,
 reviewed_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,source_id,reviewer_function),
 UNIQUE(tenant_id,source_id,reviewer_subject),
 FOREIGN KEY(tenant_id,source_id) REFERENCES gcx_verified_source_candidates(tenant_id,id),
 FOREIGN KEY(tenant_id,reviewer_subject) REFERENCES gcx_memberships(tenant_id,subject)
);
CREATE TRIGGER gcx_source_attestation_check BEFORE INSERT ON gcx_source_attestations BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM gcx_memberships m
  JOIN gcx_verified_source_candidates c ON c.tenant_id=m.tenant_id AND c.tenant_id=NEW.tenant_id AND c.id=NEW.source_id
  WHERE m.tenant_id=NEW.tenant_id AND m.subject=NEW.reviewer_subject AND m.active=1 AND m.role=NEW.reviewer_role
   AND m.subject<>c.submitted_by
 ) THEN RAISE(ABORT,'reviewer identity/SoD mismatch') END;
END;
CREATE TRIGGER gcx_source_candidate_event AFTER INSERT ON gcx_verified_source_candidates BEGIN
 INSERT INTO gcx_events(tenant_id,actor,action,target,occurred_at)
 VALUES(NEW.tenant_id,NEW.submitted_by,'source.candidate',NEW.id,NEW.submitted_at);
END;
CREATE TRIGGER gcx_source_attestation_event AFTER INSERT ON gcx_source_attestations BEGIN
 INSERT INTO gcx_events(tenant_id,actor,action,target,occurred_at)
 VALUES(NEW.tenant_id,NEW.reviewer_subject,'source.review.'||NEW.outcome,NEW.source_id||':'||NEW.reviewer_function,NEW.reviewed_at);
END;
CREATE TRIGGER gcx_source_candidate_no_update BEFORE UPDATE ON gcx_verified_source_candidates BEGIN SELECT RAISE(ABORT,'immutable source candidate'); END;
CREATE TRIGGER gcx_source_candidate_no_delete BEFORE DELETE ON gcx_verified_source_candidates BEGIN SELECT RAISE(ABORT,'immutable source candidate'); END;
CREATE TRIGGER gcx_source_review_no_update BEFORE UPDATE ON gcx_source_attestations BEGIN SELECT RAISE(ABORT,'immutable source review'); END;
CREATE TRIGGER gcx_source_review_no_delete BEFORE DELETE ON gcx_source_attestations BEGIN SELECT RAISE(ABORT,'immutable source review'); END;
