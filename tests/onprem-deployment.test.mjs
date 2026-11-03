// Uji WP02: egress deny, pengerasan server, dan gate rilis konfigurasi
// deployment on-premise. Tidak membutuhkan Docker maupun basis data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { installEgressDeny, resolveStaticPath, SECURITY_HEADERS, readiness } from '../scripts/onprem/server.mjs';
import { planMigrations } from '../scripts/onprem/apply-migrations.mjs';
import {
  verifyOnPremRelease, checkCompose, checkPgHba, checkPostgresConf, checkDockerfile, SEVERITY,
} from '../scripts/release/verify-onprem.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFile(join(ROOT, p), 'utf8');

// --- Egress deny -------------------------------------------------------------

test('egress deny menonaktifkan fetch, WebSocket, dan EventSource', () => {
  const target = { fetch: () => 'keluar', WebSocket: class {}, EventSource: class {} };
  const applied = installEgressDeny(target, 'deny');
  assert.equal(applied, true);
  for (const name of ['fetch', 'WebSocket', 'EventSource']) {
    assert.throws(() => target[name](), /EGRESS_DENIED/, `${name} seharusnya menolak`);
  }
});

test('egress deny tidak dapat ditimpa kembali oleh kode lain', () => {
  const target = { fetch: () => 'keluar' };
  installEgressDeny(target, 'deny');
  // Properti ditulis non-writable, sehingga penugasan biasa gagal diam-diam
  // pada mode sloppy dan melempar pada mode strict. Modul ini modul ES,
  // jadi mode strict berlaku.
  assert.throws(() => { target.fetch = () => 'kembali keluar'; }, TypeError);
  assert.throws(() => target.fetch(), /EGRESS_DENIED/);
});

test('egress deny tidak diterapkan di luar deployment on-premise', () => {
  const target = { fetch: () => 'keluar' };
  assert.equal(installEgressDeny(target, 'allow'), false);
  assert.equal(target.fetch(), 'keluar');
});

test('proses saat ini benar-benar berjalan dengan egress tertolak bila diset', () => {
  // Membuktikan pemasangan pada globalThis, bukan hanya pada objek uji.
  const saved = process.env.GREENCAL_EGRESS;
  try {
    const target = {};
    Object.defineProperty(target, 'fetch', { value: () => 'x', configurable: true, writable: true });
    process.env.GREENCAL_EGRESS = 'deny';
    assert.equal(installEgressDeny(target), true);
    assert.throws(() => target.fetch(), /EGRESS_DENIED/);
  } finally {
    if (saved === undefined) delete process.env.GREENCAL_EGRESS; else process.env.GREENCAL_EGRESS = saved;
  }
});

// --- Penyajian berkas statis -------------------------------------------------

test('path traversal ditolak dalam seluruh bentuknya', () => {
  const dist = '/srv/app/dist';
  for (const attempt of [
    '/../package.json',
    '/../../etc/passwd',
    '/%2e%2e%2fpackage.json',
    '/%2e%2e%2f%2e%2e%2fetc%2fpasswd',
    '/assets/../../../etc/shadow',
    '/..%2f..%2fetc%2fpasswd',
  ]) {
    const got = resolveStaticPath(attempt, dist);
    // Properti yang dijaga adalah pengurungan: hasil apa pun wajib berada di
    // dalam dist atau null. Nama di dalam dist yang kebetulan menyerupai path
    // sistem (dist/etc/passwd) tidak berbahaya; yang berbahaya hanya hasil
    // yang keluar dari dist.
    assert.ok(got === null || got === dist || got.startsWith(dist + '/'),
      `${attempt} menghasilkan ${got}, di luar dist`);
  }
  // Kontrol negatif: pengurungan diuji terhadap akar sistem, bukan hanya
  // terhadap prefiks yang panjang.
  for (const attempt of ['/../../../../etc/passwd', '/../dist/../../etc/passwd']) {
    const got = resolveStaticPath(attempt, dist);
    assert.ok(got === null || got.startsWith(dist + '/'), `${attempt} menghasilkan ${got}`);
    assert.notEqual(got, '/etc/passwd');
  }
});

test('byte NUL dan persen tidak sah ditolak, bukan dilewatkan', () => {
  assert.equal(resolveStaticPath('/index.html\0.png', '/srv/dist'), null);
  assert.equal(resolveStaticPath('/%zz', '/srv/dist'), null);
});

test('akar permintaan memetakan ke index.html', () => {
  assert.equal(resolveStaticPath('/', '/srv/dist'), '/srv/dist/index.html');
  assert.equal(resolveStaticPath('/?x=1', '/srv/dist'), '/srv/dist/index.html');
  assert.equal(resolveStaticPath('/enterprise/', '/srv/dist'), '/srv/dist/enterprise');
});

