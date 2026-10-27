# Release evidence — Enterprise P0 foundation

Date: 27 October 2026 (WIB). Scope: initial enterprise foundation only. Bank production readiness: BLOCKED.

## Implementation evidence

| Item | Files / evidence | Status / limitation |
|---|---|---|
| Separate enterprise UI and assets | enterprise.html; assets/enterprise.js; assets/enterprise.css; scripts/build-dist.mjs | Implemented, browser tested; not deployed |
| Access identity and tenant authorization | src/enterprise/identity.js, policy.js, api.js; src/worker.js allowlisted dispatch | Signed synthetic JWT/negative tests PASS; bank SSO NOT TESTED |
| Dedicated persistence and immutable audit | migrations/enterprise/0001_foundation.sql | Real SQLite migration/constraints/triggers tested; cloud D1 rehearsal BLOCKED |
| Risk, factor, emission, source and requirement registers | validation.js + API and typed forms | Create/read/edit/review/reject/approve/history/export implemented for foundation scope |
| Exact-decimal server emissions | validation.js calculateEmission | Synthetic test vector 1000 kWh × 0.85 kgCO2e/kWh /1000 = 0.85 tCO2e; not an OJK source factor |
| Master factor snapshot / approved freeze | record payload calculation and DB triggers | Generic formula reproducible; official factor/model acceptance pending |
| Public numeric input guards reused | index.html and p2-calculations.test.mjs | Reused #38 zero-outstanding/malformed numbers; preserved negative-profit input |
| Regulatory ingestion utility | scripts/ingest-ojk-crms.py | Rejects HTML, incomplete EOF and repaired/encrypted originals; no automatic compliance acceptance |
| Reviewed institution bootstrap utility | scripts/enterprise-provision.mjs | Generates reviewed SQL only; no accounts/data seeded in cloud |
| Audit / architecture / backlog / runbooks | docs/enterprise/* | Foundation design documented; bank review/acceptance pending |
| CI | .github/workflows/enterprise-foundation.yml | Runs all regressions, SQLite integration and signed-identity Chromium flow; remote result recorded on PR |

## Local validation executed

- Baseline main build + 67 node tests: PASS.
- Foundation plus legacy build + 85 node tests: PASS (includes 17 enterprise API/real-SQLite tests and 1 additional public numeric regression).
- Enterprise browser integration: PASS on desktop 1366 and mobile widths 360, 390, 414. Factor draft → submit → independent checker → third-person approval → emission server calculation → reload persistence → independent review → approved internal evidence download → four-version history. No JavaScript page errors observed.
- Public p0-browser-smoke: PASS desktop/mobile (six wizard panels, emissions, local persistence, theme).
- Public p3-browser-activity: PASS desktop/mobile (missing activity value, factor lineage, text hotel names).
- Local SQLite backup/restore rehearsal: PASS; frozen factor, four versions, audit records and foreign keys remain intact. This does not replace a Cloudflare D1 restore rehearsal.
- Concurrent revision writes: one commit and one 409 rejection, PASS.
- SQL atomicity fault injection: forced audit insert error rolls back record and version insert; PASS.
- Source/headers/input syntax and git whitespace checks: PASS at checked working tree.

Browser screenshots inspected internally: desktop approved emissions register and 390px emission form; no document-wide horizontal overflow or form clipping found. These screenshots show only labelled synthetic UAT data. Virtual software keyboard on actual phones, accessibility audit and real bank devices still NOT TESTED.

## Cloud read-only checks / staging blocker

Existing public Worker is live at the supplied production URL. Verified deployment version `64fa72a7-3aba-428b-8959-40071b853a35`, 100% traffic; no Workers Builds triggers. Production D1 schema read confirmed legacy tables and no enterprise tables. No bank payload, account values or secret contents were retrieved.

Attempted creation of dedicated `greencal-enterprise-staging-20261027`: Cloudflare HTTP 403 code 7406, “System limit reached: databases per account (10)”. This is a platform quota error, not an automatic approval rejection. No existing databases were deleted/reused and no migration was applied to the public production DB. Need an additional approved database slot or separate approved account/environment, then rerun staging/recovery gates.

## Regulatory source checkpoint

Books 2 and 4 were downloaded as whole originals and extracted (91 and 81 pages); source hashes recorded. Initial matrix contains seven document gap rows, fifteen selected Book 2 and eleven selected Book 4 requirement rows. Source inconsistencies and raster numeric-table gaps are documented in source-review.md. No full seven-book validation or accepted formula/template implementation is claimed.

## Release gates

The status applies to enterprise production acceptance, not merely code completeness.

| Gate | Status | Evidence / remaining condition |
|---|---|---|
| 1 Requirements Approved | BLOCKED | Master scope received; foundation/backlog documented; bank regulatory/model/materiality acceptance not signed |
| 2 Architecture Approved | BLOCKED | Target architecture/threat model prepared; bank security/data residency/IAM review outstanding |
| 3 Development Completed | BLOCKED for full scope; foundation implemented | Source changes and functional foundation flow exist; seven-book models/reporting etc. remain backlog |
| 4 Automated Tests Passed | PASS locally | 85 node tests, public and enterprise browser regressions; remote CI separately on PR |
| 5 Security Validation Passed | BLOCKED | Negative security tests PASS locally; actual SSO/WAF/D1/pentest and bank policy acceptance pending |
| 6 Data & Calculation Reconciliation | BLOCKED | Exact-decimal generic vectors PASS; primary factors, full OJK formulas/templates/official vectors not reconciled |
| 7 UAT Accepted | NOT TESTED | Synthetic browser integration is not business-owner bank UAT or sign-off |
| 8 Deployment Ready | BLOCKED | D1 slot limit; bank-configured identity, backup/restore/migration rehearsal and monitoring not complete |
| 9 Production Verification | NOT TESTED for enterprise release | Existing public baseline HTTP/deployment checked; new enterprise version not deployed |
| 10 Operational Handover | NOT TESTED | Foundation runbooks exist; actual ownership, SLA, training/DR/support acceptance pending |

No production deployment was performed. No gate was changed to PASS solely because a menu or button exists. Official seven-book completeness, regulator-approved exports/submission and bank operational readiness are not claimed.

## Continuation checkpoint

Proceed with complete original-source ingestion and per-page SME rule mapping; obtain an approved staging database slot and bank IAM configuration; rehearse D1 migration/recovery; extend normalized organization/portfolio data and reconcile existing calculators into server adapters before activating scenario/physical/financial/Book 7 and official reporting engines. See roadmap for dependencies and acceptance criteria.

## Controlled code rollout scope — 27 October 2026

The user subsequently authorized merge and production deployment of the foundation code. This authorization permits publishing the current code package with enterprise processing disabled; it does not establish bank UAT acceptance or seven-book compliance. No enterprise migration, bank-data import, identity assignment or enabling flag is included. Existing public calculator/resources remain the operational service.

Pre-release Workers runtime validation identified a canonical redirect loop: rewriting `/enterprise/` to `/enterprise/index.html` causes the asset service to redirect back to `/enterprise/`. The Worker now preserves the original URL when fetching assets. `tests/runtime-assets-smoke.mjs` uses the real Workers asset service to check canonical URLs, exact content hashes, enterprise CSP/no-store, disabled enterprise and denied unauthorized state. This supplements the existing signed-identity browser tests, whose file-backed asset transport did not reproduce canonical redirects.

A full public D1 export was restored into an isolated local SQLite copy: quick_check=ok, foreign_key_check=0 violations. The pre-release checkpoint preserves the deployed Worker version/configuration by reference and the SQL backup; it excludes secret values. Production deploy/version and smoke evidence will be recorded in PR #40 after rollout. Full enterprise activation gates above remain outstanding.
