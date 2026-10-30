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
