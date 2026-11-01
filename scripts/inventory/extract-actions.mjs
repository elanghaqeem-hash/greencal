// Ekstraktor inventaris aksi API. WP01.
// Master Execution Prompt v2.0 Bagian 03 dan Bagian 09.4.
//
// Mengapa diekstrak, bukan ditulis tangan: inventaris yang ditulis tangan akan
// menyimpang dari kode pada perubahan kedua atau ketiga. Ekstraktor ini membaca
// penjaga rute pada berkas penangan dan menghasilkan daftar (path, method) yang
// benar-benar ada di kode, termasuk rute berparameter yang dicocokkan regex.
//
// Inventaris beranotasi hidup di docs/inventory/menu-form-action.csv. Uji
// membandingkan keduanya DUA ARAH:
//   - rute di kode yang tidak ada di CSV  -> endpoint tanpa dokumentasi
//   - baris CSV yang rutenya tidak ada    -> dokumentasi mengklaim rute palsu
// Keduanya menggagalkan CI.

import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
export const HANDLER_DIR = 'src/enterprise';
export const ROUTE_PREFIX = '/api/enterprise';

export const HTTP_METHODS = Object.freeze(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Mengubah sumber regex rute menjadi template path bergaya OpenAPI.
 * Grup penangkap kelas karakter menjadi parameter; grup alternasi dan grup
 * opsional diperluas menjadi beberapa varian.
 *
 *   ^\/records\/([a-z0-9-]{1,80})(?:\/(workflow|history))?$
 *     -> ['/records/{id}', '/records/{id}/workflow', '/records/{id}/history']
 */
export function expandRouteRegex(source) {
  let body = source.replace(/^\^/, '').replace(/\$$/, '');
  let variants = [''];
  let i = 0;
  let paramCount = 0;

  const append = (piece) => { variants = variants.map((v) => v + piece); };
  const branch = (pieces) => {
    variants = variants.flatMap((v) => pieces.map((p) => v + p));
  };

  /** Membaca satu grup berimbang mulai dari '(' pada posisi start. */
  const readGroup = (start) => {
    let depth = 0;
    for (let j = start; j < body.length; j += 1) {
      if (body[j] === '\\') { j += 1; continue; }
      if (body[j] === '(') depth += 1;
      else if (body[j] === ')') {
        depth -= 1;
        if (depth === 0) return { inner: body.slice(start + 1, j), end: j };
      }
    }
    return null;
  };

  while (i < body.length) {
    const c = body[i];
    if (c === '\\') { append(body[i + 1]); i += 2; continue; }
    if (c !== '(') { append(c); i += 1; continue; }

    const group = readGroup(i);
    if (!group) return null;
    let { inner, end } = group;
    const optional = body[end + 1] === '?';
    const nonCapturing = inner.startsWith('?:');
    if (nonCapturing) inner = inner.slice(2);

    // Alternasi literal: perluas menjadi varian.
    if (/^[A-Za-z0-9_|/\\-]+$/.test(inner) && inner.includes('|')) {
      const options = inner.split('|').map((o) => o.replace(/\\/g, ''));
      branch(optional ? ['', ...options] : options);
    } else if (/^[A-Za-z0-9_\\/-]+$/.test(inner)) {
      // Grup literal tunggal, mis. (?:\/workflow)?
      const literal = inner.replace(/\\/g, '');
      branch(optional ? ['', literal] : [literal]);
    } else if (inner.startsWith('\\/') || inner.startsWith('/')) {
      // Grup bersarang yang dimulai pemisah: proses rekursif.
      const nested = expandRouteRegex(inner);
      if (!nested) return null;
      branch(optional ? ['', ...nested] : nested);
    } else {
      // Kelas karakter dengan kuantifier: ini parameter path.
      paramCount += 1;
      const name = paramCount === 1 ? 'id' : `param${paramCount}`;
      branch(optional ? ['', `{${name}}`] : [`{${name}}`]);
    }
    i = end + 1 + (optional ? 1 : 0);
  }

  return [...new Set(variants)].filter(Boolean).sort();
}

/** Mengubah path internal menjadi path API penuh. */
export function toApiPath(raw) {
  if (raw.startsWith(ROUTE_PREFIX)) return raw;
  if (!raw.startsWith('/')) return null;
  return ROUTE_PREFIX + raw;
}

/** Rute penerus (startsWith ke sub-penangan) bukan endpoint; ia dispatcher. */
export function isDispatcher(raw, allRaw) {
  if (!raw.endsWith('/')) return false;
  return allRaw.some((p) => p !== raw && p.startsWith(raw));
}

function methodsIn(text) {
  const found = new Set();
  for (const m of text.matchAll(/method\s*(===?|!==?)\s*'([A-Z]+)'/g)) {
    if (m[1].startsWith('!')) continue;   // penjaga negatif bukan deklarasi rute
    if (HTTP_METHODS.includes(m[2])) found.add(m[2]);
  }
  for (const m of text.matchAll(/request\.method\s*===?\s*'([A-Z]+)'/g)) {
    if (HTTP_METHODS.includes(m[1])) found.add(m[1]);
  }
  for (const m of text.matchAll(/\[\s*((?:'[A-Z]+'\s*,?\s*)+)\]\s*\.includes\(\s*(?:request\.)?method\s*\)/g)) {
    for (const q of m[1].matchAll(/'([A-Z]+)'/g)) {
      if (HTTP_METHODS.includes(q[1])) found.add(q[1]);
    }
  }
  return [...found].sort();
}

/** Membaca kondisi `if (...)` berimbang mulai dari posisi '(' sesudah if. */
function readCondition(text, openParen) {
  let depth = 0;
  for (let i = openParen; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') {
      depth -= 1;
      if (depth === 0) return text.slice(openParen + 1, i);
    }
  }
  return null;
}

