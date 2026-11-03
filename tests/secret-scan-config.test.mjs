// Uji WP10: disiplin konfigurasi pemindaian rahasia.
//
// Konfigurasi gitleaks adalah tempat paling mudah untuk melemahkan keamanan
// tanpa terlihat: satu `useDefault = false`, satu berkas yang dikecualikan
// utuh, atau satu regex yang terlalu lebar, dan gate G08 berhenti berguna
// sementara CI tetap hijau. Uji ini menjaga disiplin itu.
//
// Uji ini memeriksa KONFIGURASI, bukan menjalankan gitleaks: biner pemindai
// tidak tersedia pada setiap lingkungan, dan pemindaian riwayat penuh adalah
// pekerjaan CI. Yang dijaga di sini adalah bentuk aturannya.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const CONFIG = '.gitleaks.toml';
const read = (p) => readFile(join(ROOT, p), 'utf8');

/**
 * Mengambil daftar regex allowlist dari TOML tanpa parser penuh.
 * Dibaca per baris, bukan dengan mencari kurung penutup: regex seperti
 * `[A-Z]` memuat `]` sendiri, dan pencarian kurung akan terputus di situ.
 */
function allowlistRegexes(toml) {
  const lines = toml.split('\n');
  const start = lines.findIndex((l) => /^\s*regexes\s*=\s*\[/.test(l));
  assert.ok(start >= 0, 'blok regexes tidak ditemukan pada .gitleaks.toml');
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\s*\]/.test(line)) break;
    const m = line.match(/^\s*'((?:[^'\\]|\\.)*)'\s*,?\s*$/);
    if (m) out.push(m[1]);
  }
  return out;
}

/**
 * Mengompilasi regex gaya Go (RE2) menjadi RegExp JavaScript.
 * gitleaks ditulis dalam Go, sehingga konfigurasinya memakai flag sebaris
 * seperti (?i) yang tidak dikenal JavaScript. Flag itu dipindahkan ke argumen
 * flag agar uji dapat menilai pola yang sama dengan yang dipakai gitleaks.
 */
function compileGoRegex(source) {
  let flags = '';
  let body = source;
  const inline = body.match(/^\(\?([imsU]+)\)/);
  if (inline) {
    if (inline[1].includes('i')) flags += 'i';
    if (inline[1].includes('s')) flags += 's';
    if (inline[1].includes('m')) flags += 'm';
    body = body.slice(inline[0].length);
  }
  return new RegExp(body, flags);
}

/** Blok komentar yang mendahului setiap entri regex. */
function allowlistComments(toml) {
  const lines = toml.split('\n');
  const start = lines.findIndex((l) => /^\s*regexes\s*=\s*\[/.test(l));
  const blocks = [];
  let current = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\s*\]/.test(line)) break;
    if (/^\s*#/.test(line)) { current.push(line); continue; }
    if (/^\s*'/.test(line)) {
      if (current.length) blocks.push(current.join('\n'));
      current = [];
    }
  }
  return blocks;
}

test('seluruh aturan bawaan gitleaks tetap aktif', async () => {
  const toml = await read(CONFIG);
  assert.match(toml, /useDefault\s*=\s*true/,
    'useDefault wajib true; mematikan aturan bawaan membuat gate G08 tidak berguna');
  assert.ok(!/useDefault\s*=\s*false/.test(toml));
  // Tidak ada aturan bawaan yang dihapus lewat stopwords atau daftar hitam.
  assert.ok(!/\[allowlist\.rules\]/.test(toml), 'aturan bawaan tidak boleh dihapus satu per satu');
});

test('tidak ada berkas yang dikecualikan secara utuh', async () => {
  const toml = await read(CONFIG);
  // Pengecualian berbasis path melewati SELURUH isi berkas, termasuk
  // kredensial sungguhan yang kelak masuk ke berkas itu.
  assert.ok(!/^\s*paths\s*=/m.test(toml),
    'pengecualian wajib berupa pola nilai, bukan berkas yang dilewati');
  assert.ok(!/\[\[allowlist\.paths\]\]/.test(toml));
});

