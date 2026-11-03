// Uji WP01: inventaris aksi dan spesifikasi OpenAPI 3.1.
// Gate dua arah: kode tidak dapat menambah endpoint tanpa dokumentasi, dan
// dokumentasi tidak dapat mengklaim endpoint yang tidak ada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  extractActions, extractFromSource, expandRouteRegex, attributeMethodsBySubAction,
  isDispatcher, toApiPath, parseCsv, readInventory, reconcile,
  INVENTORY_COLUMNS, HTTP_METHODS,
} from '../scripts/inventory/extract-actions.mjs';
import { buildOpenApi, OPENAPI_PATH } from '../scripts/inventory/build-openapi.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFile(join(ROOT, p), 'utf8');

// --- Ekstraktor --------------------------------------------------------------

test('regex rute diperluas menjadi template path bergaya OpenAPI', () => {
  assert.deepEqual(
    expandRouteRegex('^\\/records\\/([a-zA-Z0-9_-]{1,80})(?:\\/(workflow|history|export))?$'),
    ['/records/{id}', '/records/{id}/export', '/records/{id}/history', '/records/{id}/workflow'],
  );
  assert.deepEqual(
    expandRouteRegex('^\\/release\\/candidates\\/([a-f0-9-]{36})\\/reviews$'),
    ['/release/candidates/{id}/reviews'],
  );
  assert.deepEqual(
    expandRouteRegex('^\\/book6\\/workpapers\\/([a-zA-Z0-9_-]{1,80})(?:\\/(export))?$'),
    ['/book6/workpapers/{id}', '/book6/workpapers/{id}/export'],
  );
});

test('metode ditautkan per sub-aksi, bukan disebar ke seluruh varian', () => {
  // Inilah inti ketepatan ekstraksi: tanpa penautan ini, ekspor yang hanya GET
  // akan tercatat juga sebagai PATCH dan POST.
  const block = `
   if(!action&&method==='GET')return send(row);
   if(action==='history'&&method==='GET'){return send(versions);}
   if(action==='export'&&method==='GET'){return send(snapshot);}
   if((!action&&method==='PATCH')||(action==='workflow'&&method==='POST')){return save();}
  `;
  const map = attributeMethodsBySubAction(block);
  assert.deepEqual(map.get(''), ['GET', 'PATCH']);
  assert.deepEqual(map.get('history'), ['GET']);
  assert.deepEqual(map.get('export'), ['GET']);
  assert.deepEqual(map.get('workflow'), ['POST']);
});

test('penjaga metode negatif tidak dianggap deklarasi rute', () => {
  const map = attributeMethodsBySubAction("if(action==='export'&&method!=='GET')reject();");
  assert.equal(map.size, 0, "method!=='GET' adalah penolakan, bukan deklarasi endpoint");
});

test('rute dispatcher berakhiran garis miring tidak dihitung sebagai endpoint', () => {
  const all = ['/book5/', '/book5/catalog', '/summary'];
  assert.equal(isDispatcher('/book5/', all), true);
  assert.equal(isDispatcher('/book5/catalog', all), false);
  assert.equal(isDispatcher('/summary', all), false);
});

test('path internal diberi prefiks API, path yang sudah penuh dibiarkan', () => {
  assert.equal(toApiPath('/summary'), '/api/enterprise/summary');
  assert.equal(toApiPath('/api/enterprise/session'), '/api/enterprise/session');
  assert.equal(toApiPath('summary'), null);
});

test('baris komentar tidak menghasilkan rute palsu', () => {
  const hits = extractFromSource(`
    // if(path==='/palsu'&&method==='GET')return x;
    * path==='/juga-palsu'
    if(path==='/nyata'&&method==='GET')return y;
  `, 'uji.js');
  assert.deepEqual(hits.map((h) => h.raw), ['/nyata']);
});