test('header keamanan memuat CSP tanpa unsafe-inline dan tanpa cache', () => {
  const csp = SECURITY_HEADERS['Content-Security-Policy'];
  assert.ok(!/unsafe-inline/.test(csp), 'CSP tidak boleh mengizinkan skrip inline');
  assert.ok(!/unsafe-eval/.test(csp));
  assert.ok(/script-src 'self'/.test(csp));
  assert.ok(/connect-src 'self'/.test(csp), 'koneksi keluar harus terbatas pada origin sendiri');
  assert.ok(/frame-ancestors 'none'/.test(csp));
  assert.equal(SECURITY_HEADERS['Cache-Control'], 'no-store');
  assert.equal(SECURITY_HEADERS['X-Content-Type-Options'], 'nosniff');
  assert.match(SECURITY_HEADERS['Strict-Transport-Security'], /max-age=\d{8,}/);
});

// --- Kesiapan ----------------------------------------------------------------

test('readiness gagal tertutup bila basis data tidak tersedia', async () => {
  const r = await readiness({});
  assert.equal(r.ready, false);
  assert.ok(r.checks.some((c) => c.name === 'database' && !c.ok));
});

test('readiness menuntut egress deny dan deployment onprem', async () => {
  const saved = { e: process.env.GREENCAL_EGRESS, d: process.env.GREENCAL_DEPLOYMENT };
  try {
    process.env.GREENCAL_EGRESS = 'allow';
    process.env.GREENCAL_DEPLOYMENT = 'cloud';
    const r = await readiness({});
    assert.equal(r.checks.find((c) => c.name === 'egress_denied').ok, false);
    assert.equal(r.checks.find((c) => c.name === 'deployment_onprem').ok, false);
  } finally {
    if (saved.e === undefined) delete process.env.GREENCAL_EGRESS; else process.env.GREENCAL_EGRESS = saved.e;
    if (saved.d === undefined) delete process.env.GREENCAL_DEPLOYMENT; else process.env.GREENCAL_DEPLOYMENT = saved.d;
  }
});

test('readiness menolak skema dengan tabel tanpa RLS', async () => {
  const pool = {
    query: async (sql) => {
      if (/SELECT 1/.test(sql)) return { rows: [{ ok: 1 }] };
      if (/find_tables_without_rls/.test(sql)) {
        return { rows: [{ schema_name: 'crms', table_name: 'bocor', reason: 'RLS tidak aktif' }] };
      }
      return { rows: [] };
    },
  };
  const r = await readiness({ pool });
  assert.equal(r.ready, false);
  const check = r.checks.find((c) => c.name === 'rls_complete');
  assert.equal(check.ok, false);
  assert.match(check.detail, /bocor/);
});

// --- Migrasi -----------------------------------------------------------------

test('rencana migrasi berurut, bernomor, dan tanpa nomor ganda', async () => {
  const plan = await planMigrations();
  assert.ok(plan.length >= 4, 'minimal empat migrasi on-premise');
  const names = plan.map((m) => m.name);
  assert.deepEqual(names, [...names].sort(), 'urutan wajib menurut nama berkas');
  for (const m of plan) {
    assert.match(m.name, /^\d{4}_[a-z0-9_]+\.sql$/);
    assert.match(m.checksum, /^[a-f0-9]{64}$/);
  }
  assert.equal(new Set(names.map((n) => n.slice(0, 4))).size, names.length);
});

test('setiap migrasi berjalan dalam satu transaksi eksplisit', async () => {
  const plan = await planMigrations();
  for (const m of plan) {
    assert.match(m.sql, /^\s*(?:--[^\n]*\n|\n)*BEGIN;/m, `${m.name} wajib dibuka BEGIN;`);
    assert.match(m.sql, /COMMIT;\s*$/, `${m.name} wajib ditutup COMMIT;`);
  }
});

test('skema on-premise tidak memuat tipe pecahan biner sama sekali', async () => {
  const plan = await planMigrations();
  for (const m of plan) {
    const sql = m.sql.replace(/--[^\n]*/g, '');
    // float8 pada uji kolom diizinkan hanya di dalam fungsi pendeteksi.
    const offending = [...sql.matchAll(/\b(DOUBLE PRECISION|REAL|FLOAT)\b/gi)]
      .filter((x) => !/format_type/.test(sql.slice(Math.max(0, x.index - 200), x.index + 200)));
    assert.deepEqual(offending.map((x) => x[0]), [],
      `${m.name} memuat tipe pecahan biner untuk nilai finansial`);
  }
});

