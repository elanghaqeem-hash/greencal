# OJK 2026 Buku 7 — exhaustive arithmetic reconciliation of PDF-published annexes

Date: 31 October 2026. Scope: **all nine PDF tables already extracted into source-controlled GreenCal**, not the original full-precision OJK Excel datasets.

## Executable evidence

Run `node scripts/book7/reconcile-pdf-catalog.mjs`. The script independently interprets source decimal strings as signed-free 6-decimal BigInts, uses half-up arithmetic, verifies each exact-dimension lookup, and recomputes all applicable financed-risk transformations from the source-published values without substituting missing data.

The script asserts **3,479 source-table rows**, **30,492 readable numeric fields** (plus one explicitly blocked A.7 NaN position), **30,366 exact lookups** and **30,883 arithmetic checks**. These are programmatic coverage expectations, not a declaration that the original source PDF transcription is independent, nor a workbook-to-workbook Excel formula parity count.

| Table | Rows | Independent transformations |
| --- | ---: | --- |
| A.3 | 1,260 | Productive PD scenario scalar × baseline PD (9 years) |
| A.5 | 36 | Published percent → fraction; collateral haircut (9 years) |
| A.6 | 420 | CRE/non-CRE transition multiplier × valuation (9 years) |
| A.7 | 369 | Transition cost IDR and resulting property collateral; one 2027 NaN is rejected |
| A.8 | 21 | Rating band, PD TTC and boundaries match input table exactly |
| B.2 | 3 | Sovereign bonds PD scalar × baseline PD (9 years) |
| B.3 | 26 | Five annual US policy-rate paths 2025–2050, percent and rate-shock conversion |
| B.5 | 1,260 | Corporate securities PD scalar × baseline PD (9 years) |
| C.2 | 84 | One scenario-year; independent deposit/undrawn liquidity shock calculations |

Three input JSON SHA-256 digests in the output fingerprint the **repository-published catalog**, not the original PDF or full-precision XLSX. Unknown scenario, bucket, or missing values fail closed.

## OJK compliance disposition

- **PDF-catalog arithmetic:** auditable by full-coverage automated regression. Only this narrow layer may return PASS after CI.
- **PDF-extraction/source-transcription parity:** still requires a separate independent reviewer/checksum against original PDF tables and keying.
- **Original official Excel exact precision:** **NOT VERIFIED**, separate full-precision workbooks still required and not present in this repository.
- **Buku 3 Annex C:** 249 / 6,900 formulas recomputed from the original Excel 97–2003 workbook in the earlier isolated audit. Remaining 6,651 remain NOT_RECALCULATED. No blanket factor approval.
- **Buku 5 Annex 1/2:** staging is available, but duplicate geographical keys, postcode ambiguity, and Cengkareng mismatches remain pending.
- **Buku 6 XLSX:** official workbook format, input blue cells, locked formula cells, and round-trip equality remain unverified.
- **Bank regulated release:** **NO-GO** until official source copies are independently verified, workbook parity and bank UAT are signed, and Source Review/SSO/Data/Model/Release gates pass.

Source link: https://ojk.go.id/id/Publikasi/Roadmap-dan-Pedoman/Perbankan/Pages/Panduan-Climate-Risk-Management-and-Scenario-Analysis-Perbankan-CRMS-2026.aspx
