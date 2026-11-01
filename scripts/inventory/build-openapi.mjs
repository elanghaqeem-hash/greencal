// Pembangun spesifikasi OpenAPI 3.1 dari inventaris aksi. WP01.
// Master Execution Prompt v2.0 Bagian 03.
//
// Spesifikasi dibangun dari docs/inventory/menu-form-action.csv, dan inventaris
// itu sendiri digerbang dua arah terhadap kode oleh extract-actions.mjs. Dengan
// rantai itu, spesifikasi tidak dapat menyimpang dari kode tanpa CI gagal:
//
//   kode  <--gate-->  inventaris CSV  --generate-->  OpenAPI
//
// Spesifikasi ditulis sebagai JSON, bukan YAML, agar dapat diperiksa uji tanpa
// menambah dependensi parser.

import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { readInventory } from './extract-actions.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
export const OPENAPI_PATH = 'docs/api/openapi.json';

/** Galat terstruktur yang dipakai seluruh endpoint. */
const ERROR_SCHEMA = {
  type: 'object',
  required: ['ok', 'code', 'message'],
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', const: false },
    code: {
      type: 'string',
      description: 'Kode galat yang stabil; klien bercabang pada kode ini, bukan pada teks pesan.',
      pattern: '^[A-Z][A-Z0-9_]{2,63}$',
    },
    message: {
      type: 'string',
      description: 'Pesan berbahasa Indonesia untuk pengguna akhir. Tidak memuat jejak tumpukan maupun detail internal.',
      maxLength: 500,
    },
  },
};

/** Respons galat baku. Setiap operasi memakai seluruh himpunan yang relevan. */
const STANDARD_RESPONSES = {
  Unauthorized: { description: 'Sesi SSO institusi tidak ada atau tidak sah.' },
  Forbidden: { description: 'Peran tidak berwenang, atau ditolak aturan pemisahan tugas.' },
  NotFound: { description: 'Objek tidak ada pada tenant ini. Objek milik tenant lain juga menghasilkan 404, bukan 403, agar keberadaannya tidak terungkap.' },
  Conflict: { description: 'Revisi berubah, atau keadaan objek tidak mengizinkan aksi ini.' },
  TooManyRequests: { description: 'Pembatasan laju di edge.' },
  Unavailable: { description: 'Modul belum diaktifkan institusi, atau prasyarat backend belum tersedia. Fail closed, bukan melayani dengan konfigurasi setengah.' },
};

const RESPONSE_REF = (name) => ({ $ref: `#/components/responses/${name}` });

function successFor(method) {
  if (method === 'POST') {
    return {
      201: {
        description: 'Objek dibuat, atau keputusan direkam.',
        content: { 'application/json': { schema: { type: 'object' } } },
      },
      200: {
        description: 'Aksi dijalankan pada objek yang sudah ada.',
        content: { 'application/json': { schema: { type: 'object' } } },
      },
    };
  }
  return {
    200: {
      description: 'Berhasil.',
      content: { 'application/json': { schema: { type: 'object' } } },
    },
  };
}

function responsesFor(row) {
  const out = { ...successFor(row.method) };
  out[401] = RESPONSE_REF('Unauthorized');
  out[403] = RESPONSE_REF('Forbidden');
  out[429] = RESPONSE_REF('TooManyRequests');
  out[503] = RESPONSE_REF('Unavailable');
  if (row.endpoint.includes('{')) out[404] = RESPONSE_REF('NotFound');
  if (['PATCH', 'POST'].includes(row.method) && /workflow|\{id\}$/.test(row.endpoint)) {
    out[409] = RESPONSE_REF('Conflict');
  }
  return out;
}

function operationId(row) {
  const slug = row.endpoint
    .replace('/api/enterprise/', '')
    .replace(/\{(\w+)\}/g, (_, p) => `By${p[0].toUpperCase()}${p.slice(1)}`)
    .split(/[/-]/)
    .filter(Boolean)
    .map((s, i) => (i === 0 ? s : s[0].toUpperCase() + s.slice(1)))
    .join('');
  return row.method.toLowerCase() + slug[0].toUpperCase() + slug.slice(1);
}

