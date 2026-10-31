# OJK Buku 6 2026 → GreenCal CRMS Enterprise (internal implementation dossier)
**Date**: 31 October 2026. **Source**: user-supplied 81-page PDF, *Buku 6 Kertas Kerja CRMS Perbankan 2026*, OJK, and OJK's 6 October 2026 publication page. Page references below use **printed** page numbers. An additional .xlsx named *OJK_Kertas Kerja Perlaporan Buku 6 2026.xlsx* was provided in the conversation on 31 October 2026 (236,032 bytes), along with an unlock password. **Its contents, authenticity, cells, formulas and hash have not yet been verified** because the local file processing runtime failed and the text extraction service returned no readable content. Do not equate receipt with a verified OJK original. The password is not recorded in this repository. This release does **not** create, fill or modify that official .xlsx.

## Implementation map
| OJK Buku 6 | Page(s) | GreenCal representation | Status |
| --- | --- | --- | --- |
| Informasi Bank and Panduan Umum | 7–9 | Bank identity/PIC + 14 versioned responses/evidence links | Draft schema + editor |
| A.1.1–A.1.5 readiness, mitigation, scope, datasets | 14–16 | 30 qualitative questions; external reference & method evidence | Draft schema + editor |
| A.2.1–A.2.3 governance, strategy, risk management | 17–18 | 14 qualitative questions | Draft schema + editor |
| A.3.1–A.3.4 disclosure | 19–20 | 23 qualitative questions | Draft schema + editor |
| B.1 GRK | 24–25 | sector Scope 1–3, financed share/emissions, 2050 target | Typed metric register; no bank values |
| B.2 outstanding/weighted maturity | 25 | sector/tenor dimensions and weighted maturity | Typed metric register |
| B.3 credit and stages or collectability | 26–27 | EAD, Stage 1/2/3, CKPN, income, ATMR, weighted PD/LGD | Typed metric register; no ECL ledger integration |
| B.4–B.6 market/securities and own emissions | 28–29 | bond exposure / capital charge/market RWA; emission inventory | Typed metric register |
| C (Net Zero 2050), D (Delayed Transition), E (Current Policies) | 34–46 | scenario-bound grid t, t+1, t+2, t+3, 2030, 2040, 2050; sector, top 10, collateral, market, CAR | Typed input grid only; calculations remain Book 7 / bank model engine |
| F.1 LCR and F.2 Loan to Deposit | 50–52 | baseline vs climate, component classification | Typed input register; OJK source's component-specific climate adjustment needs dedicated engine |
| G.1 transition & G.2 physical operational loss | 56–57 | expense categories t+1 and physical asset loss t+1/2030 | Draft metric input |
| H.1 securities inventory | 62 | 13 official instrument fields and variable number of rows | Versioned instrument input |
| I Executive Summary | 66–68 | narrative plus 11-aspect minimum report checklist | Narrative draft; not yet automatically generated / approved |

### Implementation architecture
- **API** (Access verified, tenant membership enforced before dispatch): `GET /api/enterprise/book6/catalog`, `GET/POST /api/enterprise/book6/workpapers`, `GET/PATCH /api/enterprise/book6/workpapers/{id}`, `GET /api/enterprise/book6/workpapers/{id}/export`.
- **Code**: `src/enterprise/book6.js` catalog, schema, validation, preview; `src/enterprise/book6-api.js` role/tenant bounded D1 API. Browser `assets/enterprise-book6.js`; menu `Buku 6 · Kertas Kerja` in `enterprise.html`. No storage in browser.
- **D1**: `migrations/enterprise/0008_book6_workpapers.sql`. Separate bank `ENTERPRISE_DB` only; immutable audit/version rows; zero seeded production data. Public `DB` never used. Enforce optimistic concurrency and prevent deletion. Requires secure provisioning & migration before flag enabled.
- **Config**: `GC_ENTERPRISE_BOOK6_ENABLED` is off by default and additionally depends on `GC_ENTERPRISE_ENABLED=true`, separate D1 and Access. Setting a flag does **not** approve a model or a bank release.
- **Evidence**: every reported numerical datum requires source reference and a syntactically valid SHA-256 claim. Those are **declared**, NOT independently verified against signed source bytes. Export JSON is explicitly labeled internal-only with its own snapshot SHA-256.
- **Compatibility**: existing calculations, Book 7, public GreenCal and auth paths remain untouched. No AI-generated figures. Every missing value stays missing; explicit zero is preserved.