test('aturan khusus proyek untuk kata sandi di connection string tetap ada', async () => {
  const toml = await read(CONFIG);
  assert.match(toml, /id\s*=\s*"greencal-postgres-inline-password"/,
    'aturan ini menangkap bentuk kebocoran yang paling mungkin terjadi pada berkas konfigurasi deployment');
  const rule = toml.slice(toml.indexOf('greencal-postgres-inline-password'));
  const regex = (rule.match(/regex\s*=\s*'''([\s\S]*?)'''/) || [])[1];
  assert.ok(regex, 'aturan wajib membawa regex');
  const re = new RegExp(regex);
  // Kontrol positif: kata sandi di dalam connection string tertangkap.
  // Disusun saat uji berjalan, bukan ditulis sebagai literal: aturan ini akan
  // menandai literalnya sendiri, dan berkas uji keamanan yang memicu
  // pemindaiannya sendiri akan mendorong orang melemahkan aturannya.
  const samplePassword = ['Hv7k', 'Q2mZ', 'x9Pw', 'Lt4R'].join('');
  assert.ok(re.test(`postgresql://crms_app:${samplePassword}@db.bank.internal:5432/crms`));
  // Kontrol negatif: connection string TANPA kata sandi tidak tertangkap,
  // karena bentuk itulah yang dipakai berkas contoh deployment.
  assert.ok(!re.test('postgresql://crms_app@db:5432/crms_onprem?sslmode=verify-full'));
  assert.ok(!re.test('postgresql://crms_app@db:5432/crms?passfile=/run/secrets/db_app_passfile'));
});

test('setiap pengecualian menyebut alasan dan tanggal peninjauan ulang', async () => {
  const toml = await read(CONFIG);
  assert.ok(allowlistRegexes(toml).length >= 4);
  const comments = allowlistComments(toml);
  assert.ok(comments.length >= 4, `hanya ${comments.length} blok pengecualian berkomentar`);
  for (const c of comments) {
    assert.match(c, /Alasan:/, `pengecualian tanpa alasan tertulis:\n${c}`);
    assert.match(c, /Peninjauan:\s*\d{4}-\d{2}-\d{2}/,
      `pengecualian tanpa tanggal peninjauan ulang:\n${c}`);
  }
});

test('pengecualian terikat pada bentuk nilai, bukan pada kata yang longgar', async () => {
  const regexes = allowlistRegexes(await read(CONFIG));
  assert.ok(regexes.length >= 4);
  for (const r of regexes) {
    // Regex tanpa jangkar maupun kata penanda akan mencocoki hampir apa pun.
    const anchored = r.startsWith('^') || r.endsWith('$');
    const marked = /(?:synthetic|placeholder|dummy|not[-_]a|ci[-_]only|greencal_)/i.test(r);
    assert.ok(anchored || marked,
      `pengecualian "${r}" tidak berjangkar dan tidak memuat penanda; terlalu longgar`);
    // Pola yang mencocoki string apa pun adalah pintu belakang.
    for (const danger of ['.*', '.+', '[\\s\\S]*']) {
      assert.ok(!r.includes(danger), `pengecualian "${r}" memuat pola menyeluruh ${danger}`);
    }
  }
});

test('pengecualian tidak meloloskan bentuk kredensial yang sudah dikenal', async () => {
  const regexes = allowlistRegexes(await read(CONFIG)).map(compileGoRegex);

  // Kontrol negatif: nilai-nilai ini HARUS tetap tertangkap, artinya tidak satu
  // pun pengecualian boleh mencocokinya.
  //
  // Fixture-nya DISUSUN saat uji berjalan, bukan ditulis sebagai literal.
  // Alasannya langsung: upaya pertama menulisnya sebagai literal ditolak push
  // protection GitHub sebagai Stripe API Key dan Slack API Token. Penolakan itu
  // benar — literal berbentuk kredensial memang tidak boleh ada di repositori,
  // walau nilainya karangan — dan meminta pengecualian untuk nilai karangan
  // akan melatih kebiasaan yang salah. Menyusunnya dari potongan membuat uji
  // tetap bermakna tanpa menyimpan satu pun string berbentuk kredensial.
  const digits = (n, from = 1) => Array.from({ length: n }, (_, i) => (from + i) % 10).join('');
  const lower = (n) => Array.from({ length: n }, (_, i) => String.fromCharCode(97 + (i % 26))).join('');
  const mustNotBeAllowed = [
    ['Hv7k', 'Q2mZ', 'x9Pw', 'Lt4R'].join(''),
    ['sk', 'live', `51${lower(8)}${digits(6)}${lower(10)}`].join('_'),
    ['ghp', `${digits(8)}${lower(12)}${digits(8)}${lower(8)}`].join('_'),
    ['xoxb', digits(12), digits(13), lower(24)].join('-'),
    `${'-'.repeat(5)}BEGIN RSA PRIVATE KEY${'-'.repeat(5)}`,
    `postgresql://crms_app:${'Rahasia'}${'Bank'}${'Sungguhan'}2026@db.bank.internal:5432/crms`,
  ];
  for (const value of mustNotBeAllowed) {
    for (const re of regexes) {
      assert.ok(!re.test(value),
        `pengecualian ${re} meloloskan nilai berbentuk kredensial: ${value.slice(0, 24)}...`);
    }
  }
});

