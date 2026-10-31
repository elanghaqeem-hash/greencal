# GreenCal CRMS Enterprise — Penerapan PDF Lampiran Buku 7 (31 Oktober 2026)
## Status
**Source code staged; full-precision regulatory source approval = NO-GO.** The user supplied:
1. **Lampiran 1 – Risiko Kredit.pdf**, 75 pages, Lampiran A.
2. **Lampiran 2 – Risiko Pasar dan Likuiditas.pdf**, 47 pages, Lampiran B and C.

Both PDF covers explicitly state that numerical values are *rounded for presentation* and **full-precision source values exist in separate workbook files**. GreenCal therefore records `precision: PDF_PUBLISHED_ROUNDED`, `fullPrecisionWorkbookVerified:false`, and `officialSubmission:false` in each lookup. Extracting a PDF is **not** approval for regulatory production or proof that a published table equals the underlying workbook. No bank data, model credentials or private account details are stored with this patch.

## Extracted and cross-checked numerical catalog
| Source / PDF page | Table | Rows | Dimensions / intended application |
|---|---|---:|---|
| Credit pp 3–41 | A.3.a/b/c | 1,260 | Productive credit PD multipliers across 3 scenarios × 4 sizes × 3 location risks × 7 sectors × 5 rating buckets; 9 projection years |
| Credit pp 42–43 | A.5 | 36 | Physical collateral **haircuts in percent**: 3 scenarios × 4 collateral kinds × 3 location risk tiers; 9 years |
| Credit pp 44–58 | A.6.a/b/c | 420 | Transition collateral multipliers: 3 scenarios × 4 sizes × 7 sectors × 5 ratings; 9 years |
| Credit pp 59–74 | A.7.a–h | 369 | Property transition **cost IDR** for office, retail mall, warehouse, mixed use, multi-family, budget hotel, 3+ star hotel and residential. Exact printed size/EUI buckets; 9 years |
| Credit p 75 | A.8 | 21 | Moody's granular rating, baseline TTC PD percent, AA/A/BA/B/C bucket, range percent |
| Market pp 2 | B.2 | 3 | Government of Indonesia IDR/USD bond PD multiplier for three NGFS Phase 5 scenarios × 9 years |
| Market pp 3 | B.3 | 26 | Annual projected US Federal Funds Rate 2025–2050, Baseline / Net Zero / Delayed / Current / NDC; **percent** |
| Market pp 5–43 | B.5.a/b/c | 1,260 | Corporate bond/sukuk PD scalar, same five dimensions as A.3; 9 years |
| Market pp 44–47 | C.2 | 84 | **Net Zero 2050 for 2026 only**; 4 sizes × 3 location risks × 7 sectors; additional deposit outflow (%) and undrawn commitment drawdown (%) |

**Total rows** = 3,479 (1,260 + 36 + 420 + 369 + 21 + 3 + 26 + 1,260 + 84). All row and dimension counts are asserted programmatically. All rows carry PDF source page; no default values, interpolated missing years or fallback rating buckets.

### Quarantined source cell
Credit PDF **page 63**, **Table A.7.b retail mall**, **Delayed Transition**, **size `0-5` thousand m²**, **EUI `Tidak Memenuhi Klasifikasi`**, **year 2027** contains **`NaN`** in the parsed source table. A.7 dataset stores `null` (not 0) and `book7AnnexLookup` rejects that precise combination with an explicit model input error. No guessing, neighbor interpolation, imputation or substitution permitted. The 368 other row vectors remain available as PDF-precision source values; source validation and real workbook parity are mandatory.