### Important source-control and methodological boundaries
1. The PDF's instruction (p. 6) says only blue cells may be entered; formula and total cells, sheet order, row/column counts and formatting must not be modified, except additional rows allowed on H. The candidate source .xlsx has since been received, but its structure is **not yet inspected or approved**. Do not invent cell addresses or ship a self-designed workbook as official.
2. The schema's 81 qualitative questions use brief **topic prompts**, not verbatim OJK questions; for legally significant replies consult the PDF and exact future workbook. There are 14 general, 30 A.1, 14 A.2 and 23 A.3 questions. Each response permits references, but links need independent evidence inspection.
3. B is Bank RBB-based actual t + baseline t+1..t+3 before climate stress (p.24); C–E are **different scenario** projections. Do not confuse the baseline RBB with `Current Policies`.
4. PD/LGD are outstanding-weighted sector rates, CKPN is computed debtor-level and aggregated sector-level, LGD captures physical + transition effects, and the largest-10 counterparty requirement applies to **each of six non-retail sectors**. Reference engine outputs must be consistent with these exact dimensions.
5. F has particular components `climate adjusted` versus `out of scope` (pp.50–52); do **not** shock out-of-scope items without Bank/OJK approved methodology. G physical operational loss in Current Policies must share scenario vintage with E (p.46).
6. Only authorized bank portfolio and source identifiers may be used; avoid raw names/IDs of customers in draft dimensions.
7. For BUS/UUS, finance/Islamic banking parameterization and LCR or financing-to-deposit distinction must be reviewed by bank and regulator. This implementation retains source nomenclature "Loan to Deposit" and does not silently relabel a regulatory formula.

### Release gates still required
- Decrypt/open and SHA-256 verify the provided candidate **Buku 6 2026 OJK Excel workbook**, and confirm provenance against OJK. Map blue inputs, locked/formula cells, valid ranges, H variable rows and sheet order; test pixel/roundtrip and formula values in Excel.
- Complete each table/metric and conditional sub-grid: stage/collectibility, weighted PD/LGD, top 10 by each NR sector, district and property category coverage, total market ATMR, security change and capital bridge, detailed LCR HQLA/outflow/inflow/LTD. This release is an **input/draft foundation**, not full automatic population.
- Ingest actual portfolio/GL/CKPN/securities and official NGFS + geospatial datasets with approved data license, effective date, source digest, control totals and two-line reconciliation.
- Independent validation of Books 2, 4, 5, and 7 quantitative engines, including result parity against approved OJK examples and bank challenger controls. Complete stress transmission to stage/CKPN, cash flow, market/capital and operational losses.
- Sign-off by Risk, Finance, Compliance, IT and independent model validator; Access institution enrollment, independent enterprise D1, test migration, backup/restore, full bank UAT, and deployment approval.
- No official filing or OJK submission API. **Regulatory production readiness remains BLOCKED**, even if GitHub CI passes and code reaches the Worker with flags disabled.


## Candidate official workbook intake — 31 October 2026

- User has supplied an Excel candidate file (236,032 bytes) and an unlock password. Treat both as sensitive; the password **must not** appear in Git history, CI logs, issues, or database fields. The attachment and password are **not** copied into this repository, and file contents remain unverified.
- Added `scripts/book6/inspect_official_workbook.py` as a **read-only offline inspector**: it supports standard ZIP XLSX and encrypted Office XLSX, using a password from the environment variable named `BOOK6_XLSX_PASSWORD` only when Office encryption is detected. Sheet protection is inspected, not removed or bypassed.
- The inspector outputs a JSON metadata report with source SHA-256, sheet order, dimensions, formula counts/fingerprints, protected/locked cells, style and color signatures, available input addresses, and merged/data-validation ranges. It intentionally **never emits actual cell values, formula strings, or passwords**. The source workbook is not modified.
- It intentionally does **not** decide which cells are official editable blue fields. Excel theme/conditional colors and sheet design require source-level visual and banking reviewer confirmation. An optional approved mapping is rejected if it targets a locked/formula cell, changes a style ID, duplicates a key/cell, or lacks explicit blue-cell confirmation.
- Synthetic fixture tests exercise workbook fingerprinting, locked/formula rejection, map hash binding, secrecy of cell values, and immutability. These tests **do not** prove parity with the received workbook.

### Secure local intake (bank-controlled environment)

```bash
python -m pip install -r scripts/book6/requirements.txt
# Set BOOK6_XLSX_PASSWORD securely from a password manager or interactive prompt;
# do not put its literal value in shell history, source files, issue text, or CI variables.
python scripts/book6/inspect_official_workbook.py \\
  --workbook /secure/input/OJK_Kertas_Kerja_Buku6_2026.xlsx \\
  --output /secure/review/book6-inspection.json
```

Next steps: independent reviewers verify file origin/hash and blue cells; perform exact field/formula/denominator mapping for General/A–I, execute zero-change Excel roundtrip tests with independent Excel calculation, then build a protected offline export/import service that uses only approved cells. No production flag is changed by this inspection tooling.