test('nilai yang memang bukan rahasia tercakup pengecualian', async () => {
  const regexes = allowlistRegexes(await read(CONFIG)).map(compileGoRegex);
  const covered = (v) => regexes.some((re) => re.test(v));
  // Kontrol positif: inilah 12 nilai yang ditandai pemindaian riwayat pertama.
  for (const value of [
    'BENSIN-RON-92-PERTAMAX',
    'BENSIN-RON-98-PERTAMAX-TURBO',
    'MINYAK-DEX-SOLAR-CN-53',
    'MINYAK-BIO-SOLAR-CN-48',
    'DELAYED-TRANSITION-2030',
    'PETROCHEMICALS-20-14-16-17-60',
    'greencal_ip_scope_v1_',
    'a'.repeat(64),
    'ci-only-not-a-bank-secret',
    'ci_synthetic_password',
    'synthetic_ci_password_not_a_real_secret',
  ]) {
    assert.ok(covered(value), `nilai bukan rahasia "${value}" tidak tercakup pengecualian`);
  }
});

test('catatan konfigurasi menjelaskan asal setiap pengecualian', async () => {
  const toml = await read(CONFIG);
  // Pengecualian tanpa riwayat pemeriksaan tidak dapat ditinjau ulang oleh
  // orang lain, dan akan diwarisi tanpa pernah dipertanyakan.
  assert.match(toml, /658 commit/, 'catatan wajib menyebut lingkup pemindaian yang memunculkan temuan');
  assert.match(toml, /generic-api-key/, 'catatan wajib menyebut aturan yang memicu');
  assert.match(toml, /12 NILAI unik/, 'catatan wajib menyebut hasil pemeriksaan satu per satu');
});

test('alur kerja CI memakai konfigurasi ini, bukan konfigurasi bawaan', async () => {
  const ci = await read('.github/workflows/onprem-release.yml');
  assert.match(ci, /gitleaks" git \. --config \.gitleaks\.toml/,
    'tanpa --config, CI memakai aturan bawaan tanpa aturan khusus proyek dan tanpa pengecualian terdokumentasi');
  assert.match(ci, /fetch-depth: 0/, 'pemindaian wajib menjangkau seluruh riwayat');
});

test('pemindai dipasang di luar pohon kerja agar tidak memindai dirinya sendiri', async () => {
  const ci = await read('.github/workflows/onprem-release.yml');
  // Pada percobaan pertama, syft dan grype diunduh ke dalam repositori, dan
  // grype melaporkan kerentanan High pada modul Go milik pemindai itu sendiri.
  for (const tool of ['syft', 'grype', 'gitleaks']) {
    const line = ci.split('\n').find((l) => l.includes(`install_tool anchore/${tool}`) || l.includes(`${tool}" version`));
    assert.ok(line, `langkah pemasangan ${tool} tidak ditemukan`);
  }
  assert.ok(!/^\s*run:\s*\.\/(syft|grype|gitleaks)\b/m.test(ci),
    'pemindai dijalankan dari pohon kerja; pasang di $RUNNER_TEMP');
  assert.match(ci, /Pastikan SBOM tidak memuat pemindainya sendiri/,
    'CI wajib memverifikasi SBOM hanya memuat aplikasi');
});
