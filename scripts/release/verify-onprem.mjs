// Gate rilis on-premise. WP02 dan WP10.
// Master Execution Prompt v2.0 Bagian 09.5 dan Definition of Done butir 23-28.
//
// Modul ini murni: menerima isi berkas sebagai teks dan mengembalikan daftar
// temuan. Dengan begitu aturannya dapat diuji tanpa Docker, tanpa jaringan,
// dan tanpa basis data, serta dapat dijalankan sebagai langkah CI.
//
// Setiap temuan berat (severity 'blocker') membuat rilis GAGAL. Tidak ada
// jalur "peringatan saja" untuk kontrol yang menyangkut isolasi tenant,
// rahasia, atau integritas audit.

export const SEVERITY = Object.freeze({ BLOCKER: 'blocker', MAJOR: 'major', MINOR: 'minor' });

const finding = (severity, code, detail, where) => ({ severity, code, detail, where });

/** Digest placeholder yang wajib diganti sebelum rilis. */
const PLACEHOLDER_DIGEST = /@sha256:0{64}/;

export function checkCompose(text, where = 'docker-compose') {
  const out = [];

  // Tag citra yang bergerak membuat rilis tidak dapat direproduksi.
  for (const m of text.matchAll(/image:\s*(\S+)/g)) {
    const image = m[1];
    if (/:latest\b/.test(image) || !/[:@]/.test(image)) {
      out.push(finding(SEVERITY.BLOCKER, 'IMAGE_TAG_FLOATING',
        `citra ${image} tidak disematkan pada versi atau digest`, where));
    }
  }

  if (PLACEHOLDER_DIGEST.test(text)) {
    out.push(finding(SEVERITY.BLOCKER, 'IMAGE_DIGEST_PLACEHOLDER',
      'masih ada digest placeholder @sha256:000...; ganti dengan digest citra yang diaudit bank', where));
  }

  // Jaringan internal tanpa gateway adalah egress deny lapis jaringan.
  if (!/internal:\s*true/.test(text)) {
    out.push(finding(SEVERITY.BLOCKER, 'NETWORK_NOT_INTERNAL',
      'tidak ada jaringan ber-internal: true; layanan masih dapat menghubungi internet', where));
  }

  for (const [control, pattern, code] of [
    ['read_only', /read_only:\s*true/, 'CONTAINER_NOT_READ_ONLY'],
    ['no-new-privileges', /no-new-privileges:\s*true/, 'PRIVILEGE_ESCALATION_ALLOWED'],
    ['cap_drop ALL', /cap_drop:\s*\n\s*-\s*ALL/, 'CAPABILITIES_NOT_DROPPED'],
  ]) {
    if (!pattern.test(text)) {
      out.push(finding(SEVERITY.BLOCKER, code, `kontrol ${control} tidak ditemukan`, where));
    }
  }

  // Rahasia tidak boleh tertulis sebagai nilai di dalam compose.
  const secretish = /(?:PASSWORD|SECRET|TOKEN|API_KEY|PRIVATE_KEY)\s*[:=]\s*(?!\s*$)(?!.*_FILE)(["']?)(?!\$\{)[^\s"'#]{6,}/gi;
  for (const m of text.matchAll(secretish)) {
    out.push(finding(SEVERITY.BLOCKER, 'SECRET_INLINE',
      `nilai rahasia tampak tertulis langsung: ${m[0].slice(0, 40)}`, where));
  }

  // Porta tidak boleh terikat ke seluruh antarmuka.
  for (const m of text.matchAll(/-\s*"(\d+\.\d+\.\d+\.\d+|\$\{[^}]+\})?:?(\d+):(\d+)"/g)) {
    const bind = m[1];
    if (!bind) {
      out.push(finding(SEVERITY.BLOCKER, 'PORT_BOUND_TO_ALL_INTERFACES',
        `porta ${m[2]} dipublikasikan tanpa alamat pengikatan`, where));
    } else if (bind === '0.0.0.0') {
      out.push(finding(SEVERITY.BLOCKER, 'PORT_BOUND_TO_ALL_INTERFACES',
        `porta ${m[2]} terikat ke 0.0.0.0`, where));
    }
  }

  if (!/GREENCAL_EGRESS:\s*deny/.test(text)) {
    out.push(finding(SEVERITY.MAJOR, 'APP_EGRESS_NOT_DENIED',
      'GREENCAL_EGRESS: deny tidak diset pada layanan aplikasi', where));
  }

  return out;
}

export function checkPgHba(text, where = 'pg_hba.conf') {
  const out = [];
  const lines = text.split('\n')
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean);

  for (const line of lines) {
    const method = line.split(/\s+/).pop();
    if (/^trust$/i.test(method) || /\btrust\b/i.test(line)) {
      out.push(finding(SEVERITY.BLOCKER, 'HBA_TRUST_METHOD',
        `metode trust ditemukan: ${line}`, where));
    }
    if (/\bmd5\b/i.test(line)) {
      out.push(finding(SEVERITY.BLOCKER, 'HBA_WEAK_METHOD',
        `md5 sudah tidak memadai, pakai scram-sha-256: ${line}`, where));
    }
    if (/\bpassword\b/i.test(method)) {
      out.push(finding(SEVERITY.BLOCKER, 'HBA_CLEARTEXT_PASSWORD',
        `metode password mengirim kata sandi tanpa hash: ${line}`, where));
    }
    // Koneksi TCP tanpa TLS tidak boleh diizinkan.
    if (/^host\s/i.test(line) && !/\breject\b/i.test(line)) {
      out.push(finding(SEVERITY.BLOCKER, 'HBA_NON_TLS_ALLOWED',
        `baris host tanpa TLS mengizinkan koneksi: ${line}; pakai hostssl`, where));
    }
  }

  // Baris penutup wajib menolak sisanya secara eksplisit.
  const rejectsAll = lines.filter((l) => /\ball\s+all\b/i.test(l) && /\breject\b/i.test(l));
  if (rejectsAll.length === 0) {
    out.push(finding(SEVERITY.BLOCKER, 'HBA_NO_DEFAULT_DENY',
      'tidak ada baris penolakan eksplisit di akhir; kelalaian aturan berakhir longgar', where));
  }

  if (!/\bclientcert=verify-full\b/.test(text)) {
    out.push(finding(SEVERITY.MAJOR, 'HBA_REPLICATION_WITHOUT_CLIENTCERT',
      'replikasi sebaiknya menuntut clientcert=verify-full, bukan kata sandi saja', where));
  }

  return out;
}

export function checkPostgresConf(text, where = 'postgresql.conf') {
  const out = [];
  const setting = (key) => {
    const m = text.match(new RegExp(`^\\s*${key}\\s*=\\s*'?([^'#\\n]+?)'?\\s*(?:#.*)?$`, 'mi'));
    return m ? m[1].trim() : null;
  };

  const required = [
    ['ssl', 'on', SEVERITY.BLOCKER, 'TLS basis data wajib aktif'],
    ['row_security', 'on', SEVERITY.BLOCKER, 'row_security wajib on agar RLS tidak dapat dimatikan per sesi'],
    ['fsync', 'on', SEVERITY.BLOCKER, 'fsync off berarti data dapat hilang pada kegagalan daya'],
    ['full_page_writes', 'on', SEVERITY.BLOCKER, 'full_page_writes wajib on agar halaman tidak rusak separuh'],
    ['ignore_checksum_failure', 'off', SEVERITY.BLOCKER, 'kerusakan checksum tidak boleh diabaikan'],
    ['archive_mode', 'on', SEVERITY.BLOCKER, 'arsip WAL adalah dasar PITR'],
    ['log_connections', 'on', SEVERITY.MAJOR, 'koneksi wajib tercatat'],
    ['log_statement', 'ddl', SEVERITY.MAJOR, 'perubahan skema wajib tercatat'],
  ];
  for (const [key, want, severity, why] of required) {
    const have = setting(key);
    if (have === null) {
      out.push(finding(severity, 'PG_SETTING_MISSING', `${key} tidak diset; ${why}`, where));
    } else if (have.toLowerCase() !== want) {
      out.push(finding(severity, 'PG_SETTING_UNSAFE', `${key} = ${have}, seharusnya ${want}; ${why}`, where));
    }
  }

  const walLevel = setting('wal_level');
  if (!['replica', 'logical'].includes(String(walLevel))) {
    out.push(finding(SEVERITY.BLOCKER, 'PG_WAL_LEVEL_TOO_LOW',
      `wal_level = ${walLevel}; replikasi ke DRC menuntut minimal replica`, where));
  }

  const minTls = setting('ssl_min_protocol_version');
  if (minTls && !['TLSv1.2', 'TLSv1.3'].includes(minTls)) {
    out.push(finding(SEVERITY.BLOCKER, 'PG_TLS_VERSION_WEAK',
      `ssl_min_protocol_version = ${minTls}`, where));
  }

  const idleTx = Number(setting('idle_in_transaction_session_timeout'));
  if (!idleTx) {
    out.push(finding(SEVERITY.MAJOR, 'PG_IDLE_TX_UNBOUNDED',
      'idle_in_transaction_session_timeout tidak diset; transaksi menganggur menahan konteks tenant', where));
  }

  return out;
}

export function checkDockerfile(text, where = 'Dockerfile') {
  const out = [];

  const userLines = [...text.matchAll(/^\s*USER\s+(\S+)/gmi)].map((m) => m[1]);
  if (userLines.length === 0) {
    out.push(finding(SEVERITY.BLOCKER, 'DOCKERFILE_RUNS_AS_ROOT',
      'tidak ada instruksi USER; kontainer berjalan sebagai root', where));
  } else {
    const last = userLines[userLines.length - 1];
    if (/^root$|^0(:|$)/.test(last)) {
      out.push(finding(SEVERITY.BLOCKER, 'DOCKERFILE_RUNS_AS_ROOT',
        `USER terakhir adalah ${last}`, where));
    }
  }

  // Tag dasar yang bergerak.
  for (const m of text.matchAll(/^\s*FROM\s+(\S+)/gmi)) {
    if (/:latest\b/.test(m[1]) || !/:/.test(m[1])) {
      out.push(finding(SEVERITY.BLOCKER, 'BASE_IMAGE_FLOATING',
        `citra dasar ${m[1]} tidak disematkan`, where));
    }
  }

  // Alat jaringan di tahap runtime memperbesar permukaan serang.
  const runtimeStage = text.split(/^FROM .* AS runtime$/mi)[1] || '';
  for (const tool of ['curl', 'wget', 'git', 'build-essential', 'gcc']) {
    if (new RegExp(`\\b${tool}\\b`).test(runtimeStage.replace(/^#.*$/gm, ''))) {
      out.push(finding(SEVERITY.MAJOR, 'RUNTIME_TOOL_PRESENT',
        `${tool} tampak dipasang pada tahap runtime`, where));
    }
  }

  if (!/npm ci\b/.test(text)) {
    out.push(finding(SEVERITY.BLOCKER, 'DEPENDENCY_NOT_LOCKED',
      'npm ci tidak dipakai; build tidak dapat direproduksi', where));
  }
  if (/npm install\b/.test(text)) {
    out.push(finding(SEVERITY.MAJOR, 'DEPENDENCY_UNLOCKED_INSTALL',
      'npm install dapat menaikkan versi di luar lockfile', where));
  }
  if (!/HEALTHCHECK/.test(text)) {
    out.push(finding(SEVERITY.MAJOR, 'NO_HEALTHCHECK', 'tidak ada HEALTHCHECK', where));
  }

  return out;
}

/** Menyatukan seluruh pemeriksaan dan menyimpulkan lulus atau tidak. */
export function verifyOnPremRelease(inputs) {
  const findings = [
    ...(inputs.composeDc ? checkCompose(inputs.composeDc, 'docker-compose.dc.yml') : []),
    ...(inputs.composeDrc ? checkCompose(inputs.composeDrc, 'docker-compose.drc.yml') : []),
    ...(inputs.pgHba ? checkPgHba(inputs.pgHba) : []),
    ...(inputs.postgresConf ? checkPostgresConf(inputs.postgresConf) : []),
    ...(inputs.dockerfile ? checkDockerfile(inputs.dockerfile) : []),
  ];

  for (const [key, label] of [
    ['composeDc', 'docker-compose.dc.yml'], ['composeDrc', 'docker-compose.drc.yml'],
    ['pgHba', 'pg_hba.conf'], ['postgresConf', 'postgresql.conf'], ['dockerfile', 'Dockerfile'],
  ]) {
    if (!inputs[key]) {
      findings.push(finding(SEVERITY.BLOCKER, 'CONFIG_MISSING',
        `${label} tidak disertakan pada pemeriksaan rilis`, label));
    }
  }

  const blockers = findings.filter((f) => f.severity === SEVERITY.BLOCKER);
  return Object.freeze({
    passed: blockers.length === 0,
    blockerCount: blockers.length,
    findings: Object.freeze(findings),
  });
}

// --- Eksekusi sebagai alat CI ------------------------------------------------
if (import.meta.filename === (await import('node:path')).resolve(process.argv[1] || '')) {
  const { readFile } = await import('node:fs/promises');
  const { join, resolve } = await import('node:path');
  const root = resolve(import.meta.dirname, '..', '..');
  const read = async (p) => { try { return await readFile(join(root, p), 'utf8'); } catch { return null; } };

  const report = verifyOnPremRelease({
    composeDc: await read('deploy/docker-compose.dc.yml'),
    composeDrc: await read('deploy/docker-compose.drc.yml'),
    pgHba: await read('deploy/postgres/pg_hba.conf'),
    postgresConf: await read('deploy/postgres/postgresql.conf'),
    dockerfile: await read('Dockerfile'),
  });

  for (const f of report.findings) {
    process.stdout.write(`${f.severity.toUpperCase().padEnd(8)} ${f.code.padEnd(34)} ${f.where}: ${f.detail}\n`);
  }
  process.stdout.write(
    `\n${report.passed ? 'LULUS' : 'GAGAL'}: ${report.blockerCount} blocker, ` +
    `${report.findings.length} temuan total\n`);
  process.exit(report.passed ? 0 : 1);
}
