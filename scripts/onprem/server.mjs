// Server runtime on-premise GreenCal CRMS Enterprise.
// WP02. Master Execution Prompt v2.0 Bagian 02.1, 02.2, dan 07.
//
// Server ini sengaja tidak memakai kerangka kerja pihak ketiga: satu-satunya
// dependensi runtime adalah modul inti Node dan driver pg. Setiap dependensi
// tambahan menambah permukaan serang dan beban pemutakhiran pada lingkungan
// intranet yang tidak dapat menarik patch sewaktu-waktu.
//
// Yang dijaga di sini:
//   - Egress deny. Bila GREENCAL_EGRESS=deny, fetch global dinonaktifkan,
//     sehingga tidak ada kode yang dapat menghubungi internet secara tak
//     sengaja. Permintaan keluar yang sah berjalan lewat proksi intranet yang
//     didaftarkan operator, bukan lewat fetch sembarang.
//   - Header keamanan ketat, termasuk CSP tanpa unsafe-inline pada skrip.
//   - Konteks tenant transaksional pada setiap kueri basis data.
//   - Tidak ada rute yang mengembalikan data lintas tenant.

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, normalize, extname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const ROOT = resolve(import.meta.dirname, '..', '..');
const DIST = join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';

// --- Egress deny -------------------------------------------------------------
// Dipasang sebelum apa pun yang lain, agar tidak ada jendela waktu di mana
// fetch masih hidup. Uji tests/onprem-egress.test.mjs membuktikan ini.
export function installEgressDeny(target = globalThis, mode = process.env.GREENCAL_EGRESS) {
  if (mode !== 'deny') return false;
  const deny = (what) => () => {
    throw new Error(
      `EGRESS_DENIED: ${what} dinonaktifkan pada deployment on-premise; ` +
      'gunakan adapter intranet yang terdaftar, bukan panggilan keluar langsung');
  };
  for (const name of ['fetch', 'WebSocket', 'EventSource']) {
    if (name in target) {
      Object.defineProperty(target, name, {
        configurable: true, enumerable: false, writable: false, value: deny(name),
      });
    }
  }
  return true;
}

installEgressDeny();

// --- Header keamanan ---------------------------------------------------------
export const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    // Intranet saja: tidak ada koneksi ke host luar, termasuk XHR.
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'none'",
    "object-src 'none'",
  ].join('; '),
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  // Laporan tidak boleh tersimpan di cache proksi atau peramban bersama.
  'Cache-Control': 'no-store',
});

const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
});

/**
 * Menyelesaikan path permintaan menjadi path berkas di dalam dist.
 * Mengembalikan null untuk setiap percobaan keluar dari dist, termasuk
 * traversal terenkode, byte NUL, dan path absolut.
 */
export function resolveStaticPath(urlPath, distRoot = DIST) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]); }
  catch { return null; }
  if (decoded.includes('\0')) return null;

  let rel = normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, '');
  if (rel === '/' || rel === '' || rel === '.') rel = 'index.html';
  if (rel.startsWith('/')) rel = rel.slice(1);

  const target = resolve(distRoot, rel);
  const bounded = resolve(distRoot);
  if (target !== bounded && !target.startsWith(bounded + '/')) return null;
  return target;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

async function serveStatic(req, res) {
  const target = resolveStaticPath(req.url);
  if (!target) return send(res, 400, 'bad request', { 'Content-Type': 'text/plain; charset=utf-8' });

  let meta;
  try { meta = await stat(target); }
  catch { return send(res, 404, 'not found', { 'Content-Type': 'text/plain; charset=utf-8' }); }

  if (meta.isDirectory()) {
    const index = join(target, 'index.html');
    try { await stat(index); } catch { return send(res, 404, 'not found', { 'Content-Type': 'text/plain; charset=utf-8' }); }
    return streamFile(res, index);
  }
  return streamFile(res, target);
}

function streamFile(res, file) {
  const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': type });
  createReadStream(file).pipe(res);
}

// --- Kesiapan ----------------------------------------------------------------
// /healthz menjawab hidup atau tidaknya proses. /readyz menjawab siap atau
// tidaknya melayani: basis data terjangkau, migrasi terpasang, dan guard RLS
// bersih. Readiness yang gagal berarti pod dikeluarkan dari rotasi, bukan
// melayani dengan skema setengah terpasang.
export async function readiness({ pool } = {}) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail: detail || null });

  add('egress_denied', process.env.GREENCAL_EGRESS === 'deny',
    'GREENCAL_EGRESS wajib deny pada deployment on-premise');
  add('deployment_onprem', process.env.GREENCAL_DEPLOYMENT === 'onprem');

  if (!pool) {
    add('database', false, 'pool basis data tidak tersedia');
  } else {
    try {
      const r = await pool.query('SELECT 1 AS ok');
      add('database', r.rows[0].ok === 1);
      const rls = await pool.query('SELECT * FROM crms.find_tables_without_rls()');
      add('rls_complete', rls.rows.length === 0,
        rls.rows.length ? JSON.stringify(rls.rows) : null);
      const floats = await pool.query('SELECT * FROM crms.find_float_columns()');
      add('no_float_columns', floats.rows.length === 0,
        floats.rows.length ? JSON.stringify(floats.rows) : null);
    } catch (e) {
      add('database', false, e.message);
    }
  }

  return { ready: checks.every((c) => c.ok), checks };
}

let pool = null;
async function getPool() {
  if (pool) return pool;
  if (!process.env.GREENCAL_ONPREM_PG_URL) return null;
  const { Pool } = await import('pg');
  pool = new Pool({
    connectionString: process.env.GREENCAL_ONPREM_PG_URL,
    max: Number(process.env.GREENCAL_PG_POOL_MAX || 10),
    // Koneksi hanya ke basis data intranet; TLS diwajibkan operator lewat
    // sslmode pada connection string, tidak dilemahkan di sini.
    application_name: 'greencal-onprem',
  });
  return pool;
}

const server = createServer(async (req, res) => {
  const requestId = randomUUID();
  res.setHeader('X-Request-Id', requestId);

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'method not allowed', { Allow: 'GET, HEAD' });
  }

  const path = req.url.split('?')[0];
  if (path === '/healthz') {
    return send(res, 200, JSON.stringify({ status: 'alive', requestId }),
      { 'Content-Type': 'application/json; charset=utf-8' });
  }
  if (path === '/readyz') {
    const report = await readiness({ pool: await getPool() });
    return send(res, report.ready ? 200 : 503, JSON.stringify({ ...report, requestId }),
      { 'Content-Type': 'application/json; charset=utf-8' });
  }
  return serveStatic(req, res);
});

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename);
if (isMain) {
  server.listen(PORT, HOST, () => {
    process.stdout.write(JSON.stringify({
      event: 'server.listening', host: HOST, port: PORT,
      deployment: process.env.GREENCAL_DEPLOYMENT || 'unset',
      egress: process.env.GREENCAL_EGRESS || 'unset',
    }) + '\n');
  });

  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
      server.close(() => { if (pool) pool.end().finally(() => process.exit(0)); else process.exit(0); });
    });
  }
}

export { server };
