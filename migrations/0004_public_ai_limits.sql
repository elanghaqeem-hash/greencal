-- Per-anonymous-device daily budget for the public AI endpoint.
CREATE TABLE IF NOT EXISTS gc_public_ai_limits (
  scope_id TEXT NOT NULL,
  day TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(scope_id,day)
);