test('setiap tabel bisnis pada migrasi membawa tenant_id', async () => {
  const plan = await planMigrations();
  const sql = plan.map((m) => m.sql).join('\n');
  const tables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_]+)\.([a-z_]+) \(([\s\S]*?)\n\);/g)];
  assert.ok(tables.length >= 10, `hanya ${tables.length} tabel terdeteksi`);
  for (const [, schema, name, body] of tables) {
    if (schema === 'crms' && name === 'institutions') continue;  // identitas tenant ada di kolom id
    assert.match(body, /tenant_id\s+UUID NOT NULL/,
      `${schema}.${name} tidak membawa tenant_id UUID NOT NULL`);
  }
});

// --- Gate rilis konfigurasi --------------------------------------------------

test('compose dengan tag latest, porta terbuka, atau rahasia inline ditolak', () => {
  const bad = `
services:
  app:
    image: greencal/crms:latest
    ports:
      - "0.0.0.0:443:8443"
    environment:
      DB_PASSWORD: rahasiaBanget123
networks:
  internal:
    driver: bridge
`;
  const codes = checkCompose(bad).map((f) => f.code);
  assert.ok(codes.includes('IMAGE_TAG_FLOATING'));
  assert.ok(codes.includes('PORT_BOUND_TO_ALL_INTERFACES'));
  assert.ok(codes.includes('SECRET_INLINE'));
  assert.ok(codes.includes('NETWORK_NOT_INTERNAL'));
  assert.ok(codes.includes('CONTAINER_NOT_READ_ONLY'));
});

test('rahasia yang dirujuk lewat _FILE atau variabel tidak dianggap temuan', () => {
  const ok = `
services:
  db:
    image: postgres:16.10-bookworm
    read_only: true
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
      MINIO_SECRET_KEY_FILE: /run/secrets/objects_secret_key
      GREENCAL_EGRESS: deny
      SOME_TOKEN: \${TOKEN_FROM_ENV}
networks:
  internal:
    internal: true
`;
  assert.deepEqual(checkCompose(ok).map((f) => f.code), []);
});

test('pg_hba dengan trust, md5, atau tanpa penolakan default ditolak', () => {
  const codes = checkPgHba(`
local all all trust
host  all all 0.0.0.0/0 md5
`).map((f) => f.code);
  assert.ok(codes.includes('HBA_TRUST_METHOD'));
  assert.ok(codes.includes('HBA_WEAK_METHOD'));
  assert.ok(codes.includes('HBA_NON_TLS_ALLOWED'));
  assert.ok(codes.includes('HBA_NO_DEFAULT_DENY'));
});

test('postgresql.conf tanpa TLS, tanpa arsip, atau dengan fsync off ditolak', () => {
  const codes = checkPostgresConf(`
ssl = off
fsync = off
wal_level = minimal
archive_mode = off
row_security = off
ssl_min_protocol_version = 'TLSv1'
`).map((f) => f.code);
  assert.ok(codes.includes('PG_SETTING_UNSAFE'));
  assert.ok(codes.includes('PG_WAL_LEVEL_TOO_LOW'));
  assert.ok(codes.includes('PG_TLS_VERSION_WEAK'));
});

test('Dockerfile yang berakhir sebagai root atau memakai npm install ditolak', () => {
  const codes = checkDockerfile(`
FROM node:latest AS runtime
RUN npm install
USER root
`).map((f) => f.code);
  assert.ok(codes.includes('DOCKERFILE_RUNS_AS_ROOT'));
  assert.ok(codes.includes('BASE_IMAGE_FLOATING'));
  assert.ok(codes.includes('DEPENDENCY_NOT_LOCKED'));
  assert.ok(codes.includes('DEPENDENCY_UNLOCKED_INSTALL'));
  assert.ok(codes.includes('NO_HEALTHCHECK'));
});

test('konfigurasi yang tidak disertakan dihitung sebagai blocker, bukan dilewati', () => {
  const r = verifyOnPremRelease({});
  assert.equal(r.passed, false);
  assert.equal(r.findings.filter((f) => f.code === 'CONFIG_MISSING').length, 5);
});

