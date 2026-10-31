# GreenCal CRMS Enterprise — institutional release simulation and sign-off register
Date: 2026-10-31 · Implemented in branch `feat/crms-release-validation-20261031`

## Observable deployment

- Public Cloudflare Worker `greencal` deployed from GitHub commit `0c54ee86a6436ffc0259299870922a2302d9c1ba`.
- Cloudflare build `b8b43dd2-13ab-405a-9ba9-17dbffac5f3f`: **SUCCESS**. Worker version `3cf5eb40-f52c-4fc6-9698-17ed1cab8cea`, 100% traffic; deployment `d0042432-3c11-447d-b115-c209055e542d`.
- Existing `DB`, `AI_CONFIG`, `ASSETS` and secret bindings preserved.
- Enterprise runtime is intentionally DISABLED until `ENTERPRISE_DB` is provisioned and bank onboarding is completed.
- Cloudflare Access application `c8c9dda0-e883-4ac8-ac3a-26d708b17861` created for `greencal.elang-haqeem.workers.dev/enterprise` and `/api/enterprise`, with **zero allow policies**. Access AUD is restricted to server provisioning; do not commit it as a secret.
- Access application does not establish bank affiliation, secure data-processing approval, real identity enrolment or business acceptance. Actual public HTTP smoke could not be completed from the current web browser service; Cloudflare confirms deployment.

## Simulated model-validation dossier

Tests in `tests/bank-release-uat.test.mjs` independently recompute and compare transparent vectors against engine outputs:
- PCAF attributable Scope 1 and Scope 2 emissions, with Scope 3 `null` preserved as missing.
- Physical asset damage from linear curve + vulnerability and adaptation factors; fail closed on non-calibrated extrapolation.
- Stage 1 discounted ECL reference algebra and required source approval.
- Capital/profit/ATMR/CAR bridge, with no accounting or regulatory capital posting.
- Independent CKPN/GL reconciliation in `scripts/ckpn-reconciliation.mjs`, matching every anonymized facility, stage, currency and as-of date, checking declared GL totals and bank-configured variance tolerances.

These are **independent synthetic golden-vector checks**, not a true independent validation of production models or historical out-of-sample testing. They cannot establish IFRS 9/PSAK 71 correctness on real bank portfolios without calibration, independent challenger models, backtesting and Finance acceptance.

## Backup and restore

Bank-release UAT uses Node 24 `node:sqlite` and the **actual migration SQL 0001–0006** in isolated memory, then:
1. Save a physical SQLite backup to a temporary local file using `backup(db, path)`.
2. Calculate backup SHA-256.
3. Restore/open backup independently and check `PRAGMA quick_check`, `PRAGMA foreign_key_check`, candidate IDs, review/audit counts and deletion protections.
4. Securely remove temporary isolated fixture files.

This is a **simulation only**, not a backup of the live D1 database and not proof of bank-approved RTO/RPO.

## New institutional release gate

Migration `0006_release_authorization.sql` introduces immutable candidates, bank-assigned function owners and independently signed Access identity-bound review records, across five functions:
- Risk Management → `risk_management_head`;
- Finance → `approver` role **plus bank appointment evidence**;
- Compliance → `compliance_reviewer`;
- IT & Security → `institution_administrator` (must differ from appointing administrator);
- Independent Model Validation → `internal_auditor` role **plus documented model-validator assignment**.

Assignments have `approved_appointment_reference`; five different human Access `subject` IDs are required. Reviewers cannot create their own release candidate, approve on behalf of another member, reuse reviewer subjects or mutate old review snapshots. Approvals require nonempty per-function evidence references and SHA-256, and the result remains `bankProductionReady:false` until external prerequisites are separately established. `GC_ENTERPRISE_RELEASE_ENABLED` is **OFF by default**. No real appointment, user membership or approval is seeded.

Endpoints: `POST/GET /api/enterprise/release/assignments`, `POST/GET /api/enterprise/release/candidates`, `POST /api/enterprise/release/candidates/{id}/reviews`, `GET /api/enterprise/release/candidates/{id}`.

The browser offers a protected review panel, but cannot grant roles or bypass backend institution membership.

## External integration responsibility and prerequisites

| Source | Available adapter | External live integration |
| --- | --- | --- |
| CBS financing book | Strict anonymous CSV with ledger/source checksum | **Not connected**; bank service account, secure network and authoritative schema required |
| General Ledger (GL) | Independent totals and full-source row controls | **Not connected**; bank-approved GL extracts/endpoints required |
| CKPN/PSAK 71 | Facility-level Stage 1/2 ECL-vs-booked reconciliation | **Not connected**; Finance approval and source files required |
| NGFS | Exact model/scenario/region/variable/unit IAMC CSV importer | Official dataset not supplied/licensed/validated for bank |
| Geospatial | WGS84 Polygon screening and calibrated hazard-damage curve | Official geodata and bank geocoding/asset inventory not connected |
| OJK Books 6/7 | Internal evidence and parameterised simulations | Verified page-level formula/specimen + approved regulatory workbook still absent |

## Unresolved production blockers and prohibited claims

- Cloudflare account at current audit has **10 / 10 D1 Free databases**, no dedicated `ENTERPRISE_DB`. Do not reuse or delete `greencal-db` or other projects. Obtain bank-approved separate Cloudflare account/paid D1 capacity **without initiating unapproved billing**.
- Bank Access IdP integration, correct team domain, verified AUD environment, policies for named bank members and provisioning are pending. The new Access app is **deny-by-default**.
- No direct CBS/GL/CKPN endpoint, bank data-processing agreement, TLS and credential configuration.
- OJK original **Buku 6 & Buku 7 2026** full-text/diagram page review and official methodology mapping have not passed.
- NGFS dataset registration and actual geospatial licensed inputs have not been independently verified. No permission to invent numeric climate drivers or scenarios.
- Any Risk, Finance, Compliance, IT or model validator review on test fixtures is **simulated**; no employee signed or approved a production release.
- Live D1 point-in-time backup/restore drill and RTO/RPO measurement requires bank environment; not performed.
- No regulatory file submission endpoint exists. All current outputs are internal.

**Bank production release status: BLOCKED.** Passing CI and deploying code with enterprise flags OFF are safe technical milestones, not evidence of accepted CRMS bank operations.
