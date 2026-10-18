-- Force-first-password-change for D1 accounts. Additive to migration 0001.
ALTER TABLE gc_users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 1;
ALTER TABLE gc_users ADD COLUMN password_updated_at INTEGER;
CREATE INDEX IF NOT EXISTS gc_login_limits_blocked_idx ON gc_login_limits(blocked_until);
