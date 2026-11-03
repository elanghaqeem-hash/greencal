// Uji WP09: design system "Fresh Green Finance".
// Kontras WCAG 2.2 AA dihitung, bukan diklaim; mode terang dan gelap sama-sama
// diperiksa; font wajib dihosting sendiri karena deployment menolak egress.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  parseHex, relativeLuminance, contrastRatio, ratio, parseTokens, readTokens,
  audit, REQUIRED_PAIRS, WCAG, TOKENS_PATH,
} from '../scripts/design/contrast.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFile(join(ROOT, p), 'utf8');

// --- Kalkulator kontras ------------------------------------------------------

test('kalkulator kontras sesuai nilai rujukan WCAG', () => {
  // Nilai rujukan yang diketahui: hitam di atas putih tepat 21:1.
  assert.equal(ratio('#000000', '#ffffff'), 21);
  assert.equal(ratio('#ffffff', '#ffffff'), 1);
  // Urutan argumen tidak boleh mengubah hasil.
  assert.equal(ratio('#000000', '#ffffff'), ratio('#ffffff', '#000000'));
  // Abu-abu web 50% terhadap putih; nilai rujukan 3.94:1.
  assert.equal(ratio('#808080', '#ffffff'), 3.94);
  // Luminance relatif pada ujung skala.
  assert.equal(relativeLuminance('#000000'), 0);
  assert.equal(relativeLuminance('#ffffff'), 1);
});

test('pembulatan rasio selalu ke bawah agar 4.499 tidak tampak lulus', () => {
  // Dibulatkan ke bawah, bukan ke terdekat: nilai di bawah ambang tidak boleh
  // pernah tampil sebagai nilai yang memenuhi ambang.
  const almost = contrastRatio('#767676', '#ffffff');
  assert.ok(almost >= 4.5, 'kontrol: #767676 memang lulus AA terhadap putih');
  assert.ok(ratio('#767676', '#ffffff') <= almost);
});

test('notasi heks tiga digit dan berawalan kres sama-sama diterima', () => {
  assert.deepEqual(parseHex('#fff'), [255, 255, 255]);
  assert.deepEqual(parseHex('000'), [0, 0, 0]);
  assert.deepEqual(parseHex('#0C6349'), [12, 99, 73]);
  assert.throws(() => parseHex('bukan-warna'), /WARNA_TIDAK_SAH/);
  assert.throws(() => parseHex('#12345'), /WARNA_TIDAK_SAH/);
});

test('pembaca token memisahkan mode terang dan gelap, dengan pewarisan', () => {
  const { light, dark } = parseTokens(`
    :root { --color-bg: #ffffff; --color-text: #000000; --space-1: 4px; }
    :root[data-theme='dark'] { --color-bg: #000000; }
  `);
  assert.equal(light['--color-bg'], '#ffffff');
  assert.equal(dark['--color-bg'], '#000000');
  // Token yang tidak ditimpa mode gelap diwarisi, sama seperti perilaku CSS.
  assert.equal(dark['--color-text'], '#000000');
  // Nilai non-warna tidak masuk peta warna.
  assert.equal(light['--space-1'], undefined);
});

// --- Kontras token nyata -----------------------------------------------------

test('SELURUH pasangan token lulus WCAG 2.2 AA pada mode terang dan gelap', async () => {
  const results = audit(await readTokens());
  const failed = results.filter((r) => !r.passed);
  assert.deepEqual(
    failed.map((f) => `${f.scheme} ${f.what}: ${f.ratio ?? f.detail} (min ${f.min})`),
    [],
    'ada pasangan di bawah ambang AA',
  );
  // Kontrol: daftar pasangan tidak boleh menyusut diam-diam.
  assert.ok(results.length >= 40, `hanya ${results.length} pasangan diperiksa`);
  assert.equal(results.length, REQUIRED_PAIRS.length * 2);
});

test('teks utama jauh di atas ambang, bukan sekadar lewat', async () => {
  const t = await readTokens();
  for (const scheme of ['light', 'dark']) {
    const r = ratio(t[scheme]['--color-text'], t[scheme]['--color-surface']);
    assert.ok(r >= WCAG.AAA_TEXT,
      `teks utama ${scheme} hanya ${r}:1; teks yang dibaca sepanjang hari sebaiknya mencapai AAA`);
  }
});

test('warna di atas merek dipilih agar tombol utama terbaca, bukan diwarisi', async () => {
  const t = await readTokens();
  // Mode gelap TIDAK boleh memakai putih di atas hijau terang: kontrasnya
  // jatuh. Token --color-on-brand wajib berbeda antar mode.
  assert.notEqual(t.light['--color-on-brand'], t.dark['--color-on-brand'],
    'mode gelap wajib punya warna sendiri di atas merek; inversi saja tidak cukup');
  for (const scheme of ['light', 'dark']) {
    assert.ok(ratio(t[scheme]['--color-on-brand'], t[scheme]['--color-brand']) >= WCAG.AA_TEXT);
  }
});

