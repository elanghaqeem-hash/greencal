-- PostgreSQL ONLY, dedicated *public* GreenCal AI quota database.
-- Do not apply to any bank ENTERPRISE database. No tokens, users, or PII are copied.
BEGIN;
CREATE TABLE IF NOT EXISTS gc_public_ai_quota(
 day TEXT NOT NULL CHECK(day ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
 scope TEXT NOT NULL CHECK(scope='global' OR scope ~ '^ip:[a-f0-9]{64}$'),
 used INTEGER NOT NULL DEFAULT 0 CHECK(used >= 0 AND used <= 50),
 PRIMARY KEY(day,scope)
);
COMMENT ON TABLE gc_public_ai_quota IS
 'Public aggregate-only AI token budget. IP network scopes are HMAC pseudonyms; no raw addresses or bank data.';
COMMIT;
