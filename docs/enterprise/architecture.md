# Target architecture, functional specification and security design

## Decision

Use incremental strangler refactoring. Keep `index.html`, the public calculator, existing embedded category functions, assets, and public AI unchanged except reviewed numeric input guards. Add `/enterprise/` and `/api/enterprise/*` on the existing Worker with modular server files. No framework migration or public-data import. No new external AI or bank-data processor is introduced by this increment.

Bank deployment is disabled unless `GC_ENTERPRISE_ENABLED=true`, a dedicated `ENTERPRISE_DB` binding, and independent `GC_ENTERPRISE_ACCESS_DOMAIN` + `GC_ENTERPRISE_ACCESS_AUD` are present. No fallback to legacy `DB`. Do not enable the flag or create actual bank accounts before bank-approved security/hosting review and staging acceptance.

## Ten architectural layers

| Layer | Foundation implementation | Remaining target |
|---|---|---|
| UX | enterprise.html, assets/enterprise.{js,css}; responsive grouped nav/search/forms/empty/errors | specialized portfolio, scenario, GIS, official reports |
| IAM | RS256 Access JWT signature/issuer/aud/exp/iat/nbf; subject AND email membership; 14 roles | real bank SSO/MFA/session/revocation UAT, assignments/delegations |
| Workflow | draft → submitted → checked → approved; rejection/revision, archive drafts, SoD | organization approval matrix, reporting/model-specific workflows |
| Rules | typed input allowlists; source/page/effective-date checks; explicit not_validated | seven-book verified rule catalogue and SME acceptance |
| Calculation | exact decimal activity-factor kg-to-tonne server engine | reconciled legacy adapters, asset-specific financed emissions and CRST/B7 |
| Analytics | real record counts by status, no fabricated performance metrics | approved-run financial/portfolio/KRI dashboard |
| Data | separate D1 institutions, memberships, records, versions, events | normalized portfolio/scenario/reporting domain tables |
| Integration | local original-PDF ingestion utility and reviewed provisioning SQL generator | CSV/XLSX imports, core banking interfaces, async validation jobs |
| Reporting | approved-record JSON evidence export, history, SHA-256 | verified official Book 6 workbook/PDF/Word and 20-step reporting flow |
| Operations | no-store, CSP, explicit errors, deny defaults, SQL immutable triggers | WAF/rate limit, backup/restore, immutable external archive, observability/SIEM |

## Implemented data model

Migration `migrations/enterprise/0001_foundation.sql` is deliberately outside legacy migration discovery. Apply only on a new staging enterprise database. It seeds nothing. FKs/composite keys include tenant IDs and all reads/mutations bind tenant from a verified membership.

- gcx_institutions: PK id; institution_type BUS/UUS/BUK/LJK; currency; active.
- gcx_memberships: PK (tenant_id,subject); FK institution; email bound to verified JWT; one role per membership. Each institution has its own membership assignment even for the same subject.
- gcx_records: PK (tenant_id,id); typed kind; JSON aggregate for five bounded foundation records; title/status/revision/creator/checker/approver/timestamps. Composite FKs for creator/updater memberships. List index (tenant_id,kind,status,updated_at).
- gcx_record_versions: PK (tenant_id,record_id,revision); complete title/payload/status/actor/review snapshot. Trigger-written, no app update/delete endpoint.
- gcx_events: tenant-indexed append-only mutation events. Trigger failure rolls back the record mutation and version write.

The five aggregate records are a controlled early foundation, not a claim to have implemented every entity in the master prompt. Do not store a whole bank portfolio in JSON. Add normalized debtors/facilities/contracts/collaterals, scenario series, parameter versions, model runs/results, reporting snapshots, evidence object references and jobs in later migrations. Approved corrections need a supersedes relationship and duplicate-report exclusion before official aggregation; currently operators create a new record and reference the old ID in evidence, without an official report aggregation.

## API contract

All routes below are under `/api/enterprise`. No CORS allow-origin header is emitted. GET never writes banking records. POST/PATCH require same origin, JSON content type, streamed 32 KiB maximum. Client role, tenant in payload, approval labels, scores/results are never trusted. Errors expose codes/messages without SQL or tokens.

| Method | Route | Authorization / behavior |
|---|---|---|
| GET | /session | verified identity; only that subject/email's active tenants |
| GET | /institution | active membership + X-GreenCal-Tenant; bank name/type/currency/role |
| GET | /summary | tenant counts only; regulatoryAcceptance always not_validated |
| GET | /records?kind=&page= | tenant-scoped, 50 rows + hasMore, validated kind/page |
| POST | /records | role-specific create, typed payload, server calculation, transactional audit |
| GET | /records/:id | tenant lookup; external auditor sees approved only |
| PATCH | /records/:id | owner, draft/rejected only, expected revision, server recalculation |
| POST | /records/:id/workflow | expected revision + action; state/role/SoD validation |
| GET | /records/:id/history | tenant and record authorization; latest 100 revision summaries |
| GET | /records/:id/export | approved only; complete frozen record/history + SHA-256; internal JSON |
| GET | /audit?before= | designated internal audit/compliance/admin/risk head; 100-row cursor |

