// Pembangun paket rilis offline GreenCal CRMS Enterprise. WP10.
// Master Execution Prompt v2.0 Bagian 09.3 dan Definition of Done butir 23-28.
//
// Bank on-premise tidak menarik rilis dari internet. Satu-satunya artefak yang
// masuk adalah paket ini: berisi kode, migrasi, konfigurasi deployment,
// registry parameter, bukti uji, dan manifest berisi checksum setiap berkas.
//
// Manifest itulah inti paket. Tanpa manifest yang cocok, instalasi harus
// ditolak operator, karena tidak ada cara lain memastikan isi paket sama dengan
// yang diuji dan disetujui.
//
// Penandatanganan: manifest ditandatangani di luar skrip ini, memakai kunci
// penandatangan rilis yang disimpan di HSM atau smartcard bank. Skrip ini
// menghasilkan manifest dan, bila GREENCAL_SIGNING_KEY diset ke berkas kunci
// privat Ed25519, menandatanganinya. Skrip TIDAK PERNAH membuat kunci sendiri:
// kunci yang dibuat skrip build adalah kunci yang tidak dapat dipercaya.

import { createHash, sign as cryptoSign, createPrivateKey } from 'node:crypto';
import { readFile, writeFile, readdir, stat, mkdir } from 'node:fs/promises';
import { join, resolve, relative, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');

/** Isi paket. Daftar eksplisit: tidak ada glob yang dapat ikut menyeret berkas. */
export const BUNDLE_CONTENTS = Object.freeze({
  code: ['package.json', 'package-lock.json', 'Dockerfile'],
  directories: [
    'src/onprem',
    'src/enterprise',
    'scripts/onprem',
    'scripts/release',
    'scripts/registry',
    'migrations/onprem',
    'deploy',
    'docs/enterprise/registry',
    'docs/enterprise/requirements',
    'tests',
  ],
  /** Pola yang WAJIB tidak pernah masuk paket. */
  forbidden: [
    /(^|\/)node_modules(\/|$)/,
    /(^|\/)\.git(\/|$)/,
    /(^|\/)deploy\/secrets\/(?!README\.md$)/,
    /(^|\/)deploy\/(app|app\.drc|migrator)\.env$/,
    /\.env$/,
    /(^|\/)\.wrangler(\/|$)/,
    /\.(pem|key|p12|pfx|jks)$/,
    /(^|\/)__pycache__(\/|$)/,
  ],
});

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

export function isForbidden(relPath, forbidden = BUNDLE_CONTENTS.forbidden) {
  const normalised = relPath.split(sep).join('/');
  return forbidden.some((re) => re.test(normalised));
}

async function walk(dir, root, acc) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch { return acc; }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(dir, e.name);
    const rel = relative(root, full).split(sep).join('/');
    if (isForbidden(rel)) continue;
    if (e.isDirectory()) await walk(full, root, acc);
    else if (e.isFile()) acc.push(rel);
  }
  return acc;
}

/** Mengumpulkan daftar berkas paket beserta checksum, terurut dan deterministik. */
export async function collectBundleFiles(root = ROOT) {
  const files = [];
  for (const f of BUNDLE_CONTENTS.code) {
    try { await stat(join(root, f)); files.push(f); }
    catch { throw new Error(`BUNDLE_FILE_MISSING: ${f} wajib ada di paket rilis`); }
  }
  for (const d of BUNDLE_CONTENTS.directories) await walk(join(root, d), root, files);

  const unique = [...new Set(files)].sort();
  const entries = [];
  for (const rel of unique) {
    const buf = await readFile(join(root, rel));
    entries.push({ path: rel, bytes: buf.length, sha256: sha256(buf) });
  }
  return entries;
}

/**
 * Membangun manifest. Digest manifest dihitung dari bentuk kanonik yang
 * terurut, sehingga dua build dari commit yang sama menghasilkan digest sama.
 */
export function buildManifest({ version, gitCommit, files, evidence, builtAt }) {
  if (!version) throw new Error('MANIFEST_VERSION_REQUIRED');
  if (!gitCommit) throw new Error('MANIFEST_COMMIT_REQUIRED');
  if (!evidence || !Array.isArray(evidence.gates)) throw new Error('MANIFEST_EVIDENCE_REQUIRED');

  const manifest = {
    bundleContract: 'greencal-onprem-bundle/1',
    product: 'GreenCal CRMS Enterprise',
    version,
    gitCommit,
    builtAt: builtAt || null,
    deployment: 'onprem',
    fileCount: files.length,
    totalBytes: files.reduce((a, f) => a + f.bytes, 0),
    files: [...files].sort((a, b) => a.path.localeCompare(b.path)),
    evidence,
  };
  const canonical = canonicalJson(manifest);
  return { manifest, canonical, digest: sha256(Buffer.from(canonical, 'utf8')) };
}

