# As-is audit and reuse decision

Audit baseline: main `0f36e70`, retrieved 27 October 2026. Initial workspace had no project checkout or additional AGENTS.md. Node 24.22.1. Build then 67 baseline node tests PASS. Tests are regression evidence, not official source verification.

## Existing architecture

Public `index.html` (about 766 KB), 119 KB+ embedded factors and calculation/state/UI code in one document; `auth-client.js` overrides original storage to an IP-HMAC-scoped localStorage copy. Worker `src/worker.js` dispatches narrow public AI/scope routes and legacy Access-plus-password APIs. `src/ai-worker.js` holds provider integration; `src/public-ai.js` provides quota controls; KV `AI_CONFIG` stores provider configuration, Worker secrets contain keys. `DB` binds `greencal-db`. `Kalkulator Emisi CRMS.html` is a separate older standalone snapshot, not the deploy entry.

## Feature inventory / reuse matrix

Classification: W = Existing — Tested & Working (specified local regression only); I = Existing — Needs Improvement; P = Existing — Partially Functional; N = Existing — Not Integrated; M = Missing — Must Develop; D = Deprecated — Safe to Replace after migration validation.

| Capability | Class | Code / API / table evidence | Tests and remaining gap | Reuse decision |
|---|---|---|---|---|
| Public dashboard and SVG charts | W/I | index.html `summary`, `renderDash`, `renderDonutChart`, `renderUnitBars` | p0-assets, p0 browser; no enterprise source or approved dashboard snapshot | Keep public, migrate aggregations after reconciliation |
| Scope 1 / fuel / refrigerant | W/I | `runCalc`, `gcValidateActivityInputs`, `calcWarm`, embedded factors | p2/p3 input regression; factors not independently primary-source verified | Preserve valid formulas; server adapters next |
| Scope 2 / electricity | W/I | `renderWzListrik`, `R`, `conv`, `rowsFor` | p3 missing/zero tests; grid/year factors need reconciliation | Preserve catalogue as unverified candidate |
| Scope 3 / waste / procurement | I | `runCalc`, `freightCat`, `leasedCat`, `calcWarm` | Not every category has independent numeric reference vectors | Add materiality scoping and vectors |
| Travel / flights / rail / bus / taxi / sea / hotel | W/I | `renderWzDinas`, category definitions, factor tables | business-travel.test.mjs; domestic/international supported, sea approximations have limitations | Keep UI and unit logic, verify source factors |
| Financed emissions / asset classes / PCAF | W/I | `expCalc`, `renderWzDebitur`, `saveFin` | p2-calculations; invalid denominators/attribution; no bank approval or official run | Server adapter after methodology sign-off |
| Securities / sovereign / sukuk | W/I | `GC_SECURITY_TYPES`, `gcSecExpCalc`, `renderWzSecurities` | pcaf-securities.test.mjs; EVIC versus PPP denominator distinguished; unsupported classes blocked | Keep instrument logic; verify asset-method applicability |
| Transition risk / NGFS inputs | P | `transScenario`, `transRiskResult`, `transSaveAssessment`, `transExportCsv` | Primarily client assumptions/scoring; no approved macro series or validated full financial model | Reuse forms only after methodological review |
| Physical / geospatial risk | M | No enterprise hazard/exposure/vulnerability data model/engine | No hazard-to-financial-loss reference tests | Develop from verified Book 5 data |
| Stress testing / PD-LGD-EAD / CKPN / capital / liquidity | M/P | Public transition approximations do not constitute full CRST | No validated enterprise scenario runs or bank balance sheet transmission | Develop versioned engines |
| Buku 7 standardized approach | M | No independently mapped methodology module or official test vectors | NOT TESTED, source ingestion needed | Do not relabel existing Book 2 approximations |
| AI provider gateway / local recommendations | W/I | ai-worker.js; `/api/ai/status`, `/api/ai/analyze`, `/api/ai/settings`; public-ai.js quota | p1-api tests use provider/config fixtures, no live external paid request | Public aggregate-only preserved; enterprise AI denied by omission |
| Narrative WYSIWYG | W/N | index.html narrative editor and draft functions | ai-editor-panel.test.mjs; editable browser draft, no enterprise approval/versioning | Reuse editor after secure narrative record model |
| Local persistence / reset / JSON backup | W/I | auth-client.js; `/api/client-scope`; `backupJson`, `restoreJson`, `resetCurrentScope` | p1 scope tests; shared-IP and cross-device limitations; not enterprise storage | Retain only public, no automatic migration |
| D1 shared state | N/D for enterprise | `/api/state`; gc_state singleton | Legacy two roles cannot isolate institutions | Preserve legacy pending retention; never reuse as tenant store |
| Legacy users / sessions / roles | N/I | gc_users, gc_sessions; roles.js; verifyAccessIdentity | rbac tests cover policy, not real bank SSO | Keep public behavior; separate enterprise membership |
| CSV exports and printable summary | W/N | `exportSummary`, `exportAct`, `exportFin`, `toCsv` | Format existence/regressions, not official Book 6 field reconciliation | Preserve public; official exports separate |
| Mobile and sidebar | W/I | `initDesktopSidebar`, bottom navigation, assets | existing browser scripts; new 360/390/414 enterprise checks | Keep visual identity; separate enterprise responsive shell |
| User manual / learning center | W/I | `renderGuide`, assets/guide-learning.js | responsive learning tests | Preserve public; foundation in-app guide added |
| Admin parameter management | N/I | `renderParams`, `pTables`, `pClasses`; hidden in public | local settings are not enterprise authorized masters | Versioned enterprise factor register added |
| Backup/restore disaster recovery | P/M | Public JSON backup only; no enterprise restore rehearsal | Cloudflare recovery configuration not tested | Separate operational runbook and staging rehearsal |
| Institution, hierarchy, risk governance workflow | M at baseline | No tenant tables | Foundation adds tenancy + risk register; full hierarchy/policy/RAS/KRI later | Incremental strangler pattern |
| Regulatory requirements and official reporting | M | Existing docs contain unverified broad seven-book claims | No complete page/requirement/formula/test matrix | New source register, explicit unvalidated status |