/**
 * Menautkan metode HTTP ke varian sub-aksi pada rute berparameter.
 *
 * Tanpa langkah ini, seluruh metode dalam satu blok akan menempel pada seluruh
 * varian path, sehingga inventaris mencantumkan endpoint yang tidak ada
 * (misalnya PATCH pada .../export, padahal ekspor hanya GET). Penautan
 * dilakukan per kondisi `if`, karena di situlah sub-aksi dan metode diuji
 * bersama-sama: `action==='export'&&method==='GET'`.
 *
 * Mengembalikan Map dari nama sub-aksi (atau '' untuk varian tanpa sub-aksi)
 * ke daftar metode. Map kosong berarti blok tidak memakai pola sub-aksi, dan
 * pemanggil memakai metode seluruh blok.
 */
export function attributeMethodsBySubAction(block) {
  const map = new Map();
  const add = (key, methods) => {
    if (!methods.length) return;
    const set = map.get(key) || new Set();
    for (const m of methods) set.add(m);
    map.set(key, set);
  };

  for (const m of block.matchAll(/\bif\s*\(/g)) {
    const condition = readCondition(block, m.index + m[0].length - 1);
    if (!condition) continue;
    const methods = methodsIn(condition);
    if (!methods.length) continue;

    const subActions = [...condition.matchAll(/action\s*===?\s*'([a-zA-Z0-9_-]+)'/g)].map((x) => x[1]);
    const bare = /!\s*action\b/.test(condition);
    if (!subActions.length && !bare) continue;

    // Kondisi gabungan seperti `(!action&&method==='PATCH')||(action==='workflow'&&method==='POST')`
    // menguji dua pasangan sekaligus. Pecah per cabang agar metode tidak
    // tertukar antar varian.
    const branches = condition.split(/\|\|/);
    if (branches.length > 1) {
      for (const branch of branches) {
        const bMethods = methodsIn(branch);
        if (!bMethods.length) continue;
        const bSub = [...branch.matchAll(/action\s*===?\s*'([a-zA-Z0-9_-]+)'/g)].map((x) => x[1]);
        if (bSub.length) for (const s of bSub) add(s, bMethods);
        else if (/!\s*action\b/.test(branch)) add('', bMethods);
      }
      continue;
    }

    if (subActions.length) for (const s of subActions) add(s, methods);
    else add('', methods);
  }

  return new Map([...map].map(([k, v]) => [k, [...v].sort()]));
}

const LITERAL_ROUTE = /(?:url\.pathname|path)\s*===?\s*'([^']+)'/g;
const PREFIX_ROUTE = /(?:url\.pathname|path)\.startsWith\('([^']+)'\)/g;
const REGEX_ROUTE = /=\s*(\/\^[^\n]*?\$\/)\s*\.exec\(\s*path\s*\)/g;

