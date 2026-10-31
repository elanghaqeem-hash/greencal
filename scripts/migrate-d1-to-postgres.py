#!/usr/bin/env python3
"""GreenCal PUBLIC D1 SQLite SQL dump -> isolated PostgreSQL copy.
Dry-run by default. Does not change Cloudflare, migrate AI_CONFIG KV or
authorize CRMS Enterprise production access. Requires GREENCAL_POSTGRES_URL
only with --apply. Do NOT commit dumps or credentials.
"""
import argparse
import hashlib
import json
import os
import sqlite3
from pathlib import Path

TABLES=("gc_users","users","ai_settings","gc_state","gc_events",
        "gc_login_limits","gc_public_ai_quota","gc_sessions","sessions")

SCHEMA="""
CREATE TABLE gc_users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('admin','maker')),
 salt TEXT NOT NULL, password_hash TEXT NOT NULL,
 active INTEGER NOT NULL CHECK(active IN (0,1)),
 created_at BIGINT NOT NULL,
 must_change_password INTEGER NOT NULL CHECK(must_change_password IN (0,1)),
 password_updated_at BIGINT
);
CREATE UNIQUE INDEX gc_users_email_ci ON gc_users (lower(email));
CREATE TABLE users (
 id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,
 role TEXT NOT NULL CHECK(role IN ('admin','user')),
 salt TEXT NOT NULL,password_hash TEXT NOT NULL,
 enabled INTEGER NOT NULL,created_at TEXT NOT NULL
);
CREATE TABLE ai_settings (
 id INTEGER PRIMARY KEY CHECK(id=1), provider TEXT NOT NULL,
 model TEXT NOT NULL,encrypted_key TEXT,iv TEXT,updated_by TEXT,
 updated_at TEXT NOT NULL
);
CREATE TABLE gc_state (
 id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL,
 payload TEXT NOT NULL,updated_by TEXT NOT NULL,updated_at BIGINT NOT NULL
);
CREATE TABLE gc_events (
 id TEXT PRIMARY KEY,user_id TEXT,action TEXT NOT NULL,
 target TEXT NOT NULL,created_at BIGINT NOT NULL
);
CREATE TABLE gc_login_limits (
 email TEXT PRIMARY KEY,attempts INTEGER NOT NULL,
 first_at BIGINT NOT NULL,blocked_until BIGINT NOT NULL
);
CREATE TABLE gc_public_ai_quota (
 day TEXT NOT NULL,scope TEXT NOT NULL,
 used INTEGER NOT NULL DEFAULT 0 CHECK(used>=0),PRIMARY KEY(day,scope)
);
CREATE TABLE gc_sessions (
 token_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES gc_users(id) ON DELETE CASCADE,
 expires_at BIGINT NOT NULL
);
CREATE TABLE sessions (
 token_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at BIGINT NOT NULL
);
CREATE TABLE gc_migration_receipts (
 source_file_sha256 TEXT PRIMARY KEY,row_digests_json TEXT NOT NULL,
 migrated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""

def digest(rows):
    canonical=sorted(json.dumps(dict(row),sort_keys=True,separators=(",",":"),
                                ensure_ascii=False,default=str) for row in rows)
    return hashlib.sha256(json.dumps(canonical,ensure_ascii=False,
                                    separators=(",",":")).encode()).hexdigest()

def snapshot(source):
    if not source.is_file() or not 0 < source.stat().st_size <= 128000000:
        raise ValueError("Invalid or oversized source dump")
    raw=source.read_bytes()
    db=sqlite3.connect(":memory:")
    db.row_factory=sqlite3.Row
    db.executescript(raw.decode("utf-8-sig"))
    if db.execute("PRAGMA integrity_check").fetchone()[0]!="ok":
        raise ValueError("Source integrity_check failed")
    if db.execute("PRAGMA foreign_key_check").fetchall():
        raise ValueError("Source foreign_key_check failed")
    names={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if set(TABLES)-names:
        raise ValueError("Missing D1 tables: "+", ".join(sorted(set(TABLES)-names)))
    records={name:[dict(x) for x in db.execute('SELECT * FROM "'+name+'"')]
             for name in TABLES}
    checks={name:{"count":len(rows),"sha256":digest(rows)}
            for name,rows in records.items()}
    db.close()
    return hashlib.sha256(raw).hexdigest(),checks,records

def transfer(dsn,source_hash,checks,records):
    try:
        import psycopg
        from psycopg import sql
        from psycopg.rows import dict_row
    except ImportError as exc:
        raise RuntimeError("Install psycopg[binary] privately") from exc
    # Both schema and rows are atomic. Abort on nonempty/existing destination.
    with psycopg.connect(dsn,sslmode="require",row_factory=dict_row,
                         connect_timeout=10) as pg:
        with pg.transaction():
            with pg.cursor() as cur:
                for name in TABLES:
                    cur.execute("SELECT to_regclass(%s) AS relation",(name,))
                    if cur.fetchone()["relation"] is not None:
                        raise ValueError("Refusing to overwrite table "+name)
                for stmt in SCHEMA.strip().split(";\n"):
                    if stmt.strip():
                        cur.execute(stmt.strip().rstrip(";"))
                for name in TABLES:
                    rows=records[name]
                    if rows:
                        cols=list(rows[0])
                        insert=sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(
                            sql.Identifier(name),
                            sql.SQL(",").join(map(sql.Identifier,cols)),
                            sql.SQL(",").join(sql.Placeholder() for _ in cols))
                        cur.executemany(insert,[tuple(r[c] for c in cols) for r in rows])
                for name in TABLES:
                    cur.execute(sql.SQL("SELECT * FROM {}").format(sql.Identifier(name)))
                    copied=cur.fetchall()
                    if len(copied)!=checks[name]["count"] or digest(copied)!=checks[name]["sha256"]:
                        raise RuntimeError("PostgreSQL reconciliation failed: "+name)
                cur.execute("INSERT INTO gc_migration_receipts(source_file_sha256,row_digests_json) VALUES(%s,%s)",
                            (source_hash,json.dumps(checks,sort_keys=True)))

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("d1_sql_export",type=Path)
    ap.add_argument("--apply",action="store_true",help="Write to EMPTY PostgreSQL")
    args=ap.parse_args()
    source_hash,checks,records=snapshot(args.d1_sql_export)
    if args.apply:
        dsn=os.environ.get("GREENCAL_POSTGRES_URL","")
        if not dsn.startswith(("postgresql://","postgres://")):
            raise ValueError("Missing trusted GREENCAL_POSTGRES_URL environment variable")
        transfer(dsn,source_hash,checks,records)
    print(json.dumps({"scope":"public_d1_only","source_sha256":source_hash,
                      "tables":checks,"verified_sqlite":True,
                      "target_applied":args.apply},sort_keys=True,indent=2))
if __name__=="__main__":
    main()