test('setiap seri data berbeda satu dari yang lain, bukan hanya dari latar', async () => {
  const t = await readTokens();
  const keys = ['--color-chart-1', '--color-chart-2', '--color-chart-3', '--color-chart-4', '--color-chart-5'];
  for (const scheme of ['light', 'dark']) {
    const hexes = keys.map((k) => t[scheme][k]);
    assert.equal(new Set(hexes).size, keys.length, `seri data ${scheme} ada yang kembar`);
    // Seri berurutan menurut terang wajib terpisah setidaknya 1.15:1 satu dari
    // yang lain. WCAG tidak mengatur hal ini, tetapi tanpa pemisahan terang,
    // diagram menjadi tidak terbaca pada cetakan hitam putih dan bagi pembaca
    // dengan defisiensi penglihatan warna; warna akan menjadi satu-satunya
    // pembawa makna, yang dilarang WCAG 1.4.1.
    const sorted = [...hexes].sort((a, b) => relativeLuminance(a) - relativeLuminance(b));
    for (let i = 1; i < sorted.length; i += 1) {
      const step = ratio(sorted[i], sorted[i - 1]);
      assert.ok(step >= 1.15,
        `seri data ${scheme}: ${sorted[i - 1]} dan ${sorted[i]} hanya terpisah ${step}:1 dalam terang`);
    }
  }
});

test('cincin fokus bukan warna merek, agar terlihat di atas kontrol aktif', async () => {
  const t = await readTokens();
  for (const scheme of ['light', 'dark']) {
    assert.notEqual(t[scheme]['--color-focus-ring'], t[scheme]['--color-brand'],
      'cincin fokus sewarna merek menghilang tepat di atas tombol utama');
    assert.ok(ratio(t[scheme]['--color-focus-ring'], t[scheme]['--color-brand']) >= 1.5,
      `cincin fokus ${scheme} terlalu dekat dengan warna merek`);
  }
});

// --- Font dihosting sendiri --------------------------------------------------