export function extractFromSource(source, file) {
  const lines = source.split('\n');
  const isComment = (l) => /^\s*(\/\/|\*|\/\*)/.test(l);
  const hits = [];

  lines.forEach((line, index) => {
    if (isComment(line)) return;
    for (const re of [LITERAL_ROUTE, PREFIX_ROUTE]) {
      for (const m of line.matchAll(new RegExp(re.source, 'g'))) {
        if (!m[1].startsWith('/')) continue;
        // Rute literal: penjaga metode ada pada baris yang sama atau tepat
        // sesudahnya (gaya penulisan modul ini).
        const window = lines.slice(index, index + 4).filter((l) => !isComment(l)).join('\n');
        hits.push({ raw: m[1], kind: 'literal', file, line: index + 1, methods: methodsIn(window) });
      }
    }
    for (const m of line.matchAll(new RegExp(REGEX_ROUTE.source, 'g'))) {
      const src = m[1].slice(1, -1);
      const templates = expandRouteRegex(src);
      if (!templates) return;
      // Rute berparameter: penjaga metode tersebar di blok sesudahnya, sampai
      // deklarasi rute berikutnya.
      let end = lines.length;
      for (let j = index + 1; j < lines.length; j += 1) {
        if (isComment(lines[j])) continue;
        if (new RegExp(LITERAL_ROUTE.source).test(lines[j])
          || new RegExp(REGEX_ROUTE.source).test(lines[j])) { end = j; break; }
      }
      const block = lines.slice(index, end).filter((l) => !isComment(l)).join('\n');
      hits.push({
        raw: src, kind: 'regex', file, line: index + 1, templates,
        methods: methodsIn(block),
        bySubAction: attributeMethodsBySubAction(block),
      });
    }
  });

  return hits;
}