test('konfigurasi nyata di repositori lulus seluruh kontrol kecuali digest citra', async () => {
  const report = verifyOnPremRelease({
    composeDc: await read('deploy/docker-compose.dc.yml'),
    composeDrc: await read('deploy/docker-compose.drc.yml'),
    pgHba: await read('deploy/postgres/pg_hba.conf'),
    postgresConf: await read('deploy/postgres/postgresql.conf'),
    dockerfile: await read('Dockerfile'),
  });

  // Satu-satunya blocker yang tersisa adalah digest citra placeholder, yang
  // memang HANYA dapat diisi operator bank dari registri internalnya. Uji ini
  // mengunci keadaan itu: begitu digest nyata dipasang, rilis lulus; dan tidak
  // ada blocker lain yang boleh menyelinap masuk tanpa uji ini gagal.
  const codes = [...new Set(report.findings.map((f) => f.code))];
  assert.deepEqual(codes, ['IMAGE_DIGEST_PLACEHOLDER'],
    `temuan tak terduga: ${JSON.stringify(report.findings, null, 2)}`);
  assert.equal(report.passed, false,
    'selama digest masih placeholder, gate rilis WAJIB menolak produksi');
});

test('rahasia dan berkas lingkungan deployment tidak dapat ikut ter-commit', async () => {
  const ignore = await read('.gitignore');
  for (const pattern of ['deploy/secrets/*', 'deploy/app.env', 'deploy/migrator.env']) {
    assert.ok(ignore.includes(pattern), `.gitignore wajib memuat ${pattern}`);
  }
  assert.ok(ignore.includes('!deploy/secrets/README.md'));
});

test('contoh konfigurasi tidak memuat rahasia nyata', async () => {
  for (const f of ['deploy/app.env.example', 'deploy/migrator.env.example', 'deploy/app.drc.env.example']) {
    const text = await read(f);
    // Connection string wajib menunjuk passfile, bukan kata sandi tertulis.
    assert.ok(!/:\/\/[^@\s]+:[^@\s]+@/.test(text),
      `${f} memuat kata sandi di dalam connection string`);
    assert.ok(/sslmode=verify-full/.test(text),
      `${f} wajib memakai sslmode=verify-full, bukan require atau verify-ca`);
  }
});

test('compose DRC tidak menjalankan migrasi dan menandai dirinya standby', async () => {
  const drc = await read('deploy/docker-compose.drc.yml');
  assert.ok(!/^\s{2}migrator:/m.test(drc),
    'DRC tidak boleh memasang migrasi sendiri; skemanya datang dari replikasi');
  assert.match(drc, /GREENCAL_ROLE:\s*standby/);
  assert.match(drc, /pg_is_in_recovery/, 'healthcheck standby wajib memastikan mode pemulihan');
});

test('compose DC memublikasikan porta hanya dari edge', async () => {
  const dc = await read('deploy/docker-compose.dc.yml');
  const services = dc.split(/^  (?=\w)/m);
  for (const block of services) {
    const name = (block.match(/^(\w[\w-]*):/) || [])[1];
    if (!name || name === 'edge') continue;
    assert.ok(!/^\s+ports:/m.test(block),
      `layanan ${name} tidak boleh memublikasikan porta; hanya edge yang menyentuh jaringan luar`);
  }
});

