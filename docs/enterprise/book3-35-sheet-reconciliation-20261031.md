# Audit Reconciliation — OJK CRMS Buku 3 Annex C (35 Worksheets)

Date: 2026-10-31. Source: the user-supplied password-protected Excel 97–2003 `Buku 3 - Kalkulator Emisi.xls`.
Encrypted file SHA-256: `9f1724883888cd5e93a1db3bbc8b8b40062aeff760840c2819f885e3ea33566c`.
This audit is **partial independent computational reconciliation, not workbook-wide parity or institutional sign-off**.

## Coverage actually achieved
- Password verifier passed. OLE/BIFF8 workbook stream parsed across **36,340 BIFF records**, identifying **35 worksheets** (33 visible, two hidden: `DropDown`, `Faktor Emisi`).
- Indexed **6,900 FORMULA cell records** and **15,414 non-empty stored/cached cells**. All formula records have sheet, cell, cached value, BIFF token length and token fingerprint in the private offline workpaper.
- **249/6,900 formula cells independently recalculated with source cached numeric references and matching results** (tolerance: 1e-7 + abs(cached)×1e-8). Remaining **6,651** are **NOT_RECALCULATED**, principally because the small offline interpreter does not implement defined names (3,111), shared-formula expansion (2,386), string/conditional logic (988), nonnumeric inputs or other Excel tokens. `NOT_RECALCULATED` must **never be mapped to PASS**.
- All **2,087 numerical constants/cached formula cells** across `Faktor Emisi` (1,986), `Heat Content` (55) and `Konversi Satuan` (46) are indexed by source cell and neighboring label in the *private* workpaper. **These are NOT 2,087 verified emission factors**; some are calculations or conversions. They have no blanket factor-year, authority or unit approval.
- **31 cached errors** are confined to hidden `DropDown`: `I2:I7` = six #REF! (BIFF 0x17); `D131:D155` = 25 #N/A (0x2A). Their dependencies and impact require examination; other sheets have no cached BIFF error-type results in this snapshot.
- Source electricity entries: **154 named rows** in `Faktor Emisi!A59:A212`. Despite Indonesian electricity region labels (e.g. 3 Nusa, Wetar), `A57` says `eGRID 2022 (eGRID Subregion), January 2024`. The factor-source heading/region/jurisdiction is an unresolved quality-control issue; **do not assume any factor is applicable to 2026, or approve via header text**.
- Annex C `Faktor Emisi!C331:C333` has 100-year GWP CO2=1, CH4=28, N2O=265 (IPCC AR5). Verified isolated fuel-factor vector `E9:G9` = CO2 10.21 kg/gal, CH4 0.41 g/gal, N2O 0.08 g/gal: 100 gal → **1.024268 tCO2e** under AR5. This is **arithmetic parity for one input vector**, not whole-sheet approval.

## Worksheet-by-worksheet FORMULA record inventory (not per-sheet validity)

| Worksheet | Formulas | Independent PASS |
|---|---:|---:|
| Pendahuluan | 0 | 0 |
| Pertanyaan Batasan | 0 | 0 |
| Ringkasan | 74 | 56 |
| Scope 1>> | 0 | 0 |
| S1-Pembakaran Stasioner | 247 | 9 |
| S1-Pembakaran Bergerak | 316 | 2 |
| S1-Pendinginan dan AC | 124 | 1 |
| S1-Pemadaman Kebakaran | 107 | 0 |
| S1-Gas yang Dibeli | 39 | 0 |
| S1-Emisi Proses | 712 | 21 |
| S1-Limbah | 840 | 14 |
| Scope 2>> | 0 | 0 |
| Listrik yang Dibeli | 237 | 7 |
| Uap yang Dibeli | 320 | 0 |
| Scope 3>> | 0 | 0 |
| S3-Cat 1 & 2 | 270 | 0 |
| S3-Cat 3 | 194 | 10 |
| S3-Cat 4 T&D Hulu | 307 | 6 |
| S3-Cat 5 Limbah | 840 | 14 |
| S3-Cat 6 Perjalanan Bisnis | 221 | 4 |
| S3-Cat 7 Commuting | 295 | 6 |
| S3-Cat 8 Aset Sewa Hulu | 237 | 5 |
| S3-Cat 9 T&D Hilir | 289 | 6 |
| S3-Cat 10 | 313 | 1 |
| S3-Cat 11 | 248 | 1 |
| S3-Cat 12 | 135 | 1 |
| S3-Cat 13 Aset Sewa Hilir | 85 | 5 |
| S3-Cat 14 Waralaba | 53 | 6 |
| S3-Cat 15 Investasi | 141 | 1 |
| Offsets | 19 | 1 |
| DropDown (hidden) | 36 | 0 |
| Bantuan>> | 0 | 0 |
| Faktor Emisi (hidden) | 159 | 33 |
| Heat Content | 38 | 36 |
| Konversi Satuan | 4 | 3 |
| **TOTAL** | **6900** | **249** |

## Open exceptions and required resolution

- **B3-AC-P0-01 — Investment ownership.** `S3-Cat 15 Investasi!F13=50;G13=15000;I13 cached=750`, while 50%×15,000=7,500; `F14=80;G14=0.5;I14 cached=0.04` vs 80%×0.5=0.4. BIFF RPN contains a divisor of 1000 in both formulas. **10× difference**; check original workbook formula semantics, percentage scales and author intent. Do not alter Bank PCAF per-asset-class logic to match this generic example.
- **B3-AC-P0-02 — Electricity factor header.** 154 Indonesian-grid entries under an eGRID 2022 heading need source, region, version and period verification against authoritative KLH/KESDM records.
- **B3-AC-P0-03 — Factor unit/source/vintage approval.** Every used factor and heat-content/conversion constant needs source, jurisdiction, gas, units, 2026 applicability, effective date, approval/supersession; fail closed, no automatic import.
- **B3-AC-P0-04 — Formula parity.** 6,651 unexecuted formulas and shared/named range/function logic; perform full native-runtime recalculation, source input capture and cell-by-cell variance analysis.
- **B3-AC-P1-05 — Hidden errors.** Trace 6 #REF! and 25 #N/A cached error values on `DropDown` and any dependent named ranges.
- **B3-AC-P0-06 — Bank reporting.** Validate Scope 1 debtor carbon cost vs separate financed S1+S2, supplementary S3, double counting, CRSA links and Buku 6 report lineage with approved synthetic/Bank data.

## Controlled implementation boundary

Existing `book3GasActivity` remains a **feature-gated simulator** and `book3Financed` uses Buku 3 class-specific PCAF denominators; no approved factor master import, workbook password, decrypted original, private workpaper, or bank data is committed here. A GitHub merge and successful Vercel build do **not** mean the 35-sheet reference calculator is fully reconciled or regulatory reporting approved.

The downloadable audit workpaper prepared within the active ChatGPT conversation contains: Dashboard, 35 Worksheet Audit, 2087 Factor Cells, 6900 Formula Cells, Exception Register and Method & Limitations. The two separate CSV registers retain all inventoried source-factor numeric cells and all formula-cell locations/statuses. Keep those files outside the **public** GitHub repository.

**Release verdict: NO-GO for enabling official/Bank-operational Annex C factor ingestion until all P0 gates pass with independent validation evidence.**
