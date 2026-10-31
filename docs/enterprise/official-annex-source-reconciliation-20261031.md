# GreenCal CRMS OJK 2026 — Rekonsiliasi ulang sumber Excel asli (31 Okt 2026)

## Penanganan sumber
Tiga workbook asli dari Library pengguna berhasil didekripsi **secara baca-saja** menggunakan kata sandi yang diberikan pengguna pada diskusi sebelumnya. Sumber asli tidak diubah, tidak di-commit ke GitHub, dan tidak disimpan dalam build Vercel. Hasil berikut adalah **source-data census**, bukan pengesahan seluruh perhitungan bank atau verifikasi keaslian independen dari server OJK.

## Buku 5 — audit ulang sumber dua XLSX
- Lampiran 1 encrypted SHA-256: `ec43a6e771c085d865f0adbd76b73692758b0e9b97db613b21e8ea2b9b91fcbb`.
- Lampiran 2 encrypted SHA-256: `eb305da341f9e893b12921e4844644934341cfdc2ea523ee71efaaf0362592d7`.
- Tujuh score worksheets × **28.908 source rows**, total **202.356 raw hazard/combined records**. Each record has 3 pathways × 4 years, giving **2.428.272 source numeric scenario-year positions**.
- **0** missing/invalid source scores; all raw numeric values between 0–100.
- **0** baseline 2020 inconsistent values among the three pathways within each source row.
- **4 repeated location + asset keys per hazard sheet (28 repeated source records)**. Keep exceptions, do not treat as 28 different geographical districts.
- Official postal mapping **83.242 source rows**, **10.611 distinct postcodes**; **777** postcodes correspond to more than one administrative candidate, **119** Buku 5 IDs map to multiple candidates.
- Source anomaly: combined-score sheet row **2832** labels **CENGKARENG** under **DAERAH ISTIMEWA YOGYAKARTA**. Other hazard sheets disagree on geography. Do not silently reassign province or geocode.
- Previous curated staging and quarantine logic remains required. This census does not establish that 346.788 clean staging positions have been loaded into the bank-production PostgreSQL environment.

## Buku 6 — audit ulang official candidate Excel template

- User-provided encrypted candidate SHA-256: `61e6c05960a4340f7a3b21b772db62327f0e019c159cf29b89440e9204922857`. Decrypted XLSX SHA-256: `1104c5ed96de8d3e20dee2aeac98f4c2104917f29b04119f7ae867f7f9883338`.
- **12 sheets** (in exact order): Daftar Isi; Halaman Sampul; Pedoman Umum; Bagian A; B; C; D; E; F; G; H; I.
- **2.876 OOXML formula cells**, including **2.496 shared-formula tags**. A high-level spreadsheet importer initially detected only **673** explicit/expanded formula cells; **the 673 count is not the source-complete denominator**. Do not assert source formula parity using only importer-visible formulas.
- **12.489 light-blue, unlocked styled cells** are input-like candidates. This is a style census, **not** an approved writable-address allowlist.
- **133 formula cells on Bagian C** have `locked=0` in source cell format. Their original formula locations must be protected against user input despite style flags, pending independent review.
- Source formulas by sheet (direct + shared): B 365; C 833; D 749; E 833; F 90; G 6; others 0. Sum = 2.876.
- Input-like blue/unlocked cells: B 606; C 3.612; D 3.619; E 3.619; F 118; G 33; H 882; others 0. Sum = 12.489.
- Official workbook round-trip integrity, formula recalculation under bank data, exact blue-cell contract, template reproduction, GL/CKPN reconciliation and OJK report approval **remain NOT VERIFIED**. No full bank data was imported.

## Buku 3 source XLS and Buku 7 precision

- Buku 3 encrypted XLS was independently inventoried earlier: **35 sheets; 6.900 formula-cell records; 249 independently recalculated; 6.651 not recalculated**. Recovered original encrypted source: **available locally**, but this increment has not completed new XLS shared/named range recalculation. Workbook factor authority, GWP vintage, and two 10× investment examples require reviewer determination.
- Buku 7 source-controlled PDF catalog: **3.479 table rows, 30.492 readable numeric positions**, one explicit `NaN` on A.7 (2027). `scripts/book7/reconcile-pdf-catalog.mjs` cross-checks **30.366 lookups** and performs **30.883 financial arithmetic checks** using an independent 6-decimal BigInt implementation. These cover PDF-published rounded values only.
- Buku 7 Excel files containing full-precision OJK annex parameters are **not yet available**; PDF rounding cannot be treated as full workbook parity.

## Gate

**Bank regulated production readiness: NO-GO**. Required before PASS: original-source authenticity, all Buku 3 formulas/factor vintages, Buku 5 duplicate/address adjudication and approved staging load, Buku 6 exact workbook round-trip with bank portfolio, Buku 7 original precise Excel source, and independent Risk/Finance/Compliance/IT/model-validator sign-off.

The evidence metrics are exposed via `GET /api/ojk-readiness` under `officialAnnexReconciliation`, without exposing workbook bytes, password or customer data. They do not bypass `GC_ENTERPRISE_ENABLED`, identity access, tenant checks or approved release controls.

OJK source publication: https://ojk.go.id/id/Publikasi/Roadmap-dan-Pedoman/Perbankan/Pages/Panduan-Climate-Risk-Management-and-Scenario-Analysis-Perbankan-CRMS-2026.aspx.