test('ekstraksi dari kode nyata menemukan seluruh aksi dengan penjaga metode', async () => {
  const actions = await extractActions();
  assert.ok(actions.length >= 50, `hanya ${actions.length} aksi terdeteksi; ekstraktor kemungkinan rusak`);
  for (const a of actions) {
    assert.ok(HTTP_METHODS.includes(a.method),
      `${a.endpoint} tidak memiliki penjaga metode HTTP eksplisit (${a.method})`);
    assert.ok(a.endpoint.startsWith('/api/enterprise/'), a.endpoint);
    assert.ok(a.sources.length > 0, `${a.endpoint} tanpa rujukan sumber`);
  }
  // Rute yang diketahui ada wajib muncul; ini kontrol terhadap ekstraktor yang
  // diam-diam berhenti bekerja setelah perubahan gaya routing.
  const keys = new Set(actions.map((a) => `${a.method} ${a.endpoint}`));
  for (const k of [
    'GET /api/enterprise/session',
    'POST /api/enterprise/records',
    'PATCH /api/enterprise/records/{id}',
    'POST /api/enterprise/records/{id}/workflow',
    'GET /api/enterprise/records/{id}/export',
    'POST /api/enterprise/release/candidates/{id}/reviews',
    'GET /api/enterprise/book6/workpapers/{id}/export',
  ]) {
    assert.ok(keys.has(k), `${k} hilang dari hasil ekstraksi`);
  }
  // Dan rute yang TIDAK ada wajib tidak muncul.
  for (const k of [
    'PATCH /api/enterprise/records/{id}/export',
    'POST /api/enterprise/records/{id}/history',
    'DELETE /api/enterprise/records/{id}',
  ]) {
    assert.equal(keys.has(k), false, `${k} tidak ada di kode tetapi muncul di hasil ekstraksi`);
  }
});

// --- CSV --------------------------------------------------------------------

