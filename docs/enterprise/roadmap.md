# Six-month implementation roadmap and prioritized backlog

Planning baseline: 27 October 2026. Proposed delivery window 27 October 2026–26 April 2027. Dates are a planning assumption, not a signed contract baseline. Effort below is estimated person-days; teams, bank availability, data readiness, SME/model validation, licensing and additional infrastructure may change the critical path. Parallel specialist work is needed for the full six-month core scope; it cannot be promised as one developer's six-month effort. The previously discussed consulting fee does not establish a software licence price or authorize a new charge.

## Monthly scope and exit criteria

| Month | Planned dates | Committed planning focus | Evidence required to exit |
|---|---|---|---|
| 1 | 27 Oct–26 Nov 2026 | audit/reuse, full seven-book ingestion, requirement catalogue, threat model, target architecture, data ownership, bank scope approval | reviewed source hashes/pages; each requirement traceable; approved bank architecture/backlog |
| 2 | 27 Nov–26 Dec 2026 | bank SSO/tenant isolation, institutional/org/unit/branch admin, user assignments, master approvals, governance/policy/RAS/KRI foundations | real staging D1 and bank SSO UAT; cross-tenant/privilege tests; recovery rehearsal |
| 3 | 27 Dec–26 Jan 2027 | reconciled server carbon/PCAF adapters; portfolio import; factor QA; physical and transition data readiness | official/SME vectors per supported class; import reconciliation; approved factor/reference dataset versions |
| 4 | 27 Jan–26 Feb 2027 | scenario and macro series; material hazard/exposure engine; transition and financial impact; versioned model runs | verified scenario vintages; model assumptions and limits; independent model validation; benchmark reconciliation |
| 5 | 27 Feb–26 Mar 2027 | Buku 7 modules; exact Book 6 mappings/workpapers; reporting review/freeze; dashboard; controlled AI narrative where approved | standardized official test vectors; official-template reconciliation; frozen reproducible report pack; privacy approval |
| 6 | 27 Mar–26 Apr 2027 | end-to-end UAT, security/performance, operational DR, actual manuals/training, controlled rollout | all applicable release gates PASS, signed business/model/security acceptance, production smoke and handover |

Scope is accepted only per module/method/asset class. Missing SME validation, source data or bank sign-off leaves that feature unavailable/planned; visible menus are not delivery acceptance.

## Work items

Owner labels are proposed accountable functions, not named/assigned people. PD includes development/test/documentation estimates and excludes bank waiting time. Status at this increment distinguishes implemented local evidence from accepted production capability.

