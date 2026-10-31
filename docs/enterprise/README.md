# GreenCal CRMS Enterprise — implementation baseline, 27 October 2026

This is the first controlled increment of the six-month programme. It is not completion of seven-book CRMS, not a bank acceptance, and not an authorization to process confidential bank data in production.

- [Existing audit and reuse](audit.md)
- [Architecture, database, API and security model](architecture.md)
- [Six-month roadmap and backlog](roadmap.md)
- [Seven-book source and traceability status](regulatory-matrix.csv)
- [Source ingestion and unresolved methodology issues](source-review.md)
- [Release gate and validation evidence](release-evidence.md)
- [Deployment, provisioning, backup and rollback](operations.md)

Implemented increment: separate enterprise route, dedicated database binding, cryptographic Access identity verification, fourteen role names with concrete permissions, tenant membership checks, five working registers, exact-decimal server emission calculation using approved factors, maker/checker/approver, immutable versions and audit events, reviewed-record JSON evidence export, responsive enterprise forms and in-app foundation user guide.

Not released: bank SSO enrolment, institutional lifecycle UI, organization hierarchy, production enterprise storage, official seven-book models, full factor reconciliation, financed-emission server adapters, scenario/macroeconomic/geospatial engines, Buku 7 calculator, official Buku 6 exports, full reporting workflow, enterprise AI, operational backup restore, subscription enforcement, and bank UAT/sign-off.

The public GreenCal is preserved. Its client-side outputs and IP-scoped browser storage are not trusted enterprise inputs. There is no automatic import of old public or singleton state into bank data.

## Controlled implementation increment — 30 October 2026

[Six domain registers v2, governance, portfolio, scenarios, physical/transition screening and internal report-pack workflow](domain-registers-v2.md). This is source-controlled implementation, **not** complete CRMS modelling or permission to handle live bank data. All seven books, quantitative models, data imports, official reporting and acceptance gates remain subject to independent regulatory/model/bank review.

## Quantitative development increment — 31 October 2026

[PCAF financed emissions, portfolio ingestion, NGFS scenario interpolation, geospatial screening, PD/LGD/EAD sensitivity, Buku 7 draft mapping and reconciled OJK preview](quant-engine-v3.md). Quantitative operations remain disabled by default and do not constitute regulatory reporting or permission to process bank production data.

## Discovery Readiness increment — 31 October 2026

[Discovery Readiness workbook-derived questionnaire, scoring, data inventory, quality tests, evidence references, RBAC and migration gates](discovery-readiness.md). The module requires dedicated enterprise D1 migration, actual bank identity and access configuration; it is not a declaration that CRMS enterprise is bank-production-ready.

## OJK CRMS Buku 3 — 31 October 2026

[Methodology, exact-decimal financed emissions, Scope 3 separation, Tier 1–4, CRSA carbon cost, traceability and release gates](ojk-book3-20261031.md). Internal feature-gated implementation; official Annex C Excel calculator and independent bank UAT remain pending.

## Lampiran C Buku 3 — workbook Excel terenkripsi

[Hasil inventaris 35 sheet, faktor GWP AR5, adapter emisi per gas, pengujian dan isu atribusi Scope 3 Cat 15](ojk-book3-annex-c-audit.md). **Terbatas pada sandbox**; faktor/vintage dan seluruh formula workbook belum diotorisasi untuk pelaporan bank.

## Buku 3 Lampiran C — 35-sheet reconciliation (31 October 2026)

[Workbook-wide inventory, 6,900 formula-cell register, 2,087 reference numeric/formula cells and 10 unresolved control issues](book3-35-sheet-reconciliation-20261031.md). **Only 249 formulas were independently recomputed and matched; 6,651 remain unverified.** Do not enable Bank/official reporting or bulk import factors based on this audit alone.