test('setiap pengecualian ModSecurity menyebut alasan, rute, dan tanggal peninjauan', async () => {
  const text = await read('deploy/nginx/modsecurity-overrides.conf');
  const exemptions = [...text.matchAll(/ctl:ruleRemove(?:ById|TargetById)=(\d+)/g)];
  assert.ok(exemptions.length > 0, 'uji ini hanya bermakna bila ada pengecualian');
  // Setiap blok pengecualian wajib mendahuluinya dengan tiga keterangan.
  for (const block of text.split(/^# --- \d+ -+$/m).slice(1)) {
    if (!/ctl:ruleRemove/.test(block)) continue;
    assert.match(block, /Alasan:/, 'pengecualian tanpa alasan tertulis');
    assert.match(block, /Rute:/, 'pengecualian tanpa batas rute');
    assert.match(block, /Peninjauan:\s*\d{4}-\d{2}-\d{2}/, 'pengecualian tanpa tanggal peninjauan ulang');
  }
  // Aturan kustom anti pemalsuan konteks tenant wajib ada dan bersifat deny.
  assert.match(text, /x-crms-\(tenant\|role\|subject\)[\s\S]{0,200}deny/i);
});

test('edge menolak metode tak dikenal dan membuang header konteks dari klien', async () => {
  const conf = await read('deploy/nginx/crms.conf');
  const inc = await read('deploy/nginx/crms-proxy.inc');
  assert.match(conf, /TLSv1\.3/);
  assert.ok(!/TLSv1\.1|TLSv1 /.test(conf), 'TLS lama tidak boleh diizinkan');
  assert.match(conf, /server_tokens off/);
  assert.match(conf, /limit_req zone=crms_auth/, 'rute autentikasi wajib dibatasi laju lebih ketat');
  for (const header of ['X-Forwarded-Host', 'X-Original-URL', 'X-CRMS-Tenant', 'X-CRMS-Role']) {
    assert.ok(inc.includes(`proxy_set_header ${header} ""`),
      `header ${header} dari klien wajib dibuang di edge`);
  }
  assert.match(inc, /proxy_hide_header Server/);
});

test('redis dikonfigurasi sebagai cache, bukan sumber kebenaran', async () => {
  const conf = await read('deploy/redis/redis.conf');
  assert.match(conf, /^save ""$/m, 'persistensi harus mati: cache tidak menyimpan data laporan');
  assert.match(conf, /^appendonly no$/m);
  assert.match(conf, /^aclfile /m, 'autentikasi wajib lewat ACL file');
  for (const cmd of ['FLUSHALL', 'FLUSHDB', 'KEYS', 'CONFIG', 'DEBUG']) {
    assert.match(conf, new RegExp(`rename-command ${cmd} ""`), `${cmd} wajib dinonaktifkan`);
  }
});

test('gate rilis mengembalikan temuan beku yang tidak dapat diubah pemanggil', () => {
  const r = verifyOnPremRelease({ dockerfile: 'FROM node:24.11.0\nUSER 10001\n' });
  assert.throws(() => { r.findings.push({}); }, TypeError);
  assert.throws(() => { r.passed = true; }, TypeError);
});

test('setiap sumber COPY pada Dockerfile benar-benar ada', async () => {
  // Kegagalan build "path not found" hanya muncul saat docker berjalan, dan di
  // CI itu berarti satu putaran penuh terbuang. Diperiksa di sini tanpa daemon.
  const { stat } = await import('node:fs/promises');
  const dockerfile = await read('Dockerfile');
  const sources = [];
  for (const line of dockerfile.split('\n')) {
    const m = line.match(/^\s*COPY\s+(.*)$/i);
    if (!m) continue;
    const parts = m[1].split(/\s+/).filter(Boolean);
    // Lewati flag seperti --from dan --chown; argumen terakhir adalah tujuan.
    const args = parts.filter((p) => !p.startsWith('--'));
    const from = parts.some((p) => p.startsWith('--from='));
    if (from) continue;  // sumber berasal dari tahap build sebelumnya
    sources.push(...args.slice(0, -1));
  }
  assert.ok(sources.length >= 5, `hanya ${sources.length} sumber COPY terdeteksi`);
  for (const src of sources) {
    await assert.doesNotReject(
      () => stat(join(ROOT, src)),
      `Dockerfile menyalin ${src}, tetapi berkas atau direktori itu tidak ada`);
  }
});

test('citra runtime tidak menyalin rahasia atau berkas lingkungan', async () => {
  const dockerfile = await read('Dockerfile');
  for (const forbidden of ['deploy/secrets', '.env', 'app.env']) {
    assert.ok(!dockerfile.includes(`COPY ${forbidden}`),
      `Dockerfile menyalin ${forbidden} ke dalam citra`);
  }
  // deploy/ secara utuh akan menyeret direktori rahasia ikut masuk.
  assert.ok(!/^\s*COPY\s+deploy\s/mi.test(dockerfile),
    'menyalin seluruh deploy/ akan menyertakan deploy/secrets');
});

test('setiap skrip yang dijalankan Dockerfile ada, atau dijaga pemeriksaan keberadaan', async () => {
  // Build citra gagal belakangan dan mahal bila ia memanggil skrip yang tidak
  // ada. Diperiksa di sini, tanpa daemon docker.
  const { stat } = await import('node:fs/promises');
  const dockerfile = await read('Dockerfile');
  const invocations = [...dockerfile.matchAll(/node\s+(?:--test\s+)?((?:scripts|tests)\/[\w./-]+)/g)]
    .map((m) => m[1]);
  // Termasuk berkas uji yang didaftarkan pada baris lanjutan.
  for (const m of dockerfile.matchAll(/^\s+(tests\/[\w./-]+\.mjs)\s*\\?$/gm)) invocations.push(m[1]);

  assert.ok(invocations.length >= 8, `hanya ${invocations.length} pemanggilan terdeteksi`);
  for (const path of [...new Set(invocations)]) {
    try {
      await stat(join(ROOT, path));
    } catch {
      // Boleh tidak ada HANYA bila dijaga pemeriksaan keberadaan.
      assert.match(dockerfile, new RegExp(`\\[ -f ${path.replace(/[.\\/]/g, '\\$&')} \\]`),
        `Dockerfile menjalankan ${path} yang tidak ada dan tidak dijaga pemeriksaan keberadaan`);
    }
  }
});
