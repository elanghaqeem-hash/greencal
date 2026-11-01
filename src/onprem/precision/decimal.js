// Aritmetika desimal eksak dengan semantik NUMERIC(38,12).
//
// Master Execution Prompt v2.0 Bagian 01.1 butir 3 dan 4:
//   - Uang dan parameter memakai aritmetika desimal. Floating point DILARANG
//     untuk nilai keuangan dan faktor.
//   - Pembulatan hanya pada tampilan dan sel laporan. Nilai antara disimpan
//     presisi penuh.
//
// Implementasi memakai BigInt dengan skala tetap 12 desimal. Presisi total
// dibatasi 38 digit signifikan agar cocok dengan NUMERIC(38,12) di PostgreSQL,
// sehingga nilai dapat bolak-balik antara aplikasi dan basis data tanpa
// kehilangan digit.

export const SCALE = 12;
export const PRECISION = 38;
const POW = 10n ** BigInt(SCALE);
const MAX_UNSCALED = 10n ** BigInt(PRECISION) - 1n; // 38 digit signifikan
const INPUT_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

export class DecimalError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DecimalError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new DecimalError(code, message); };

const guard = (unscaled) => {
  if (unscaled > MAX_UNSCALED || unscaled < -MAX_UNSCALED) {
    fail('NUMERIC_OVERFLOW', `Nilai melampaui NUMERIC(${PRECISION},${SCALE}).`);
  }
  return unscaled;
};

/** Representasi desimal tetap. Tidak pernah memakai Number secara internal. */
export class Decimal {
  /** @param {bigint} unscaled nilai dikali 10^SCALE */
  constructor(unscaled) {
    if (typeof unscaled !== 'bigint') fail('INVALID_INTERNAL', 'Nilai internal harus BigInt.');
    this.unscaled = guard(unscaled);
    Object.freeze(this);
  }

  // --- Konstruksi ---------------------------------------------------------

  /**
   * Membuat Decimal dari teks. Number TIDAK diterima: melewatkan float ke sini
   * akan menyelundupkan galat pembulatan biner ke jalur keuangan, sehingga
   * ditolak secara eksplisit.
   */
  static from(value, name = 'nilai') {
    if (value instanceof Decimal) return value;
    if (typeof value === 'bigint') return new Decimal(guard(value * POW));
    if (typeof value === 'number') {
      fail('FLOAT_FORBIDDEN', `${name}: floating point dilarang untuk nilai keuangan; berikan teks desimal.`);
    }
    if (typeof value !== 'string') fail('INVALID_TYPE', `${name} harus teks desimal.`);
    const text = value.trim();
    if (!INPUT_RE.test(text)) fail('INVALID_FORMAT', `${name} bukan teks desimal yang sah: ${JSON.stringify(value)}`);
    const negative = text.startsWith('-');
    const body = negative ? text.slice(1) : text;
    const [whole, fraction = ''] = body.split('.');
    if (fraction.length > SCALE) {
      fail('SCALE_EXCEEDED', `${name} memiliki ${fraction.length} desimal; maksimum ${SCALE}.`);
    }
    const digits = whole + fraction.padEnd(SCALE, '0');
    const unscaled = BigInt(digits);
    return new Decimal(guard(negative ? -unscaled : unscaled));
  }

  static zero() { return ZERO; }
  static one() { return ONE; }

  // --- Aritmetika --------------------------------------------------------

  add(other) { return new Decimal(this.unscaled + Decimal.from(other).unscaled); }
  sub(other) { return new Decimal(this.unscaled - Decimal.from(other).unscaled); }

  /** Perkalian dengan pembulatan half-up pada digit ke-13, deterministik. */
  mul(other) {
    const product = this.unscaled * Decimal.from(other).unscaled;
    return new Decimal(divRoundHalfUp(product, POW));
  }

  /** Pembagian dengan pembulatan half-up. Pembagi nol gagal keras. */
  div(other) {
    const divisor = Decimal.from(other).unscaled;
    if (divisor === 0n) fail('DIVISION_BY_ZERO', 'Pembagian dengan nol.');
    return new Decimal(divRoundHalfUp(this.unscaled * POW, divisor));
  }

  neg() { return new Decimal(-this.unscaled); }
  abs() { return this.unscaled < 0n ? this.neg() : this; }