## Database gap assessment

Production schema inspection was read-only: tables `users`, `sessions`, `ai_settings`, `gc_users`, `gc_sessions`, `gc_login_limits`, `gc_state`, `gc_events`, `gc_public_ai_quota`. There were no institution/tenant/master portfolio/scenario/report snapshot tables. No account values, customer rows, state payloads, provider key values, or secret contents were read. Production schema has accumulated two generations of IAM tables: record technical debt, do not drop them.

`migrations/0003` is absent on main even though an older PR describes public server state. Main currently uses browser storage. Do not merge draft PR #31 wholesale: it branches from a different storage/security design. Main plus explicit enterprise isolation is the chosen baseline.

## Security findings

| ID | Priority | Confirmed gap | Treatment |
|---|---|---|---|
| SEC01 | P0 | IP/browser identity cannot authenticate enterprise bank users | Separate Access JWT + subject/email-bound membership; no public fallback |
| SEC02 | P0 | Legacy gc_state singleton has no tenant boundary | Dedicated ENTERPRISE_DB, mandatory tenant predicate, composite keys |
| SEC03 | P0 | Public results are browser calculated and editable | Exact-decimal server calculation increment; migrate other calculators after reconciliation |
| SEC04 | P0 | Existing audit not immutable/atomic with legacy state update | Enterprise DB triggers atomically version/log all supported register writes |
| SEC05 | P0 | No enterprise maker/checker/approver and approved freeze | Three actors, server state machine, optimistic revisions, frozen approved records |
| SEC06 | P0 | No bank approval of hosting location/processor/SSO/retention | BLOCKED bank operational gate; no bank production data introduced |
| SEC07 | P1 | No enterprise upload validation, malware scan, document vault | Metadata references only; uploads intentionally not exposed |
| SEC08 | P1 | No enterprise SSO handoff/revocation/MFA/WAF/live pentest evidence | Automated identity tests plus bank SSO UAT still NOT TESTED |
| SEC09 | P1 | DB admin can bypass application controls | SQL triggers protect application writes only; least privilege operators, monitoring and external immutable archive required |

## PR / deployment audit

Open PRs at audit time: #38 numeric quality, #31 integration draft, #12 earlier RBAC, #3 earlier Admin/User. Reused the zero-outstanding and malformed-number safeguards from #38 via three-way patch. Removed its proposed negative-profit rejection: debtor losses can be valid and require explicit modelling treatment. No other pending PR was merged automatically.

Cloudflare read-only result: Worker version `64fa72a7-3aba-428b-8959-40071b853a35` at 100%, deployment `2470e276-04a5-4030-90c6-86bda9c0b3b6`, timestamp 2026-10-19T22:55:26Z (20 October 05:55 WIB). Build trigger list is empty. A public HTTP HEAD returned 200; it is not an enterprise UAT or deployment-code hash comparison.

## Technical debt register

- TD01: monolithic HTML and older standalone drift — extract pure calculators incrementally with regression vectors.
- TD02: duplicate IAM tables — map retained data/ownership and migration plan before decommission.
- TD03: legacy source claims (including docs/implementation_plan.md) overstate seven-book completeness — superseded by evidence-based enterprise baseline.
- TD04: formula/factor labels and unit precision require primary-source verification; prior test names calling factors “validated OJK” are not SME evidence.
- TD05: no package manifest/dependency lock — new CI pins browser package; runtime baseline Node 24. Dependency governance backlog.
- TD06: actual D1/Access staging and operational recovery evidence absent — release gate remains blocked.