| ID | Pri | User story / deliverable | Depends on | PD estimate | Proposed owner | Acceptance criteria / tests | Target / current status |
|---|---|---|---|---:|---|---|---|
| F01 | P0 | preserve existing GreenCal and audit code/data/deploy | repository read | 3–5 | Engineering lead | inventory with paths, baseline tests and deployment metadata | M1 / completed audit; local regressions PASS |
| F02 | P0 | ingest all 7 official books and datasets | original PDFs | 8–15 | Regulatory SME + Data | full-file hash, every-page ingestion, visual formula/table QA, versioned requirement matrix | M1 / partial source retrieval, not fully assessed |
| F03 | P0 | approve hosting/security/data governance | bank security/privacy/procurement | 5–10 | Bank CISO + Data owner | architecture, residency/processor, retention, AI and access policy sign-off | M1 / BLOCKED acceptance |
| F04 | P0 | enterprise JWT/RBAC/membership/tenant store | F03, staging database | 8–15 | Security + Platform | real IdP session, revoked/forged/cross-tenant/SoD tests, separate binding | M2 / code + local tests, real SSO NOT TESTED |
| F05 | P0 | immutable auditable registers and approval | F04 | 6–10 | Backend + Risk | transactional audit, no self approval, rejection/revision/freeze/export | M2 / foundation code + local tests |
| F06 | P0 | enterprise backup/restore/migration rollout | F03/F04 | 5–8 | Operations | backup hash, restore isolated copy, reconciled counts, recovery timing, rollback rehearsal | M2 / cloud rehearsal BLOCKED |
| F07 | P0 | regulatory document/mapping register | F02/F05 | 4–6 | Compliance | document/page/hash/requirement/rule/test/evidence traceability; no automatic PASS | M2 / metadata and mapping foundation implemented |
| G01 | P1 | onboarding/organization/units/branches/assignments | F04/F05 | 10–15 | Bank admin + Backend | hierarchy/FK/import/role limits, join/leave/delegation audit; no bank hardcoding | M2 / reviewed provisioning utility; full UI planned |
| G02 | P1 | governance policies, strategy, committee, maturity | F02/F05 | 8–12 | Risk governance | evidence-backed reviews, versioned governance and strategy approvals | M2–3 / risk register only implemented |
| G03 | P1 | RAS, KRI thresholds, limits, escalation/action plans | G02 | 8–12 | Risk management | evidence-backed threshold configuration, breach notifications, owner/due date monitoring | M3 / planned |
| C01 | P0 | trusted deterministic calculation foundation | F04/F05 | 5–8 | Quant + Backend | exact unit/precision tests, approved factors, snapshots, tamper tests | M2–3 / simple activity-factor adapter implemented, not OJK validated |
| C02 | P1 | migrate all material Scope 1/2/3 categories | F02/C01 | 15–25 | Carbon SME + Engineering | primary factor reconciliation; travel/hotel/fuel/electricity/waste vectors; historical parity | M3 / public calculators retained; adapters planned |
| C03 | P1 | financed emissions by relevant asset class | F02/C01, portfolio data | 12–20 | PCAF SME + Sharia reviewer | denominator/boundary/currency/data quality tests per class, supported/unsupported disclosures | M3 / public PCAF reused candidate, enterprise adapter planned |
| D01 | P1 | normalize debtor/facility/contract/security/collateral/location | G01 | 12–20 | Data architect + Bank data | tenant composite FKs, validated imports, no duplicate master input, null/zero/N/A semantics | M3 / planned |
| D02 | P1 | imports, reconciliation, data quality and baseline lock | D01/F05 | 12–18 | Data engineering | CSV/XLSX schema/unit/year/duplicate/range/source checks; row errors, reconciled totals | M3 / planned |
| M01 | P1 | versioned official/NGFS scenarios + macro data | F02/D02 | 10–15 | Economist + Quant | vintage, scenario/reference distinction, periods/units/basis/currency exact; interpolation reviewed | M4 / planned |
| M02 | P1 | physical hazard/exposure/vulnerability | F02/D01 | 15–25 | GIS + Risk SME | quality coordinates, approved hazards/weights, scenario/horizon/version, concentration and finance channel | M4 / planned |
| M03 | P1 | transition PD/LGD/EAD/market/CKPN/capital/liquidity | F02/M01/D01 | 20–35 | Quant + Finance + Validation | material transmission approved by bank, reference benchmark, no fabricated scenario results | M4 / planned |
| M04 | P1 | model register, run jobs, validation and sensitivity | M01/M02/M03 | 12–20 | Model owner + Independent validator | versioned inputs/assumptions, reproducible runs, async retry/progress, limitations and sign-off | M4–5 / planned |
| S01 | P1 | exact Buku 7 applicability and modular calculators | F02/D02 | 15–25 | Quant + Regulatory SME | separate methodology; original official examples/SME vectors; accepted tolerances | M5 / BLOCKED complete source/method review |
| S02 | P1 | Sharia contracts/sukuk/NPF/returns/liquidity adaptation | D01/M03/S01 | 10–18 | Sharia risk + DPS reviewer | contract-specific underlying/cashflow/transmission; model adaptation approval | M3–5 / institution BUS/UUS type only, methodology planned |
| R01 | P1 | official Book 6 fields/templates/20-step workflow | F02/M04/S01/F05 | 15–25 | Reporting + Compliance | every official field reconciled; checker/compliance/approver; snapshots/export archive/corrections | M5 / internal evidence export only |
| R02 | P1 | management dashboards / disclosure | C02/C03/M04/R01 | 8–12 | Risk/Finance + UX | real approved inputs; no simulated actuals; KPI definitions and drilldown | M5 / record counts only |
| A01 | P2 | controlled tenant AI + reviewed rich narrative | R01/F03 | 10–18 | AI engineer + Data owner | approved provider/consent/DLP; citations/run binding; quota; editable drafts; AI cannot approve or alter metrics | M5–6 / public aggregate gateway retained; enterprise planned |
| Q01 | P0 | bank SSO/D1 and functional security UAT | F04–F06 | 6–10 | Bank IAM + QA | real accounts/devices, expired/revoked sessions, cross-tenant security and recovery evidence | M2–6 / NOT TESTED |
| Q02 | P1 | complete CRMS cycle UAT and model/security review | all core | 15–25 | Bank business owners + QA | 15 supplied UAT scenarios expected/actual/evidence/sign-off; no severity critical blockers | M6 / NOT TESTED |
| Q03 | P1 | load, monitoring, incident/DR and rollout | Q01/Q02/F06 | 10–15 | SRE + Security | measured latency/import/model/run/concurrency/RTO/RPO and agreed thresholds; smoke + rollback | M6 / NOT TESTED |
| DOC1 | P1 | BRD/SRS/FDS/API/ERD/model/admin/user/ops/training | respective modules | 10–15 | Documentation + Owners | actual UI screenshots, role workflows, errors, reproducible examples, accepted handover | M1–6 / foundation documentation only |
| LIC1 | P1 | configurable subscription/renewal/entitlements | procurement decision/F04 | 4–8 | Product + Finance | annual pricing/minimum 3-year term agreed separately, expiry workflow, no hidden charge | M2–6 / planned, pricing not set |
| ADV1 | P2 | expanded GIS, portfolio optimization, advanced financial model | core accepted/data licences | 20–40+ | Quant/GIS | additional dataset licences, validated value/risk/recovery/performance benchmarks | later / additional scope/budget |
| OPT1 | P3 | predictive analytics, broad integrations, regulatory change automation | operational baseline | TBD | Product/Architecture | separate requirements/value case/security/validation | beyond 6 months / optional |

## Dependencies / scope controls

The main critical path is official source ingestion → bank methodology/data scope → verified datasets → model validation → official reporting → signed UAT → controlled rollout. Foundation coding can run before every source is read, but formulas cannot be designated “OJK 2026 validated” before page-level mapping and validation. The initial bank use case is PT Bank Jabar Banten Syariah; no real tenant or data has been seeded without its approved onboarding data and hosting decision.

Possible additional time/cost: proprietary climate datasets, bulk high-resolution GIS, core-banking integration, numerical model calibration, independent validation/pentest, bank SSO/MFA integration, bank-approved hosting, large-model job infrastructure and external audit archive. Separate these from the six-month core acceptance scope.
