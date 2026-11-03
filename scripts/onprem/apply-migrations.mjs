// Pemasang migrasi on-premise. WP02.
//
// Sifat yang dijaga:
//   - Berurutan dan tercatat. Setiap berkas dijalankan sekali, dalam urutan
//     nama, dan dicatat beserta checksum isinya. Berkas yang berubah setelah
//     terpasang terdeteksi sebagai galat, bukan dijalankan ulang diam-diam.
//   - Satu transaksi per berkas. Berkas yang gagal tidak meninggalkan skema
//     setengah jadi.
//   - Menolak basis data yang namanya tampak seperti produksi bank kecuali
//     operator menyatakannya secara eksplisit.
//
// Pemakaian:
//   GREENCAL_ONPREM_PG_URL=... node scripts/onprem/apply-migrations.mjs
//   tambahkan --dry-run untuk melihat rencana tanpa menjalankan apa pun.

import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const DIR = resolve(import.meta.dirname, '..', '..', 'migrations', 'onprem');
const url = process.env.GREENCAL_ONPREM_PG_URL;
const dryRun = process.argv.includes('--dry-run');
const allowProduction = process.argv.includes('--i-know-this-is-production');

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

export async function planMigrations(dir = DIR) {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const plan = [];
  for (const name of files) {
    const sql = await readFile(join(dir, name), 'utf8');
    if (!/^\d{4}_/.test(name)) {
      throw new Error(`MIGRATION_NAME_INVALID: ${name} wajib berawalan empat angka urut`);
    }
    plan.push({ name, sql, checksum: sha256(sql) });
  }
  const seen = new Set();
  for (const m of plan) {
    const ordinal = m.name.slice(0, 4);
    if (seen.has(ordinal)) throw new Error(`MIGRATION_ORDINAL_DUPLICATE: ${ordinal}`);
    seen.add(ordinal);
  }
  return plan;
}

const LEDGER = `
CREATE TABLE IF NOT EXISTS public.crms_migration_ledger (
  name        TEXT PRIMARY KEY,
  checksum    TEXT NOT NULL,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by  TEXT NOT NULL DEFAULT current_user
)`;

async function main() {
  const plan = await planMigrations();

  if (dryRun) {
    for (const m of plan) process.stdout.write(`${m.name}  ${m.checksum}\n`);
    process.stdout.write(`${plan.length} migrasi siap dijalankan\n`);
    return;
  }

  if (!url) throw new Error('GREENCAL_ONPREM_PG_URL belum ditetapkan');

  const { Client } = await import('pg');
  const client = new Client({ connectionString: url, application_name: 'greencal-migrator' });
  await client.connect();
  try {
    const dbName = (await client.query('SELECT current_database() AS n')).rows[0].n;
    if (/prod|production/i.test(dbName) && !allowProduction) {
      throw new Error(
        `PRODUCTION_GUARD: basis data "${dbName}" tampak produksi; ` +
        'jalankan ulang dengan --i-know-this-is-production setelah persetujuan CAB');
    }

    await client.query(LEDGER);
    const applied = new Map(
      (await client.query('SELECT name, checksum FROM public.crms_migration_ledger')).rows
        .map((r) => [r.name, r.checksum]));

    for (const m of plan) {
      const previous = applied.get(m.name);
      if (previous) {
        if (previous !== m.checksum) {
          throw new Error(
            `MIGRATION_DRIFT: ${m.name} sudah terpasang dengan checksum ${previous} ` +
            `tetapi berkas di repositori kini ${m.checksum}; terbitkan migrasi baru, jangan ubah yang lama`);
        }
        process.stdout.write(`lewati ${m.name} (sudah terpasang)\n`);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query(
          'INSERT INTO public.crms_migration_ledger(name, checksum) VALUES($1,$2)',
          [m.name, m.checksum]);
        await client.query('COMMIT');
        process.stdout.write(`terpasang ${m.name}\n`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`MIGRATION_FAILED: ${m.name}: ${e.message}`);
      }
    }

    // Guard pasca-migrasi: skema wajib lulus pemeriksaannya sendiri.
    const rls = await client.query('SELECT * FROM crms.find_tables_without_rls()');
    if (rls.rows.length) throw new Error(`RLS_INCOMPLETE: ${JSON.stringify(rls.rows)}`);
    const floats = await client.query('SELECT * FROM crms.find_float_columns()');
    if (floats.rows.length) throw new Error(`FLOAT_COLUMN_FORBIDDEN: ${JSON.stringify(floats.rows)}`);
    process.stdout.write('guard pasca-migrasi lulus: RLS lengkap, tidak ada kolom pecahan biner\n');
  } finally {
    await client.end().catch(() => {});
  }
}

if (resolve(process.argv[1] || '') === resolve(import.meta.filename)) {
  main().catch((e) => { process.stderr.write(`${e.message}\n`); process.exit(1); });
}