test('parser CSV menangani bidang berkutip dan koma di dalamnya', () => {
  assert.deepEqual(parseCsv('a,b\n1,"x, y"\n'), [['a', 'b'], ['1', 'x, y']]);
  assert.deepEqual(parseCsv('a\n"kutip ""ganda"""\n'), [['a'], ['kutip "ganda"']]);
  assert.deepEqual(parseCsv('a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]);
});

test('inventaris memakai kolom yang ditetapkan, dalam urutan yang ditetapkan', async () => {
  const inv = await readInventory();
  assert.deepEqual(inv.header, [...INVENTORY_COLUMNS]);
});

// --- Gate dua arah ----------------------------------------------------------

test('inventaris dan kode benar-benar sinkron', async () => {
  const findings = reconcile(await extractActions(), await readInventory());
  assert.deepEqual(findings, [],
    `inventaris dan kode tidak sinkron:\n${findings.map((f) => `${f.code} ${f.where}: ${f.detail}`).join('\n')}`);
});

test('endpoint di kode yang tidak terdaftar menggagalkan gate', async () => {
  const inv = await readInventory();
  const findings = reconcile(
    [...(await extractActions()), { endpoint: '/api/enterprise/rahasia', method: 'POST', sources: ['uji.js:1'] }],
    inv);
  assert.ok(findings.some((f) => f.code === 'ACTION_NOT_IN_INVENTORY' && /rahasia/.test(f.detail)));
});

test('baris inventaris yang rutenya tidak ada di kode menggagalkan gate', async () => {
  const actions = await extractActions();
  const inv = await readInventory();
  inv.rows.push({
    ...inv.rows[0], action_id: 'ACT-XX-001',
    endpoint: '/api/enterprise/tidak-ada', method: 'GET', _line: 999,
  });
  const findings = reconcile(actions, inv);
  assert.ok(findings.some((f) => f.code === 'INVENTORY_ROUTE_NOT_IN_CODE' && /tidak-ada/.test(f.detail)));
});

test('aksi tanpa test_case_ids menggagalkan gate', async () => {
  const inv = await readInventory();
  inv.rows[0] = { ...inv.rows[0], test_case_ids: '' };
  const findings = reconcile(await extractActions(), inv);
  assert.ok(findings.some((f) => f.code === 'INVENTORY_FIELD_EMPTY' && /test_case_ids/.test(f.detail)));
});

test('aksi yang mengubah keadaan tanpa penulisan audit menggagalkan gate', async () => {
  const inv = await readInventory();
  const mutation = inv.rows.findIndex((r) => r.method === 'POST');
  inv.rows[mutation] = { ...inv.rows[mutation], writes_audit: 'no' };
  const findings = reconcile(await extractActions(), inv);
  assert.ok(findings.some((f) => f.code === 'MUTATION_WITHOUT_AUDIT'));
});

test('modul di luar M01 sampai M32 menggagalkan gate', async () => {
  const inv = await readInventory();
  inv.rows[0] = { ...inv.rows[0], module: 'M99' };
  const findings = reconcile(await extractActions(), inv);
  assert.ok(findings.some((f) => f.code === 'INVENTORY_MODULE_UNKNOWN'));
});

test('setiap aksi yang mengubah keadaan tercatat menulis audit', async () => {
  const inv = await readInventory();
  for (const row of inv.rows) {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(row.method)) {
      assert.equal(row.writes_audit, 'yes',
        `${row.method} ${row.endpoint} mengubah keadaan tetapi tidak menulis audit`);
    }
  }
});

test('peran pada inventaris adalah peran yang benar-benar ada', async () => {
  const inv = await readInventory();
  const { ROLE_NAMES, LEGACY_ROLE_MAP } = await import('../src/onprem/iam/roles.js');
  const known = new Set([...ROLE_NAMES, ...Object.keys(LEGACY_ROLE_MAP)]);
  for (const row of inv.rows) {
    assert.ok(known.has(row.required_role),
      `peran ${row.required_role} pada ${row.endpoint} tidak dikenal`);
  }
});

// --- OpenAPI ----------------------------------------------------------------

test('spesifikasi OpenAPI di repositori sama dengan hasil pembangunan ulang', async () => {
  const onDisk = JSON.parse(await read(OPENAPI_PATH));
  const rebuilt = buildOpenApi(await readInventory());
  assert.deepEqual(onDisk, rebuilt,
    'docs/api/openapi.json basi; jalankan node scripts/inventory/build-openapi.mjs');
});

test('spesifikasi menyatakan OpenAPI 3.1 dan keamanan default', async () => {
  const spec = JSON.parse(await read(OPENAPI_PATH));
  assert.equal(spec.openapi, '3.1.0');
  assert.deepEqual(spec.security, [{ institutionSso: [] }]);
  assert.equal(spec.components.securitySchemes.institutionSso.type, 'http');
  assert.equal(spec.components.securitySchemes.institutionSso.scheme, 'bearer');
  // Server hanya intranet; spesifikasi tidak boleh mengiklankan host publik.
  for (const s of spec.servers) {
    assert.ok(!/\.com|\.id|\.net/.test(JSON.stringify(s)),
      `server ${JSON.stringify(s)} tampak publik; deployment ini intranet saja`);
  }
});

test('setiap operasi membawa modul, peran, RBAC, dan test_case_ids', async () => {
  const spec = JSON.parse(await read(OPENAPI_PATH));
  let count = 0;
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(item)) {
      count += 1;
      const at = `${method.toUpperCase()} ${path}`;
      assert.match(op['x-greencal-action-id'], /^ACT-[A-Z0-9]{2,8}-\d{3}$/, at);
      assert.match(op['x-greencal-module'], /^M(0[1-9]|[12][0-9]|3[0-2])$/, at);
      assert.ok(op['x-greencal-required-role'], at);
      assert.ok(op['x-greencal-rbac'].resource && op['x-greencal-rbac'].action, at);
      assert.equal(typeof op['x-greencal-writes-audit'], 'boolean', at);
      assert.ok(Array.isArray(op['x-greencal-test-case-ids']) && op['x-greencal-test-case-ids'].length >= 1,
        `${at} tanpa test_case_ids`);
      assert.ok(op.operationId && op.summary, at);
      assert.ok(op.tags?.length, at);
    }
  }
  assert.ok(count >= 50, `hanya ${count} operasi`);
});