/** JSON kanonik: kunci terurut, tanpa spasi, tanpa nilai undefined. */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

/**
 * Menyimpulkan apakah paket boleh dirilis. Gate yang belum terbukti membuat
 * paket ditandai NOT_RELEASABLE, dan paket tetap dibangun agar dapat dipakai
 * UAT, tetapi penanda itu ikut masuk manifest dan tidak dapat dilepas tanpa
 * mengubah digest.
 */
export function assessReleasability(evidence) {
  const unmet = evidence.gates.filter((g) => g.status !== 'PASSED');
  const withoutEvidence = evidence.gates.filter((g) => g.status === 'PASSED' && !g.evidenceRef);
  return Object.freeze({
    releasable: unmet.length === 0 && withoutEvidence.length === 0,
    unmet: Object.freeze(unmet.map((g) => g.id)),
    passedWithoutEvidence: Object.freeze(withoutEvidence.map((g) => g.id)),
  });
}

async function main() {
  const { execFileSync } = await import('node:child_process');
  const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  const gitCommit = (() => {
    try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim(); }
    catch { return null; }
  })();
  if (!gitCommit) throw new Error('MANIFEST_COMMIT_REQUIRED: paket rilis wajib menyebut commit sumbernya');

  const dirty = (() => {
    try { return execFileSync('git', ['status', '--porcelain'], { cwd: ROOT }).toString().trim().length > 0; }
    catch { return true; }
  })();
  if (dirty && !process.argv.includes('--allow-dirty')) {
    throw new Error(
      'WORKING_TREE_DIRTY: paket rilis hanya boleh dibangun dari pohon kerja bersih; ' +
      'gunakan --allow-dirty hanya untuk uji lokal');
  }

  const files = await collectBundleFiles();
  const leaked = files.filter((f) => isForbidden(f.path));
  if (leaked.length) throw new Error(`BUNDLE_FORBIDDEN_CONTENT: ${leaked.map((f) => f.path).join(', ')}`);

  const evidencePath = process.env.GREENCAL_RELEASE_EVIDENCE
    || join(ROOT, 'docs/enterprise/release/release-gates.json');
  const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
  const releasability = assessReleasability(evidence);

  const { manifest, canonical, digest } = buildManifest({
    version: pkg.version, gitCommit, files,
    evidence: { ...evidence, releasability },
    builtAt: new Date().toISOString(),
  });

  const outDir = join(ROOT, 'dist-release');
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'manifest.json'), canonical + '\n', 'utf8');
  await writeFile(join(outDir, 'manifest.sha256'), `${digest}  manifest.json\n`, 'utf8');

  let signed = false;
  const keyPath = process.env.GREENCAL_SIGNING_KEY;
  if (keyPath) {
    // Kunci dibaca dari berkas yang disediakan operator; skrip ini tidak
    // pernah membuat atau menyimpan kunci penandatangan.
    const key = createPrivateKey(await readFile(keyPath));
    if (key.asymmetricKeyType !== 'ed25519') {
      throw new Error(`SIGNING_KEY_WRONG_TYPE: ${key.asymmetricKeyType}; paket rilis ditandatangani Ed25519`);
    }
    const signature = cryptoSign(null, Buffer.from(canonical, 'utf8'), key);
    await writeFile(join(outDir, 'manifest.sig'), signature.toString('base64') + '\n', 'utf8');
    signed = true;
  }

  process.stdout.write(JSON.stringify({
    manifestDigest: digest,
    fileCount: manifest.fileCount,
    totalBytes: manifest.totalBytes,
    gitCommit,
    signed,
    releasable: releasability.releasable,
    unmetGates: releasability.unmet,
  }, null, 2) + '\n');

  if (!signed) {
    process.stdout.write(
      '\nPERINGATAN: manifest belum ditandatangani. Set GREENCAL_SIGNING_KEY ke kunci\n' +
      'penandatangan rilis bank sebelum paket diserahkan ke operator.\n');
  }
  if (!releasability.releasable) {
    process.stdout.write(
      `\nPaket ditandai NOT_RELEASABLE. Gate belum terpenuhi: ${releasability.unmet.join(', ') || '-'}\n` +
      'Paket ini boleh dipakai UAT, TIDAK boleh dipakai produksi bank.\n');
    process.exit(2);
  }
}

if (import.meta.filename === resolve(process.argv[1] || '')) {
  main().catch((e) => { process.stderr.write(`${e.message}\n`); process.exit(1); });
}
