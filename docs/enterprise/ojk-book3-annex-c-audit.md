# Buku 3 OJK CRMS 2026 — Annex C encrypted XLS review and incremental integration

Status: **source inspected; multi-gas calculation implemented in internal feature-gated sandbox; FULL workbook parity and Bank approval NOT established**.

## Input custody and integrity

- Source: user-uploaded `Buku 3 - Kalkulator Emisi.xls` (Excel 97–2003, OLE/BIFF8).
- Size: **1,454,592 bytes**.
- SHA-256 of original encrypted attachment: `9f1724883888cd5e93a1db3bbc8b8b40062aeff760840c2819f885e3ea33566c`.
- Password supplied by authorized user and successfully validated using the workbook's RC4 password verifier. **Neither password nor decrypted workbook is committed to the public repository.**
- The attachment is claimed for use as the workbook described by **Lampiran C** in the user-supplied OJK Buku 3 PDF, PDF page 47. Its authenticity against the publisher's source and its complete formula set have not been independently certified.

## Source structure read from the decrypted BIFF8 workbook

**35 sheets** were enumerated: Pendahuluan; Pertanyaan Batasan; Ringkasan; Scope 1>>; S1-Pembakaran Stasioner; S1-Pembakaran Bergerak; S1-Pendinginan dan AC; S1-Pemadaman Kebakaran; S1-Gas yang Dibeli; S1-Emisi Proses; S1-Limbah; Scope 2>>; Listrik yang Dibeli; Uap yang Dibeli; Scope 3>>; S3-Cat 1 & 2; S3-Cat 3; S3-Cat 4 T&D Hulu; S3-Cat 5 Limbah; S3-Cat 6 Perjalanan Bisnis; S3-Cat 7 Commuting; S3-Cat 8 Aset Sewa Hulu; S3-Cat 9 T&D Hilir; S3-Cat 10; S3-Cat 11; S3-Cat 12; S3-Cat 13 Aset Sewa Hilir; S3-Cat 14 Waralaba; S3-Cat 15 Investasi; Offsets; DropDown (hidden); Bantuan>>; Faktor Emisi (hidden); Heat Content; Konversi Satuan.

- `Faktor Emisi`: about 1,000 source rows, fuel/transport/electricity/GWP/waste and other factor families. There are **154 electricity subregional rows at A59:A212**. The header at A57 references eGRID 2022 / January 2024; this source context needs independent confirmation for Indonesian grids, and **cannot be auto-assigned reporting-year 2026**.
- `Faktor Emisi!A330:C333`: 100-year GWP: CO2 = **1**, CH4 = **28**, N2O = **265**. The sheet cites IPCC Fifth Assessment Report (AR5).
- `Faktor Emisi!A9:H9`: Distillate Fuel Oil No. 2, CO2 = **10.21 kg/gallon**, CH4 = **0.41 g/gallon**, N2O = **0.08 g/gallon**. This is a **source vector for isolated arithmetic testing**, not approval to use the factor for any reporting year.
- `Heat Content` and `Konversi Satuan` provide conversion references; not all pairs and factors have been reconciled.
- Real source examples/sample rows in the workbook must not be treated as approved Bank datasets.

## Reproducible arithmetic and implemented adapter

Internal `book3GasActivity` applies one final exact-decimal rounding, using **24-decimal precision for submitted factors** and OJK workbook's GWP AR5:

```text
tCO2e = Activity × [CO2 (kg/unit) + CH4 (g/unit) × 28 / 1000
                  + N2O (g/unit) × 265 / 1000] / 1000
```

For **100 gallons** and the fuel factor vector at `Faktor Emisi!A9:H9`:
- CO2 = 100 × 10.21 kg = 1,021 kg.
- CH4 in CO2e = 100 × 0.41 g × 28 = 1,148 g = 1.148 kg.
- N2O in CO2e = 100 × 0.08 g × 265 = 2,120 g = 2.12 kg.
- **Total = 1.024268 tCO2e**, covered by `tests/book3.test.mjs`.

Request: existing `POST /api/enterprise/book3/validate` with kind `gas_activity` and factor values, activity/unit, reporting year, source tier, source reference, factor vintage, and `gwpVersion: "IPCC_AR5_100_YEAR"`. Existing tenant identity/role rules and `GC_ENTERPRISE_BOOK3_ENABLED` remain unchanged. Gas-specific factors are intentionally **provided explicitly for every calculation**; no workbook-wide factor table or automatic factor selection is activated in production.

## Important discrepancy — Scope 3 Category 15

Workbook `S3-Cat 15 Investasi`:
- Row 13: **ownership 50%**, investee Scope 1+2 **15,000 tCO2e**, cached output `I13 = 750` tCO2e. Straight ownership fraction yields **7,500** tCO2e.
- Row 14: **ownership 80%**, investee emissions **0.5 tCO2e**, cached output `I14 = 0.04` tCO2e. Straight ownership fraction yields **0.4** tCO2e.
- These examples exhibit a **10× difference** from simple percentage attribution. The RPN formulas include division by 1,000; verify original formula semantics, units, and template calculation with OJK/model owner before importing these outputs.
- **Do not change** the existing Buku 3 proportional financed-emissions engine to imitate this Category 15 example automatically. Buku 3 §§3.1–3.3 requires class-specific PCAF denominators, main attributed Scope 1+2, and separately disclosed Scope 3. The workbook's generic ownership/spend template is not equivalent to the bank's class-specific PCAF rule.

## Pending reconciliation and release gate

1. Establish whether the attachment version/format is publisher-authorized, and source/hash of the canonical workbook.
2. Independently review the **full formula/RPN dependencies**, named ranges, protected input cells, and all 35 worksheet paths; compare multiple synthetic reference runs in Excel against the GreenCal engine.
3. For every imported factor: require `factor ID`, `scope`, gas, value, exact unit, location/grid, sector, source URL/document, factor year/effective dates, GWP version, approval and supersession. **Do not bulk seed reference values by assuming year applicability**.
4. Review GWP mix, direct CO2 vs CO2e and grid factor header (national grid vs eGRID wording), prevent combustion/mobile/well-to-tank duplicates, validate converted units.
5. Reconcile Book 3 debtor emissions vs bank Category 15 financed emissions; document Category 15 numerical anomaly and independent resolution.
6. Confirm Bank identity, PostgreSQL, approval workflow, synthetic UAT, independent model validation, source-to-Buku 6 reporting and release approvals before enabling the feature flag on Bank production.

**Classification:** partially integrated / independent model validation outstanding. No official workbook parity, regulatory submission, confidential-bank-data processing authorization, or production operational readiness is asserted.