export function buildOpenApi(inventory) {
  const paths = {};
  const tags = new Map();

  for (const row of inventory.rows) {
    if (!tags.has(row.menu)) tags.set(row.menu, { name: row.menu });
    const path = (paths[row.endpoint] ||= {});

    const parameters = [];
    for (const m of row.endpoint.matchAll(/\{(\w+)\}/g)) {
      parameters.push({
        name: m[1], in: 'path', required: true,
        description: 'Pengenal objek dalam tenant pemanggil.',
        schema: { type: 'string', minLength: 1, maxLength: 80, pattern: '^[A-Za-z0-9_-]+$' },
      });
    }
    if (row.endpoint.endsWith('/records') && row.method === 'GET') {
      parameters.push(
        { name: 'kind', in: 'query', required: true, description: 'Jenis register.', schema: { type: 'string' } },
        { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 10000, default: 1 } },
      );
    }

    const operation = {
      operationId: operationId(row),
      summary: row.action,
      tags: [row.menu],
      description:
        `Modul ${row.module}. Peran minimum ${row.required_role}. ` +
        `Otorisasi dievaluasi sebagai ${row.rbac_resource}:${row.rbac_action} dengan default deny, ` +
        `lalu aturan pemisahan tugas. ` +
        (row.writes_audit === 'yes'
          ? 'Aksi ini menulis entri log audit append-only.'
          : 'Aksi ini tidak mengubah keadaan dan tidak menulis log audit.'),
      responses: responsesFor(row),
      'x-greencal-action-id': row.action_id,
      'x-greencal-module': row.module,
      'x-greencal-required-role': row.required_role,
      'x-greencal-rbac': { resource: row.rbac_resource, action: row.rbac_action },
      'x-greencal-writes-audit': row.writes_audit === 'yes',
      'x-greencal-test-case-ids': row.test_case_ids.split(';').map((s) => s.trim()).filter(Boolean),
    };
    if (row.form && row.form !== '-') operation['x-greencal-form'] = row.form;
    if (parameters.length) operation.parameters = parameters;
    if (['POST', 'PATCH', 'PUT'].includes(row.method)) {
      operation.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              description:
                'Isi badan permintaan divalidasi ulang di server. Keluaran peramban tidak pernah dipercaya; ' +
                'perhitungan dihitung kembali sebelum submit, check, dan approve.',
            },
          },
        },
      };
    }

    path[row.method.toLowerCase()] = operation;
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'GreenCal CRMS Enterprise API',
      version: '0.1.0',
      summary: 'API institusi untuk pelaporan CRMS Perbankan 2026.',
      description: [
        'API ini dipakai workspace institusi GreenCal CRMS Enterprise.',
        '',
        'Sifat yang berlaku pada SELURUH operasi:',
        '',
        '- **Default deny.** Tidak ada endpoint yang terbuka tanpa sesi SSO institusi terverifikasi.',
        '- **Isolasi tenant.** Tenant berasal dari token terverifikasi sisi server, bukan dari header,',
        '  parameter kueri, atau badan permintaan. Permintaan yang mencoba menetapkan konteks tenant',
        '  lewat header ditolak di edge dengan status 400.',
        '- **Objek tenant lain menghasilkan 404, bukan 403**, agar keberadaannya tidak terungkap.',
        '- **Fail closed.** Modul yang belum diaktifkan institusi menjawab 503, bukan melayani sebagian.',
        '- **Validasi ulang di server.** Nilai hasil perhitungan dari peramban tidak pernah dipercaya.',
        '- **Audit append-only.** Setiap operasi yang mengubah keadaan menulis entri log berantai hash',
        '  yang tidak dapat diubah maupun dihapus, termasuk oleh akun berhak penuh di basis data.',
        '',
        'Spesifikasi ini **dibangun** dari `docs/inventory/menu-form-action.csv`, yang digerbang dua arah',
        'terhadap kode penangan oleh `scripts/inventory/extract-actions.mjs`. Endpoint yang ada di kode',
        'tetapi tidak terdaftar, maupun sebaliknya, menggagalkan CI.',
      ].join('\n'),
      contact: { name: 'Tim CRMS institusi' },
      license: { name: 'Proprietary', identifier: 'LicenseRef-Proprietary' },
    },
    servers: [
      { url: 'https://{host}', description: 'Edge intranet institusi; tidak terjangkau dari internet.',
        variables: { host: { default: 'crms.intranet.local' } } },
    ],
    tags: [...tags.values()].sort((a, b) => a.name.localeCompare(b.name)),
    security: [{ institutionSso: [] }],
    components: {
      securitySchemes: {
        institutionSso: {
          type: 'http', scheme: 'bearer', bearerFormat: 'JWT',
          description:
            'Token OIDC dari penyedia identitas bank. Server memverifikasi tanda tangan, issuer, ' +
            'audience, masa berlaku, dan keanggotaan tenant. Header yang disediakan klien tidak dipercaya.',
        },
      },
      schemas: { Error: ERROR_SCHEMA },
      responses: Object.fromEntries(Object.entries(STANDARD_RESPONSES).map(([name, meta]) => [
        name,
        { ...meta, content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      ])),
    },
    paths: Object.fromEntries(Object.keys(paths).sort().map((k) => [k, paths[k]])),
  };
}

if (import.meta.filename === resolve(process.argv[1] || '')) {
  const inventory = await readInventory();
  const spec = buildOpenApi(inventory);
  await writeFile(join(ROOT, OPENAPI_PATH), JSON.stringify(spec, null, 2) + '\n', 'utf8');
  const operations = Object.values(spec.paths).reduce((n, p) => n + Object.keys(p).length, 0);
  process.stdout.write(
    `${OPENAPI_PATH}: ${Object.keys(spec.paths).length} path, ${operations} operasi, ` +
    `${spec.tags.length} tag\n`);
}
