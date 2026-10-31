import importlib.util
from pathlib import Path
import tempfile
import unittest

SCRIPT=Path(__file__).resolve().parents[1]/"scripts"/"migrate-d1-to-postgres.py"
spec=importlib.util.spec_from_file_location("d1_to_pg",SCRIPT)
migration=importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)

class PublicD1MigrationTests(unittest.TestCase):
    def synthetic_source(self,path):
        statements=[]
        for table in migration.TABLES:
            if table=="gc_users":
                statements.append("CREATE TABLE gc_users(id TEXT PRIMARY KEY,email TEXT,role TEXT,salt TEXT,password_hash TEXT,active INTEGER,created_at INTEGER,must_change_password INTEGER,password_updated_at INTEGER);")
                statements.append("INSERT INTO gc_users VALUES('fake_1','example@invalid.test','maker','synthetic-salt','synthetic-hash',1,100,0,200);")
            else:
                statements.append('CREATE TABLE "'+table+'" (id TEXT);')
        path.write_text("\n".join(statements),encoding="utf-8")
    def test_source_integrity_and_no_sensitive_output(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"fake.sql"
            self.synthetic_source(p)
            sha,checks,records=migration.snapshot(p)
            self.assertEqual(len(sha),64)
            self.assertEqual(checks["gc_users"]["count"],1)
            self.assertEqual(checks["gc_state"]["count"],0)
            self.assertEqual(records["gc_users"][0]["password_hash"],"synthetic-hash")
            self.assertNotIn("synthetic-hash",str(checks))
    def test_deterministic_reconciliation_digest(self):
        rows=[{"id":1,"value":"a"},{"id":2,"value":"b"}]
        self.assertEqual(migration.digest(rows),migration.digest(list(reversed(rows))))
        self.assertNotEqual(migration.digest(rows),migration.digest([{"id":1,"value":"c"}]))
    def test_missing_table_fails_closed(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"broken.sql"
            p.write_text("CREATE TABLE gc_users(id TEXT);",encoding="utf-8")
            with self.assertRaisesRegex(ValueError,"Missing D1 tables"):
                migration.snapshot(p)

if __name__=="__main__":
    unittest.main()