test('tidak ada permintaan font atau CSS ke host luar', async () => {
  const css = await read(TOKENS_PATH);
  // Deployment on-premise menolak egress: font dari CDN tidak akan pernah tiba.
  for (const host of ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs', 'jsdelivr', 'unpkg', 'cdn.']) {
    assert.ok(!css.includes(host), `${TOKENS_PATH} merujuk host luar ${host}`);
  }
  assert.ok(!/@import\s+url\(\s*['"]?https?:/.test(css), 'tidak boleh ada @import dari internet');
  for (const m of css.matchAll(/url\(\s*['"]?([^'")]+)/g)) {
    assert.ok(!/^https?:/.test(m[1]), `url absolut ke internet: ${m[1]}`);
  }
});

test('berkas font yang dirujuk benar-benar ada dan berukuran wajar', async () => {
  const css = await read(TOKENS_PATH);
  const refs = [...css.matchAll(/url\(\s*['"]?([^'")]+\.woff2)/g)].map((m) => m[1]);
  assert.ok(refs.length >= 4, `hanya ${refs.length} font dirujuk`);
  for (const ref of [...new Set(refs)]) {
    const meta = await stat(join(ROOT, 'assets', ref));
    assert.ok(meta.isFile(), `${ref} tidak ada`);
    assert.ok(meta.size > 5000, `${ref} terlalu kecil untuk font sungguhan`);
    assert.ok(meta.size < 400000, `${ref} terlalu besar; subset latin saja yang dipakai`);
  }
});

test('lisensi font disertakan, karena font dihosting sendiri', async () => {
  const license = await read('assets/fonts/inter-OFL-1.1.txt');
  assert.match(license, /SIL Open Font License/);
  assert.match(await read(TOKENS_PATH), /Open Font License/,
    'stylesheet wajib menyebut lisensi dan lokasi salinannya');
});

test('hanya berat font yang benar-benar tersedia yang dideklarasikan', async () => {
  const css = await read(TOKENS_PATH);
  const faces = [...css.matchAll(/@font-face\s*\{([\s\S]*?)\}/g)].map((m) => m[1]);
  assert.ok(faces.length >= 4);
  for (const face of faces) {
    const weight = (face.match(/font-weight:\s*(\d+)/) || [])[1];
    const file = (face.match(/url\(\s*['"]?([^'")]+)/) || [])[1];
    assert.ok(weight && file, 'setiap @font-face wajib menyebut berat dan berkas');
    assert.ok(file.includes(`-${weight}-`),
      `berat ${weight} menunjuk ${file}; berat yang tidak cocok membuat peramban mensintesis huruf`);
    assert.match(face, /font-display:\s*swap/,
      'font-display wajib swap agar teks tampil walau font belum selesai dimuat');
  }
});

// --- Aksesibilitas struktural -----------------------------------------------

test('fokus tidak pernah dihapus tanpa pengganti', async () => {
  const css = await read(TOKENS_PATH);
  assert.match(css, /:focus-visible/);
  assert.match(css, /outline:\s*var\(--focus-width\)/);
  // outline: none tanpa pengganti adalah kegagalan WCAG 2.4.7 paling umum.
  assert.ok(!/outline:\s*(none|0)\s*;/.test(css.replace(/@media[^{]*\{[^}]*\}/g, '')),
    'outline dihapus tanpa pengganti');
});

test('preferensi pengurangan gerak dan kontras tinggi dihormati', async () => {
  const css = await read(TOKENS_PATH);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /@media\s*\(forced-colors:\s*active\)/,
    'mode kontras tinggi sistem wajib dihormati, bukan ditimpa');
  assert.match(css, /@media print/, 'laporan regulator sering dicetak');
});

test('mode gelap dapat dipilih eksplisit dan menang atas preferensi sistem', async () => {
  const css = await read(TOKENS_PATH);
  assert.match(css, /:root\[data-theme=['"]dark['"]\]/);
  assert.match(css, /:root:not\(\[data-theme=['"]light['"]\]\)/,
    'pengguna wajib dapat menolak preferensi sistem dengan memilih mode terang');
  assert.match(css, /color-scheme:\s*light dark/);
});

test('ukuran font akar tidak dikunci dalam piksel', async () => {
  const css = await read(TOKENS_PATH);
  const htmlBlock = (css.match(/\bhtml\s*\{([^}]*)\}/) || [])[1] || '';
  assert.ok(!/font-size:\s*\d+px/.test(htmlBlock),
    'mengunci ukuran font akar dalam piksel mengabaikan pengaturan peramban pengguna (WCAG 1.4.4)');
});

test('target sentuh minimum 24 piksel sesuai WCAG 2.2 butir 2.5.8', async () => {
  const css = await read(TOKENS_PATH);
  assert.match(css, /min-block-size:\s*24px/);
  assert.match(css, /min-inline-size:\s*24px/);
});

test('angka memakai tabular numerals agar kolom rupiah dapat dibandingkan', async () => {
  const css = await read(TOKENS_PATH);
  assert.match(css, /--numeric-features:[^;]*tnum/);
  assert.match(css, /font-feature-settings:\s*var\(--numeric-features\)/);
  assert.match(css, /font-variant-numeric:\s*tabular-nums/);
});

// --- Integrasi ke halaman dan build -----------------------------------------

test('kedua halaman memuat lapisan token sebelum stylesheet lain', async () => {
  for (const page of ['index.html', 'enterprise.html']) {
    const html = await read(page);
    const tokenAt = html.indexOf('design-tokens.css');
    assert.ok(tokenAt > 0, `${page} tidak memuat design-tokens.css`);
    for (const later of ['enterprise.css', 'enterprise-input.css', 'enterprise-formkit.css']) {
      const at = html.indexOf(later);
      if (at < 0) continue;
      assert.ok(tokenAt < at,
        `${page} memuat ${later} sebelum token; stylesheet itu tidak akan melihat nilai token`);
    }
  }
});

test('font di atas lipatan dipreload dengan crossorigin', async () => {
  for (const page of ['index.html', 'enterprise.html']) {
    const html = await read(page);
    const preloads = [...html.matchAll(/<link[^>]*rel="preload"[^>]*>/g)].map((m) => m[0]);
    assert.ok(preloads.length >= 2, `${page} tidak mempreload font`);
    for (const p of preloads) {
      assert.match(p, /as="font"/);
      assert.match(p, /type="font\/woff2"/);
      // Tanpa crossorigin, preload font diambil dua kali.
      assert.match(p, /crossorigin/, `preload tanpa crossorigin pada ${page} menyebabkan unduhan ganda`);
    }
  }
});

test('build menyertakan lapisan token, seluruh font, dan lisensinya', async () => {
  const build = await read('scripts/build-dist.mjs');
  for (const asset of [
    'assets/design-tokens.css',
    'assets/fonts/inter-latin-400-normal.woff2',
    'assets/fonts/inter-latin-500-normal.woff2',
    'assets/fonts/inter-latin-600-normal.woff2',
    'assets/fonts/inter-latin-700-normal.woff2',
    'assets/fonts/inter-OFL-1.1.txt',
  ]) {
    assert.ok(build.includes(asset), `build tidak menyalin ${asset}`);
  }
});

test('token tidak memuat warna literal di luar blok definisinya', async () => {
  const css = await read(TOKENS_PATH);
  // Hapus blok definisi token, @font-face, dan media query tema; sisanya
  // adalah dasar yang diturunkan dan tidak boleh memuat warna literal.
  const base = css
    .replace(/:root(?:\[[^\]]*\])?\s*\{[\s\S]*?\n\}/g, '')
    .replace(/@media\s*\((?:prefers-color-scheme|print|forced-colors)[^)]*\)\s*\{[\s\S]*?\n\}/g, '')
    .replace(/@font-face\s*\{[\s\S]*?\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const literals = [...base.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
  assert.deepEqual(literals, [],
    `warna literal di luar definisi token: ${literals.join(', ')}; komponen wajib memakai var(--color-*)`);
});