export async function extractActions(root = ROOT) {
  const dir = join(root, HANDLER_DIR);
  const files = (await readdir(dir)).filter((f) => f.endsWith('.js')).sort();
  const hits = [];
  for (const f of files) {
    const source = await readFile(join(dir, f), 'utf8');
    hits.push(...extractFromSource(source, `${HANDLER_DIR}/${f}`));
  }

  const literalRaw = hits.filter((h) => h.kind === 'literal').map((h) => h.raw);
  const actions = new Map();

  for (const hit of hits) {
    if (hit.kind === 'literal' && isDispatcher(hit.raw, literalRaw)) continue;
    const templates = hit.kind === 'regex' ? hit.templates : [hit.raw];
    const base = hit.kind === 'regex'
      ? templates.reduce((a, b) => (a.length <= b.length ? a : b))
      : hit.raw;

    for (const t of templates) {
      const endpoint = toApiPath(t);
      if (!endpoint) continue;

      let methods;
      if (hit.kind === 'regex' && hit.bySubAction.size > 0) {
        // Sub-aksi adalah segmen di belakang varian terpendek.
        const suffix = t.slice(base.length).replace(/^\//, '');
        methods = hit.bySubAction.get(suffix) || [];
        // Varian yang tidak pernah diuji bersama metode apa pun bukan endpoint;
        // ia hanya kemungkinan sintaksis dari regex-nya.
        if (!methods.length) continue;
      } else {
        // Rute tanpa penjaga metode eksplisit dicatat sebagai ANY; uji
        // memperlakukannya sebagai temuan, bukan hal yang boleh lewat.
        methods = hit.methods.length ? hit.methods : ['ANY'];
      }
      for (const method of methods) {
        const key = `${method} ${endpoint}`;
        if (!actions.has(key)) actions.set(key, { endpoint, method, parameterised: t.includes('{'), sources: [] });
        const src = `${hit.file}:${hit.line}`;
        if (!actions.get(key).sources.includes(src)) actions.get(key).sources.push(src);
      }
    }
  }

  return [...actions.values()].sort((a, b) =>
    a.endpoint.localeCompare(b.endpoint) || a.method.localeCompare(b.method));
}

// --- CSV inventaris ----------------------------------------------------------

export const INVENTORY_PATH = 'docs/inventory/menu-form-action.csv';
export const INVENTORY_COLUMNS = Object.freeze([
  'action_id', 'menu', 'form', 'action', 'endpoint', 'method',
  'module', 'required_role', 'rbac_resource', 'rbac_action',
  'writes_audit', 'test_case_ids', 'status',
]);

/** Parser CSV minimal: mendukung bidang berkutip ganda dan koma di dalamnya. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    if (c === '\r') continue;
    field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r[0] ?? '').trim() !== '');
}

export async function readInventory(root = ROOT) {
  const text = await readFile(join(root, INVENTORY_PATH), 'utf8');
  const rows = parseCsv(text);
  const header = rows[0].map((h) => h.trim());
  return {
    header,
    rows: rows.slice(1).map((cells, i) => {
      const record = Object.fromEntries(header.map((h, j) => [h, (cells[j] ?? '').trim()]));
      record._line = i + 2;
      return record;
    }),
  };
}

/**
 * Membandingkan kode dan inventaris dua arah.
 * Tidak ada temuan berarti keduanya benar-benar sinkron.
 */
export function reconcile(actions, inventory) {
  const findings = [];
  const codeKeys = new Set(actions.map((a) => `${a.method} ${a.endpoint}`));
  const csvKeys = new Set();
  const ids = new Set();

  if (inventory.header.join(',') !== INVENTORY_COLUMNS.join(',')) {
    findings.push({
      code: 'INVENTORY_HEADER_MISMATCH',
      detail: `kolom wajib ${INVENTORY_COLUMNS.join(',')}`, where: 'baris 1',
    });
  }

  for (const row of inventory.rows) {
    const where = `baris ${row._line}`;
    const key = `${row.method} ${row.endpoint}`;
    if (csvKeys.has(key)) {
      findings.push({ code: 'INVENTORY_DUPLICATE', detail: `${key} tercatat lebih dari sekali`, where });
    }
    csvKeys.add(key);

    if (ids.has(row.action_id)) {
      findings.push({ code: 'INVENTORY_ID_DUPLICATE', detail: row.action_id, where });
    }
    ids.add(row.action_id);

    for (const col of INVENTORY_COLUMNS) {
      // Aksi non-form (ekspor, riwayat, katalog) memang tidak punya form.
      if (col === 'form') continue;
      if (!row[col]) findings.push({ code: 'INVENTORY_FIELD_EMPTY', detail: `kolom ${col} kosong`, where });
    }

    if (row.action_id && !/^ACT-[A-Z0-9]{2,8}-\d{3}$/.test(row.action_id)) {
      findings.push({ code: 'INVENTORY_ID_MALFORMED', detail: row.action_id, where });
    }
    if (row.module && !/^M(0[1-9]|[12][0-9]|3[0-2])$/.test(row.module)) {
      findings.push({ code: 'INVENTORY_MODULE_UNKNOWN', detail: row.module, where });
    }
    if (row.method && !HTTP_METHODS.includes(row.method)) {
      findings.push({ code: 'INVENTORY_METHOD_INVALID', detail: row.method, where });
    }
    if (row.writes_audit && !['yes', 'no'].includes(row.writes_audit)) {
      findings.push({ code: 'INVENTORY_AUDIT_FLAG_INVALID', detail: row.writes_audit, where });
    }
    // Setiap aksi yang mengubah keadaan WAJIB menulis audit.
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(row.method) && row.writes_audit !== 'yes') {
      findings.push({
        code: 'MUTATION_WITHOUT_AUDIT',
        detail: `${key} mengubah keadaan tetapi writes_audit bukan yes`, where,
      });
    }
    if (row.test_case_ids && !/^[A-Za-z0-9_.-]+(\s*;\s*[A-Za-z0-9_.-]+)*$/.test(row.test_case_ids)) {
      findings.push({ code: 'INVENTORY_TEST_IDS_MALFORMED', detail: row.test_case_ids, where });
    }
    if (!codeKeys.has(key)) {
      findings.push({
        code: 'INVENTORY_ROUTE_NOT_IN_CODE',
        detail: `${key} tercatat di inventaris tetapi tidak ditemukan di kode`, where,
      });
    }
  }

  for (const a of actions) {
    const key = `${a.method} ${a.endpoint}`;
    if (!csvKeys.has(key)) {
      findings.push({
        code: 'ACTION_NOT_IN_INVENTORY',
        detail: `${key} ada di kode tetapi tidak terdaftar di inventaris`, where: a.sources.join(', '),
      });
    }
    if (a.method === 'ANY') {
      findings.push({
        code: 'ROUTE_WITHOUT_METHOD_GUARD',
        detail: `${a.endpoint} tidak memiliki penjaga metode HTTP eksplisit`, where: a.sources.join(', '),
      });
    }
  }

  return findings;
}

if (import.meta.filename === resolve(process.argv[1] || '')) {
  const actions = await extractActions();
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(actions, null, 2) + '\n');
  } else if (process.argv.includes('--check')) {
    const inventory = await readInventory();
    const findings = reconcile(actions, inventory);
    for (const f of findings) process.stdout.write(`${f.code.padEnd(30)} ${f.where}: ${f.detail}\n`);
    process.stdout.write(
      `\n${findings.length === 0 ? 'LULUS' : 'GAGAL'}: ${actions.length} aksi di kode, ` +
      `${inventory.rows.length} baris inventaris, ${findings.length} temuan\n`);
    process.exit(findings.length === 0 ? 0 : 1);
  } else {
    for (const a of actions) {
      process.stdout.write(`${a.method.padEnd(6)} ${a.endpoint.padEnd(50)} ${a.sources[0]}\n`);
    }
    process.stdout.write(`\n${actions.length} aksi\n`);
  }
}