## Implementation
- `src/enterprise/book7-annex-credit-data.js`: immutable authored catalog A.3, A.5, A.6, A.8.
- `src/enterprise/book7-annex-cre-rre-data.js`: A.7 cost rows, special source anomaly.
- `src/enterprise/book7-annex-market-data.js`: B.2, B.3, B.5, C.2.
- `src/enterprise/book7-annex.js`: exact-dimensional `book7AnnexLookup`, controlled `book7AnnexStress`, automatic percent-to-rate conversion, source provenance, controlled calculator application, rejection of unknown dates/buckets/outliers.
- `src/enterprise/quant-api.js`: runs are routed under existing bank Access JWT + institutional tenant + role isolation and immutable analyst-run lineage. New kinds: `book7_annex_lookup`, `book7_annex_stress`, both require `GC_ENTERPRISE_QUANT_ENABLED=true` and `GC_ENTERPRISE_BOOK7_ENABLED=true`. They are **OFF by default**.
- `assets/enterprise-analytics.js`: analyst UI in the existing **Buku 7 · Pendekatan Standar** workspace (JSON forms with explicit dimension guidance).
- `tests/book7-annex-parameter.test.mjs`: source cardinality and uniqueness, sample cells, six-decimal math, percent conversion, conditional-access negative paths and explicit anomalous-cell rejection.

### API example
```json
{"kind":"book7_annex_stress","input":{"table":"A.3","scenario":"net_zero_2050","year":2026,"size":"Mikro","locationRisk":"Tinggi","sector":"Pertanian dan Kehutanan","rating":"AA","baselinePD":"0.0005"}}
```
The published PDF scalar for the example is **1.1466** (credit PDF p 3); the resulting adjusted PD is **0.000573**, a bank-internal PDF-precision estimate, not a workbook-equivalent regulatory metric.

```json
{"kind":"book7_annex_stress","input":{"table":"C.2","scenario":"net_zero_2050","year":2026,"size":"Mikro","locationRisk":"Tinggi","sector":"Pertanian dan Kehutanan","component":"deposit","balance":"1000000","baselineRate":"0.05"}}
```
Published additional deposit outflow = **0.5988% = 0.005988** (market/liquidity PDF p 44); additional expected outflow on this synthetic IDR million balance = IDR 5,988. Only table **C.2** specifies the 2026 Net Zero combination: the engine rejects unsupported scenarios and years, without inventing values.

A.7 example: `table:"A.7", scenario:"net_zero_2050", year:2026, propertyType:"office", sizeBand:"0-5", euiClass:"Hijau"` yields transition cost **334536487 IDR**, sourced from credit PDF p 59. `sizeBand` is matched as printed, **never** automatically bucketed by area until certified range definitions are provided.

## Explicit limitations
1. No original full-precision official Excel source/workbook or workbook SHA/row parity; **no official spreadsheet approval**.
2. PDF values are rounded; repeated application at multiple stages may accumulate approximation differences. Do not compare rounded output with regulator Excel using a zero-tolerance match.
3. **A.7** contains `NaN` source text at the cited cell, requires authorised clarification from original workbook. A.7 property-size bucket boundaries in the PDF include printed overlapping ranges in some property types; use explicit assigned bucket, never infer from size.
4. A.8 provides Moody's granular rating labels; cross-agency S&P/Fitch mapping must be approved and validated separately.
5. Bucket inputs (sector, size, physical location, collateral type and property energy use/EUI) require verified crosswalk from actual CBS, collateral and Buku 5. No PDF annex alone provides the bank-specific mapping.
6. B.3 provides scenario projections of federal-funds *percentage rates*, not independently the bank's investment pricing sensitivities. Bond CS01/PV01/yield curves, FX conversion, market ATMR and credit rating migration remain required.
7. C.2 source covers the **2026 Net Zero** LCR incremental shock only and cannot be extrapolated to other scenarios or years.
8. PDF data is a reference catalog; Bank-controlled CBS/GL/CKPN/D1 staging, document signed-source SHA checks, dataset licensing, three-way reviewer workflow, independent model validation, audit evidence, bank UAT, backup/restore and regulated reporting gates remain unresolved.

## Release decision
Merge of source code into `main` is allowed after CI, **only behind disabled flags**. **Do not set production enterprise feature flags or claim official OJK regulatory reporting until bank data owner, Risk, Finance, Compliance, IT and model validation approve the workbook, mapping and implementation.**
