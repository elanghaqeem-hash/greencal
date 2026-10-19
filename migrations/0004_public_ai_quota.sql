-- P1 optional public AI daily cost guard. Contains pseudonymous network scope only.
-- Never store IP, prompt, debtor data or personal identity.
CREATE TABLE IF NOT EXISTS gc_public_ai_quota (
  day TEXT NOT NULL,
  scope TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0 CHECK(used>=0),
  PRIMARY KEY(day,scope)
);
