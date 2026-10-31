# GreenCal CRMS Enterprise — Discovery Readiness (31 October 2026)

## Scope and input provenance
Designed from \`CRST_Client_Discovery_Readiness_Assessment_Enhanced.xlsx\` provided by the project owner, NOT from an OJK-certified maturity scale. The workbook may be revised by bank stakeholders. The module is an evidence-based internal assessment and produces no OJK compliance, model validation, production activation, or regulatory submission guarantee.

Navigation: \`/enterprise/\` → **Discovery Readiness**, an institution-specific authenticated page. The existing public calculator remains unchanged.

### Implemented catalogue
- Full client questionnaire: **111 questions**, grouped A–H and C1–C5.
- Master data inventory: **35 data domains/items**, recording status, source, evidence, coverage and blocker.
- Six scored dimensions, weights **15/20/15/20/15/15** (total 100).
- Twelve topic scores, weights **8/7/12/10/10/10/10/10/10/6/4/3** (total 100).
- Data Quality & Feasibility: **20 test criteria** (Q01–Q20).
- Gap / critical dependency indicators and mapped solution options S1–S10.
- Full questionnaire states, notes, references, and follow-ups.
- Draft → Submitted → Checked → Approved with independent actors and versioned bank-specific audit.
- JSON evidence snapshot with hash only after approval; no official reporting export.
- Responsive interface; data saved through authenticated D1 APIs only, never browser storage or public AI.

### Scoring and stage guardrails
\`weighted_score = SUM(weight * score for assessed dimensions) / SUM(weight of assessed dimensions)\`. Coverage is sum of scored weights (0–100%). Scores **1 Initial, 2 Developing, 3 Established, 4 Advanced**; weighted thresholds:
- below 1.75: Initial
- 1.75 to below 2.50: Developing
- 2.50 to below 3.50: Established
- 3.50 and above: Advanced

The same weighted method applies separately to 12 scored topics. The client UI displays a server-calculated score and coverage; clients cannot supply a final grade.

A preliminary result with only some dimensions scored is clearly labelled with its coverage, not treated as a complete readiness decision. Indication *eligible for controlled bank review* requires **all six scored dimensions and all twelve topics covered, both weighted scores ≥3, all 111 questionnaire items, 35 inventory items and 20 quality checks addressed with evidence for positive/partial findings, and zero blockers**. Any explicitly marked blocker, or a failed high-criticality quality test, overrides high scores. This is still not bank approval, official model validation or authorization to go live.

Scored dimensions/topics of 3 or 4 require a documentary evidence reference. For other questions, evidence and proxy limitations remain visible for reviewer judgment. No sample/demo bank scores or entities are generated or seeded.

### API (protected \`/api/enterprise/discovery/*\`)
All routes use the same independently verified Access JWT and D1 tenant membership gate as other enterprise endpoints.

| Method | Path | Use |
|---|---|---|
| GET | \`/catalog\` | Versioned methodology and catalogue |
| GET | \`/assessments?page=1\` | Tenant-scoped list of 20, with status and computed score |
| POST | \`/assessments\` | Create a new draft by authorized writer |
| GET | \`/assessments/:id\` | View tenant assessment |
| PATCH | \`/assessments/:id\` | Maker-only draft edit, expected revision CAS |
| POST | \`/assessments/:id/workflow\` | Submit/check/approve/reject with SoD |
| GET | \`/assessments/:id/history\` | Immutable revision metadata |
| GET | \`/assessments/:id/export\` | Approved internal snapshot + SHA-256 |

Writers: institution administrator, CRMS project administrator, risk analyst, climate model analyst, data maker, compliance reviewer. Checker: checker, compliance reviewer, sharia governance reviewer. Approver: approver or risk management head. A creator cannot check or approve their own assessment; a checker cannot be the approver. Executive and external-auditor roles read **approved** assessments only.

### Prerequisites and deployment
Requires \`GC_ENTERPRISE_ENABLED=true\`, valid bank-approved Cloudflare Access identity, a dedicated \`ENTERPRISE_DB\`, existing enterprise schema and the **new migration \`migrations/enterprise/0100_discovery_readiness.sql\`** on the dedicated database. Apply it AFTER all prior enterprise foundation/domain/analytics/book6/release migrations. It must **never** be run against the public \`DB\`.

1. Back up approved enterprise staging D1, record SHA-256, verify restoration and rollback.
2. Apply \`0100_discovery_readiness.sql\` in a staging enterprise D1 after schema review; there is no data seed.
3. Run \`node --test tests/discovery-readiness.test.mjs\`, \`node --test tests/*.test.mjs\`, \`node --check assets/enterprise-discovery.js\`, \`node --check src/enterprise/discovery-api.js\`, \`node scripts/build-dist.mjs\`.
4. Execute actual multi-tenant, multi-role and race-condition negative tests; verify source-to-question reconciliation and UI on Android/desktop.
5. Obtain Risk, Compliance, Technology, Security and bank owner acceptance before production enablement. When the enterprise feature flag remains off, menu is not accessible because the entire institutional workspace is unavailable.

### Out of scope / pending
The spreadsheet's Detailed Data Requirements (40 fields), Calculation Traceability (12 pathways), document checklist, meeting guide and commercial solution mapping are useful references but **do not yet have separately editable workflows**; S1–S10 appear as recommended workstreams on the dashboard. Upload, hash and retention of physical documentary evidence also require a bank-approved vault; current evidence is only a **reference string**. No automatic ingestion of CBS/GL/CKPN or geospatial/NGFS sources is implied. There is no validated OJK prescribed readiness threshold or official 7-book readiness certification.
