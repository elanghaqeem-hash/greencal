# GreenCal — OJK CRMS 2026 Seven-Book Conformance Gates (31 October 2026)

## Scope delivered

This increment adds a seven-book, 25-control methodology/source/evidence matrix, five institutional release controls, a public **read-only, no-bank-data** status endpoint `GET /api/ojk-readiness`, and an interactive diagnostic on `/enterprise/`. Buku 6 drafts now report unanswered questions, missing supporting evidence and sections with no quantitative values.

The engine explicitly distinguishes build/preview/CI from independently attested bank release. `evaluateOjk2026()` **defaults to rejecting even structurally complete evidence** unless a separately implemented server-side source/reviewer attestation verifier approves it. Even all seven books cannot return PASS unless a separate verified Bank release function approves. The public route supplies **no** approved attestations and cannot submit them through the browser. It cannot certify OJK compliance.

## Evidence controls

| Book | New control IDs | Remaining critical external evidence |
| --- | --- | --- |
| 1 | B1_REQUIREMENTS, B1_GOVERNANCE, B1_UAT | Full source crosswalk, Board approval, climate strategy, 3 Lines |
| 2 | B2_REQUIREMENTS, B2_TRANSMISSION, B2_SCENARIOS, B2_VALIDATION | Risk model calibration and independent quantitative validation |
| 3 | B3_FORMULAS, B3_FACTORS, B3_PCAF | 6,651 / 6,900 Annex C formulas not independently recalculated; emission factors require approval |
| 4 | B4_TABLES, B4_NGFS, B4_MODELS | Official macroeconomic data transcribed and bank model approved |
| 5 | B5_ANNEXES, B5_EXCEPTIONS, B5_GEO, B5_DATABASE | Two XLSX staging data sets, source anomalies and postcode mapping need sign-off; controlled bank import |
| 6 | B6_WORKBOOK, B6_COVERAGE, B6_PARITY, B6_RECON | Excel official blue cells, formulas and complete A–I reconciliation not verified |
| 7 | B7_PRECISION, B7_FORMULAS, B7_CALIBRATION, B7_VALIDATION | Full-precision Excel parameter workbooks absent and independent model sign-off pending |

The global release gate additionally requires institution SSO, authorized CBS/GL/CKPN data, real bank UAT and security assessment, backup/restore RTO/RPO, and independent Risk/Finance/Compliance/IT/model validation acceptance.

## Verification and activation

1. `node --test tests/ojk-readiness.test.mjs tests/book6-workpaper.test.mjs tests/vercel-runtime.test.mjs`
2. `node scripts/build-dist.mjs`; confirm `dist/assets/enterprise-ojk-readiness.js` exists and `dist/enterprise/index.html` references it.
3. Validate `GET /api/ojk-readiness` HTTP 200, `status=NOT_READY`, `books.length=7`, and no production secrets, bank records or personal data.
4. The release gate and bank SSO flags must **remain off** until bank-approved source and quantitative evidence is independently verified. **Never alter `/api/health` to report bankProductionReady=true based only on the OJK matrix.**

## Not completed by this increment

This is a **technical control enhancement, not a claim that all seven books pass**. It does not create missing official XLSX precision data, automatically recompute Annex C in Excel, populate the official Buku 6 workbook, resolve Buku 5 source anomalies, connect CBS/GL/CKPN, perform bank independent validation or change institution production flags. The seven-book controls are NOT_VERIFIED in the public release because real verified attestations are absent.

Source: OJK publication 6 October 2026, https://ojk.go.id/id/Publikasi/Roadmap-dan-Pedoman/Perbankan/Pages/Panduan-Climate-Risk-Management-and-Scenario-Analysis-Perbankan-CRMS-2026.aspx.
