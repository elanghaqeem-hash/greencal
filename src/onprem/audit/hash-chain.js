// Audit log append-only dengan hash berantai.
// Master Execution Prompt v2.0 Bagian 08.2 dan 09.1:
//   setiap event menyimpan hash event sebelumnya; salinan ke penyimpanan WORM;
//   waktu tersinkron NTP; diteruskan ke SIEM bank.
//
// Rantai hash membuat penghapusan atau penyisipan di tengah log terdeteksi:
// mengubah satu event memutus hash seluruh event sesudahnya.

import { createHash, timingSafeEqual } from 'node:crypto';

export const GENESIS_HASH = '0'.repeat(64);

/** Kanonikalisasi deterministik: kunci objek diurutkan, tanpa spasi. */
export function canonicalize(value) {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value.toJSON === 'function') return canonicalize(value.toJSON());
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
}

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/**
 * Bidang yang masuk ke dalam hash. Ditetapkan eksplisit agar penambahan kolom
 * baru di masa depan tidak mengubah hash event lama secara diam-diam.
 */
const HASHED_FIELDS = Object.freeze([
  'sequence', 'tenantId', 'occurredAt', 'eventType', 'actorSubject', 'actorRole',
  'resourceKind', 'resourceId', 'action', 'outcome', 'payloadDigest', 'prevHash',
]);

export function computeEventHash(event) {
  const subset = {};
  for (const f of HASHED_FIELDS) subset[f] = event[f] ?? null;
  return sha256(canonicalize(subset));
}

export class AuditChainError extends Error {
  constructor(code, message) { super(message); this.name = 'AuditChainError'; this.code = code; }
}

/**
 * Pembangun rantai audit. Hanya mendukung append; tidak ada metode ubah atau
 * hapus, sesuai sifat append-only yang disyaratkan.
 */
export class AuditChain {
  constructor({ tenantId, events = [] } = {}) {
    if (!tenantId) throw new AuditChainError('TENANT_REQUIRED', 'tenant_id wajib ada pada rantai audit.');
    this.tenantId = tenantId;
    this._events = [];
    for (const e of events) this.append(e, { trusted: true });
  }

  get events() { return Object.freeze([...this._events]); }
  get length() { return this._events.length; }
  get headHash() { return this._events.length ? this._events[this._events.length - 1].hash : GENESIS_HASH; }

  /**
   * Menambahkan satu event. Payload tidak disimpan utuh di dalam hash; yang
   * di-hash adalah digest-nya, sehingga data nasabah tidak ikut tersalin ke
   * SIEM sementara integritasnya tetap terjaga.
   */
  append(input, { trusted = false } = {}) {
    if (!input || typeof input !== 'object') throw new AuditChainError('MALFORMED_EVENT', 'Event audit harus objek.');
    if (!input.eventType) throw new AuditChainError('EVENT_TYPE_REQUIRED', 'eventType wajib diisi.');
    if (!input.occurredAt || Number.isNaN(Date.parse(input.occurredAt))) {
      throw new AuditChainError('TIMESTAMP_REQUIRED', 'occurredAt wajib berupa waktu ISO yang sah dan tersinkron NTP.');
    }
    if (input.tenantId && input.tenantId !== this.tenantId) {
      throw new AuditChainError('TENANT_MISMATCH', 'Event milik tenant lain tidak dapat masuk ke rantai ini.');
    }

    const sequence = this._events.length + 1;
    const prevHash = this.headHash;
    const payloadDigest = input.payloadDigest
      ?? (input.payload === undefined ? null : sha256(canonicalize(input.payload)));

    const event = {
      sequence,
      tenantId: this.tenantId,
      occurredAt: input.occurredAt,
      eventType: input.eventType,
      actorSubject: input.actorSubject ?? null,
      actorRole: input.actorRole ?? null,
      resourceKind: input.resourceKind ?? null,
      resourceId: input.resourceId ?? null,
      action: input.action ?? null,
      outcome: input.outcome ?? null,
      payloadDigest,
      prevHash,
    };
    event.hash = computeEventHash(event);

    if (trusted && input.hash && input.hash !== event.hash) {
      throw new AuditChainError('HASH_MISMATCH_ON_LOAD',
        `Event urutan ${sequence} memiliki hash yang tidak cocok saat dimuat; rantai kemungkinan telah diubah.`);
    }

    Object.freeze(event);
    this._events.push(event);
    return event;
  }

  /**
   * Verifikasi seluruh rantai. Mengembalikan daftar temuan, bukan melempar,
   * agar auditor dapat melihat semua kerusakan sekaligus.
   */
  verify() {
    const findings = [];
    let expectedPrev = GENESIS_HASH;
    for (let i = 0; i < this._events.length; i += 1) {
      const e = this._events[i];
      if (e.sequence !== i + 1) {
        findings.push({ sequence: e.sequence, code: 'SEQUENCE_GAP', detail: `urutan seharusnya ${i + 1}` });
      }
      if (e.prevHash !== expectedPrev) {
        findings.push({ sequence: e.sequence, code: 'CHAIN_BROKEN', detail: 'prevHash tidak cocok dengan hash event sebelumnya' });
      }
      const recomputed = computeEventHash(e);
      if (!safeEqualHex(recomputed, e.hash)) {
        findings.push({ sequence: e.sequence, code: 'EVENT_TAMPERED', detail: 'hash tidak cocok dengan isi event' });
      }
      if (i > 0 && Date.parse(e.occurredAt) < Date.parse(this._events[i - 1].occurredAt)) {
        findings.push({ sequence: e.sequence, code: 'CLOCK_REGRESSION', detail: 'waktu event lebih awal dari event sebelumnya' });
      }
      expectedPrev = e.hash;
    }
    return Object.freeze({ valid: findings.length === 0, findings: Object.freeze(findings) });
  }

  /** Batch untuk diteruskan ke SIEM bank dan penyimpanan WORM. */
  exportForWorm() {
    return Object.freeze({
      tenantId: this.tenantId,
      count: this._events.length,
      headHash: this.headHash,
      events: this.events,
      manifestDigest: sha256(canonicalize(this._events.map((e) => e.hash))),
    });
  }
}

function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

export { sha256 };