test('operationId unik di seluruh spesifikasi', async () => {
  const spec = JSON.parse(await read(OPENAPI_PATH));
  const seen = new Set();
  for (const item of Object.values(spec.paths)) {
    for (const op of Object.values(item)) {
      assert.equal(seen.has(op.operationId), false, `operationId ganda: ${op.operationId}`);
      seen.add(op.operationId);
    }
  }
});

test('setiap operasi mendeklarasikan 401, 403, dan 503', async () => {
  const spec = JSON.parse(await read(OPENAPI_PATH));
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(item)) {
      for (const status of ['401', '403', '503']) {
        assert.ok(op.responses[status],
          `${method.toUpperCase()} ${path} tidak mendeklarasikan ${status}; default deny dan fail closed wajib tampak di kontrak`);
      }
    }
  }
});

test('operasi berparameter mendeklarasikan 404 dan parameter path tervalidasi', async () => {
  const spec = JSON.parse(await read(OPENAPI_PATH));
  for (const [path, item] of Object.entries(spec.paths)) {
    if (!path.includes('{')) continue;
    const names = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    for (const [method, op] of Object.entries(item)) {
      assert.ok(op.responses['404'],
        `${method.toUpperCase()} ${path} wajib mendeklarasikan 404; objek tenant lain menghasilkan 404, bukan 403`);
      const declared = (op.parameters || []).filter((p) => p.in === 'path').map((p) => p.name);
      assert.deepEqual(declared, names, `${method.toUpperCase()} ${path} parameter path tidak lengkap`);
      for (const p of (op.parameters || []).filter((x) => x.in === 'path')) {
        assert.equal(p.required, true);
        assert.ok(p.schema.pattern, `parameter ${p.name} tanpa pola validasi`);
        assert.ok(p.schema.maxLength, `parameter ${p.name} tanpa batas panjang`);
      }
    }
  }
});

test('operasi bermetode tubuh mendeklarasikan requestBody wajib', async () => {
  const spec = JSON.parse(await read(OPENAPI_PATH));
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(item)) {
      if (['post', 'patch', 'put'].includes(method)) {
        assert.ok(op.requestBody?.required, `${method.toUpperCase()} ${path} tanpa requestBody wajib`);
        assert.ok(op.requestBody.content['application/json'], `${method.toUpperCase()} ${path}`);
      } else {
        assert.equal(op.requestBody, undefined, `${method.toUpperCase()} ${path} tidak seharusnya bertubuh`);
      }
    }
  }
});

test('skema galat menuntut kode galat yang stabil, bukan hanya pesan', async () => {
  const spec = JSON.parse(await read(OPENAPI_PATH));
  const err = spec.components.schemas.Error;
  assert.deepEqual(err.required, ['ok', 'code', 'message']);
  assert.equal(err.properties.ok.const, false);
  assert.match('CALCULATION_CHANGED', new RegExp(err.properties.code.pattern));
  assert.ok(!new RegExp(err.properties.code.pattern).test('tidak valid'));
  assert.equal(err.additionalProperties, false);
});

test('seluruh rujukan $ref pada spesifikasi dapat diselesaikan', async () => {
  const spec = JSON.parse(await read(OPENAPI_PATH));
  const resolve$ = (ref) => ref.replace(/^#\//, '').split('/')
    .reduce((node, key) => (node == null ? undefined : node[key]), spec);
  const walk = (node, path = '') => {
    if (node === null || typeof node !== 'object') return;
    if (typeof node.$ref === 'string') {
      assert.notEqual(resolve$(node.$ref), undefined, `$ref menggantung di ${path}: ${node.$ref}`);
    }
    for (const [k, v] of Object.entries(node)) walk(v, `${path}/${k}`);
  };
  walk(spec);
});

test('setiap tag dipakai setidaknya satu operasi dan sebaliknya', async () => {
  const spec = JSON.parse(await read(OPENAPI_PATH));
  const declared = new Set(spec.tags.map((t) => t.name));
  const used = new Set();
  for (const item of Object.values(spec.paths)) {
    for (const op of Object.values(item)) for (const t of op.tags) used.add(t);
  }
  assert.deepEqual([...declared].sort(), [...used].sort());
});