  /** Pemangkatan bilangan bulat non-negatif, dipakai untuk faktor diskonto. */
  pow(exponent) {
    if (!Number.isInteger(exponent) || exponent < 0) {
      fail('INVALID_EXPONENT', 'Eksponen harus bilangan bulat non-negatif.');
    }
    let result = ONE;
    let base = this;
    let n = exponent;
    while (n > 0) {
      if (n & 1) result = result.mul(base);
      base = base.mul(base);
      n >>= 1;
    }
    return result;
  }

  // --- Perbandingan ------------------------------------------------------

  cmp(other) {
    const o = Decimal.from(other).unscaled;
    return this.unscaled < o ? -1 : this.unscaled > o ? 1 : 0;
  }

  eq(other) { return this.cmp(other) === 0; }
  lt(other) { return this.cmp(other) < 0; }
  lte(other) { return this.cmp(other) <= 0; }
  gt(other) { return this.cmp(other) > 0; }
  gte(other) { return this.cmp(other) >= 0; }
  isZero() { return this.unscaled === 0n; }
  isNegative() { return this.unscaled < 0n; }

  // --- Keluaran ----------------------------------------------------------

  /** Teks presisi penuh. Inilah bentuk yang disimpan dan di-hash. */
  toString() {
    const negative = this.unscaled < 0n;
    const digits = (negative ? -this.unscaled : this.unscaled).toString().padStart(SCALE + 1, '0');
    const whole = digits.slice(0, -SCALE);
    const fraction = digits.slice(-SCALE);
    return `${negative ? '-' : ''}${whole}.${fraction}`;
  }

  toJSON() { return this.toString(); }

  /**
   * Pembulatan untuk TAMPILAN atau sel laporan saja. Mengembalikan teks,
   * bukan Decimal, agar nilai yang dibulatkan tidak masuk kembali ke
   * perhitungan antara.
   */
  toFixedString(places) {
    if (!Number.isInteger(places) || places < 0 || places > SCALE) {
      fail('INVALID_PLACES', `Jumlah desimal tampilan harus 0 sampai ${SCALE}.`);
    }
    const factor = 10n ** BigInt(SCALE - places);
    const rounded = divRoundHalfUp(this.unscaled, factor);
    const negative = rounded < 0n;
    const digits = (negative ? -rounded : rounded).toString().padStart(places + 1, '0');
    const whole = places === 0 ? digits : digits.slice(0, -places);
    const fraction = places === 0 ? '' : digits.slice(-places);
    return `${negative ? '-' : ''}${whole}${places ? `.${fraction}` : ''}`;
  }

  /**
   * Konversi ke Number HANYA untuk keperluan non-keuangan seperti grafik.
   * Dinamai eksplisit agar pemakaiannya mudah ditemukan saat audit.
   */
  toUnsafeNumber() { return Number(this.toString()); }
}

/** Pembagian BigInt dengan pembulatan half-up menjauhi nol, deterministik. */
function divRoundHalfUp(numerator, denominator) {
  const negative = (numerator < 0n) !== (denominator < 0n);
  const a = numerator < 0n ? -numerator : numerator;
  const b = denominator < 0n ? -denominator : denominator;
  const quotient = a / b;
  const remainder = a % b;
  const rounded = remainder * 2n >= b ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

const ZERO = new Decimal(0n);
const ONE = new Decimal(POW);

// --- Pembantu agregasi ---------------------------------------------------

/** Penjumlahan deterministik: hasil tidak bergantung pada urutan masukan. */
export function sum(values) {
  let total = 0n;
  for (const v of values) total += Decimal.from(v).unscaled;
  return new Decimal(guard(total));
}

/** Rata-rata tertimbang. Bobot nol total gagal keras, bukan mengembalikan nol. */
export function weightedAverage(pairs) {
  let numerator = ZERO;
  let denominator = ZERO;
  for (const [value, weight] of pairs) {
    const w = Decimal.from(weight);
    numerator = numerator.add(Decimal.from(value).mul(w));
    denominator = denominator.add(w);
  }
  if (denominator.isZero()) fail('ZERO_WEIGHT', 'Total bobot nol; rata-rata tertimbang tidak terdefinisi.');
  return numerator.div(denominator);
}

export const D = (v, name) => Decimal.from(v, name);
