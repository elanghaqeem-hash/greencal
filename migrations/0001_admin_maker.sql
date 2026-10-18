-- GreenCal Admin/Maker two-role IAM — additive migration, preserves preexisting tables.
CREATE TABLE IF NOT EXISTS gc_users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL CHECK(role IN ('admin','maker')),
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS gc_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES gc_users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS gc_sessions_exp_idx ON gc_sessions(expires_at);
CREATE TABLE IF NOT EXISTS gc_login_limits (
  email TEXT PRIMARY KEY, attempts INTEGER NOT NULL, first_at INTEGER NOT NULL, blocked_until INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS gc_state (
  id INTEGER PRIMARY KEY CHECK(id=1),
  revision INTEGER NOT NULL, payload TEXT NOT NULL,
  updated_by TEXT NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS gc_events (
  id TEXT PRIMARY KEY, user_id TEXT, action TEXT NOT NULL,
  target TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS gc_events_created_idx ON gc_events(created_at DESC);