Kinds: risk, factor, emission, regulatory_document, requirement. Unsupported endpoint/method is 404/405. Sensitive records are never hard-deleted; archive is available only for the owner's draft/rejected records with reason. Approved records cannot be edited, archived, or deleted through the application.

## Role policy and separation of duties

| Role | Concrete foundation permissions |
|---|---|
| Super Administrator | read assigned institution only; no implicit global tenant access or blanket approval |
| Institution Administrator | create factors; read assigned tenant/audit; offline reviewed provisioning remains operator-controlled |
| CRMS Project Administrator | create risk, regulatory documents, requirements |
| Data Maker | create/edit own emission drafts |
| Risk Analyst | create/edit own risk drafts |
| Climate Model Analyst | create factors; check another maker's record |
| Checker | check submitted record; reject with reason |
| Approver | approve checked record if distinct from creator and checker; reject |
| Risk Management Head | approve with SoD, read audit |
| Compliance Reviewer | create regulatory documents/requirements; check others; read audit |
| Sharia Governance Reviewer | check others; contract-specific methods not yet implemented |
| Executive Viewer | read assigned institution, no writes |
| Internal Auditor | read and audit assigned institution, no business writes |
| External Auditor | read approved records/history/exports only; no unapproved records or tenant-wide audit |

A role name is not completion of its eventual business workflows. Admin cannot simply approve their own factors. Membership provisioning must be independently reviewed; no role switching endpoint exists. JWT headers alone are not identity: cryptographic signature, claims, and active membership are required on every API request. Session uses the upstream Access cookie and policy, not browser localStorage. Actual logout/re-authentication requires staging SSO testing.

## Calculation specification

Engine `activity-factor-kg-to-tonne-v1` accepts non-negative decimal strings up to 13 integer digits and 6 fractional digits. Factor unit is strictly kgCO2e/activity-unit. Input activity unit must match factor activityUnit byte-for-byte. No assumed litre/gallon/kWh/MWh, currency, GWP, or geographic conversion. Date must fall within approved factor applicability. All other public formula categories remain outside this official server adapter pending reconciliation.

Calculation: quantity × kgCO2e/activity-unit ÷ 1000 = tCO2e. BigInt fixed-point multiplication: two 6-decimal scaled inputs produce 12 decimal kgCO2e precision, stored as exact decimal output with up to 15 fractional tCO2e digits. Zero is valid; null/blank/malformed/negative/exponent input is invalid. Exact test vectors are synthetic UAT data, not OJK examples. Tolerance for this exact fixed-point formula: exact decimal equality. Future models must define units and numeric tolerances individually.

Factor must be approved by three distinct subjects. Stored result carries input, formula, conversion, engine version, full factor snapshot and revision, output and explicit regulatoryValidation=not_validated. Generic factor source and internal approvals do not assert official source validation. Document hash entered by a user is declared metadata; independent source review and ingestion reconciliation remain required.

## Threat model

| Threat | Implemented control | Outstanding evidence |
|---|---|---|
| Header spoof / client privilege escalation | JWT crypto + membership subject/email + role policy | bank IdP handoff and Access app path coverage |
| Cross-tenant ID/URL/header manipulation | membership gate + composite predicates/FKs; negative tests | isolated staging D1 adversarial/pentest |
| Factor substitution / historical tampering | approved factor only; snapshot revision; frozen DB trigger | full factor source QA and model validation |
| Calculation tampering | allowlist inputs; server-generated outputs; exact decimals | official OJK reference vectors |
| Self approval | three distinct subjects; role/state checks | bank approval matrix acceptance |
| Race / lost updates | expected revision in UPDATE WHERE, RETURNING | real D1 concurrent load and retry testing |
| Partial audit write | same SQL trigger transaction; failure-injection test | D1 runtime rehearsal, external immutable audit archive |
| XSS / unsafe bank text | textContent DOM, no innerHTML; CSP; external script only | live security scan and specialized rich editor sanitization |
| CSRF / resource exhaustion | same-origin mutations, no CORS grants, streamed 32 KiB cap, pagination | per-user/tenant WAF quotas and capacity baseline |
| AI data exfiltration | enterprise routes do not invoke public AI or external providers | approved tenant consent/DLP/AI workflow before enablement |
| DB operator tamper | app has no DDL/admin API, immutable triggers | operator IAM, external retention, monitoring; DB admins remain privileged |

## Capacity and hosting decision

Workers fits the bounded authenticated API and activity-factor operations. D1 is suitable for a controlled pilot after bank residency/security approval and actual workload testing. KV remains public provider configuration/cache, not tenant authorization or official records. R2/object storage, Queues and longer-running compute are target options only after document/hazard/model volume and bank policies are assessed. Large geospatial grids, numerical model fitting, and bulk stress calculations must not be forced into browser or one synchronous request. No numerical SLA, RTO/RPO, user concurrency or six-month completeness claim is made without measurement and bank agreement.
