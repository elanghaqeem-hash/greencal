-- GreenCal anonymous user workspace. Existing shared state is deliberately untouched.
-- scope_id is HMAC-SHA256 of Cloudflare-observed network IP with IP_SCOPE_SECRET.
CREATE TABLE IF NOT EXISTS gc_public_state (
  scope_id TEXT PRIMARY KEY NOT NULL CHECK(length(scope_id)=64),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
  payload TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS gc_public_state_updated_idx ON gc_public_state(updated_at);
