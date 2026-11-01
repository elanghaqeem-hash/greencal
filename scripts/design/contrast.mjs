// Kalkulator kontras WCAG 2.2 dan pembaca token desain. WP09.
// Master Execution Prompt v2.0 Bagian 08.
//
// Kontras TIDAK diklaim di dokumen; ia dihitung dari token yang benar-benar
// dipakai stylesheet, lalu diuji. Klaim "AA compliant" tanpa angka yang dapat
// dihitung ulang adalah klaim tanpa bukti.
//
// Rumus mengikuti WCAG 2.x relative luminance dan contrast ratio:
//   L = 0.2126 R + 0.7152 G + 0.0722 B, dengan tiap kanal dilinearkan
//   ratio = (Lterang + 0.05) / (Lgelap + 0.05)

import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
export const TOKENS_PATH = 'assets/design-tokens.css';

/** Ambang WCAG 2.2. */
export const WCAG = Object.freeze({
  AA_TEXT: 4.5,
  AA_LARGE_TEXT: 3,
  AA_NON_TEXT: 3,      // 1.4.11 komponen antarmuka dan objek grafis
  AAA_TEXT: 7,
});

export function parseHex(hex) {
  const s = String(hex).trim().replace(/^#/, '');
  const full = s.length === 3 || s.length === 4
    ? s.slice(0, 3).split('').map((c) => c + c).join('')
    : s.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`WARNA_TIDAK_SAH: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

export function relativeLuminance(hex) {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Dibulatkan ke dua desimal ke BAWAH, agar 4.499 tidak pernah tampak 4.5. */
export function ratio(a, b) {
  return Math.floor(contrastRatio(a, b) * 100) / 100;
}

/**
 * Membaca token warna dari stylesheet, per skema.
 * Blok `:root` adalah mode terang; blok bertanda `[data-theme='dark']` dan
 * `prefers-color-scheme: dark` adalah mode gelap.
 */
export function parseTokens(css) {
  const light = {};
  const dark = {};

  const collect = (block, into) => {
    for (const m of block.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
      into[m[1]] = m[2];
    }
  };

  // Blok :root pertama adalah basis mode terang.
  const rootBlocks = [...css.matchAll(/:root\s*\{([^}]*)\}/g)];
  if (rootBlocks.length === 0) throw new Error('TOKEN_ROOT_TIDAK_ADA');
  collect(rootBlocks[0][1], light);

  for (const m of css.matchAll(/:root\[data-theme=["']dark["']\]\s*\{([^}]*)\}/g)) {
    collect(m[1], dark);
  }
  for (const m of css.matchAll(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{([\s\S]*?)\n\}/g)) {
    for (const inner of m[1].matchAll(/\{([^}]*)\}/g)) collect(inner[1], dark);
  }

  // Mode gelap mewarisi token yang tidak ia timpa.
  return { light, dark: { ...light, ...dark } };
}

export async function readTokens(root = ROOT) {
  return parseTokens(await readFile(join(root, TOKENS_PATH), 'utf8'));
}

/**
 * Pasangan yang WAJIB diperiksa. Daftar ditulis eksplisit karena hanya
 * perancang yang tahu teks mana muncul di atas latar mana; pemeriksaan
 * otomatis atas semua kombinasi akan melaporkan pasangan yang tidak pernah
 * terjadi dan menyembunyikan yang penting.
 */
export const REQUIRED_PAIRS = Object.freeze([
  // Teks utama
  { fg: '--color-text', bg: '--color-bg', min: WCAG.AA_TEXT, what: 'teks utama di atas latar halaman' },
  { fg: '--color-text', bg: '--color-surface', min: WCAG.AA_TEXT, what: 'teks utama di atas kartu' },
  { fg: '--color-text', bg: '--color-surface-sunken', min: WCAG.AA_TEXT, what: 'teks utama di atas panel tenggelam' },
  { fg: '--color-text-muted', bg: '--color-bg', min: WCAG.AA_TEXT, what: 'teks sekunder di atas latar halaman' },
  { fg: '--color-text-muted', bg: '--color-surface', min: WCAG.AA_TEXT, what: 'teks sekunder di atas kartu' },

  // Tombol dan tautan
  { fg: '--color-on-brand', bg: '--color-brand', min: WCAG.AA_TEXT, what: 'label tombol utama' },
  { fg: '--color-on-brand', bg: '--color-brand-hover', min: WCAG.AA_TEXT, what: 'label tombol utama saat hover' },
  { fg: '--color-link', bg: '--color-bg', min: WCAG.AA_TEXT, what: 'tautan di atas latar halaman' },
  { fg: '--color-link', bg: '--color-surface', min: WCAG.AA_TEXT, what: 'tautan di atas kartu' },

  // Status. Teks status wajib AA penuh karena memuat makna, bukan hiasan.
  { fg: '--color-success-text', bg: '--color-success-bg', min: WCAG.AA_TEXT, what: 'teks status berhasil' },
  { fg: '--color-warning-text', bg: '--color-warning-bg', min: WCAG.AA_TEXT, what: 'teks status peringatan' },
  { fg: '--color-danger-text', bg: '--color-danger-bg', min: WCAG.AA_TEXT, what: 'teks status galat' },
  { fg: '--color-info-text', bg: '--color-info-bg', min: WCAG.AA_TEXT, what: 'teks status informasi' },
  { fg: '--color-success-text', bg: '--color-surface', min: WCAG.AA_TEXT, what: 'teks berhasil di atas kartu' },
  { fg: '--color-danger-text', bg: '--color-surface', min: WCAG.AA_TEXT, what: 'teks galat di atas kartu' },

  // Komponen non-teks, WCAG 1.4.11, ambang 3:1
  { fg: '--color-border-strong', bg: '--color-surface', min: WCAG.AA_NON_TEXT, what: 'batas kolom input' },
  { fg: '--color-focus-ring', bg: '--color-bg', min: WCAG.AA_NON_TEXT, what: 'cincin fokus di atas latar halaman' },
  { fg: '--color-focus-ring', bg: '--color-surface', min: WCAG.AA_NON_TEXT, what: 'cincin fokus di atas kartu' },
  { fg: '--color-brand', bg: '--color-surface', min: WCAG.AA_NON_TEXT, what: 'isian kontrol aktif di atas kartu' },

  // Seri data. Diagram memuat angka regulatori, jadi tiap seri wajib
  // terpisah dari latarnya tanpa bergantung pada warna semata.
  { fg: '--color-chart-1', bg: '--color-surface', min: WCAG.AA_NON_TEXT, what: 'seri data 1' },
  { fg: '--color-chart-2', bg: '--color-surface', min: WCAG.AA_NON_TEXT, what: 'seri data 2' },
  { fg: '--color-chart-3', bg: '--color-surface', min: WCAG.AA_NON_TEXT, what: 'seri data 3' },
  { fg: '--color-chart-4', bg: '--color-surface', min: WCAG.AA_NON_TEXT, what: 'seri data 4' },
  { fg: '--color-chart-5', bg: '--color-surface', min: WCAG.AA_NON_TEXT, what: 'seri data 5' },
]);

export function audit(tokens, pairs = REQUIRED_PAIRS) {
  const results = [];
  for (const scheme of ['light', 'dark']) {
    for (const pair of pairs) {
      const fg = tokens[scheme][pair.fg];
      const bg = tokens[scheme][pair.bg];
      if (!fg || !bg) {
        results.push({ scheme, ...pair, fg: fg || null, bg: bg || null, ratio: null, passed: false,
          detail: `token hilang: ${!fg ? pair.fg : pair.bg}` });
        continue;
      }
      const r = ratio(fg, bg);
      results.push({ scheme, ...pair, fgHex: fg, bgHex: bg, ratio: r, passed: r >= pair.min, detail: null });
    }
  }
  return results;
}

if (import.meta.filename === resolve(process.argv[1] || '')) {
  const tokens = await readTokens();
  const results = audit(tokens);
  const failed = results.filter((r) => !r.passed);
  for (const r of results) {
    const mark = r.passed ? 'LULUS' : 'GAGAL';
    process.stdout.write(
      `${mark} ${r.scheme.padEnd(5)} ${String(r.ratio ?? '-').padStart(6)}:1 ` +
      `(min ${r.min})  ${r.what}${r.detail ? ` [${r.detail}]` : ''}\n`);
  }
  process.stdout.write(`\n${failed.length === 0 ? 'LULUS' : 'GAGAL'}: ${results.length} pasangan diperiksa, ${failed.length} gagal\n`);
  process.exit(failed.length === 0 ? 0 : 1);
}
