# Domain registers v2 — controlled enterprise implementation (30 October 2026)

## Release status and scope
Code implementation only; no evidence of a bank production deployment or regulator acceptance. This increment extends the existing **separate, disabled-by-default** enterprise workspace. Public GreenCal calculators and the legacy D1 `DB` are unchanged. The new six registers are **not** seven OJK CRMS books, macroeconomic scenario transmission, validated PD/LGD/EAD forecasts, or regulatory-report submission.

## Workflow and menus
Every new record is scoped to the verified institution (tenant), has role-restricted creation, server-side field validation, revision concurrency, immutable history and audit, and the same independent three-actor draft → submit → check → approve workflow as the existing registers. The same creator cannot check/approve. Rejected drafts may be updated by their creator; approved/archived records cannot be modified. An auditor's JSON evidence export includes full versions and SHA-256 but is not a report to OJK.

| Menu | Record kind | Owner who may create | Inputs and outcome | Readiness |
|---|---|---|---|---|
| Kebijakan & Risk Appetite | governance | CRMS project administrator, risk analyst | Governance area, owner, policy text, limits, control, sharia considerations, approval reference, dates | Document workflow only; no board sign-off inferred |
| Eksposur Pembiayaan | portfolio | data maker | Anonymous facility/obligor IDs, sector, region, akad/credit type, currency, EAD/outstanding, as-of, maturity, evidence | Individual UAT record; no bulk-import/core reconciliation |
| Katalog Skenario Iklim | scenario | climate model analyst | NGFS/IPCC/internal classification, vintage, pathway, horizon, original data URL/version, assumptions, limitations | **Metadata only**, NOT NGFS numeric dataset ingestion or scenario run |
| Screening Risiko Fisik | physical | risk / climate model analyst | Approved portfolio+scenario refs, hazard category, manually assessed ordinal hazard/vulnerability (1–5), mitigation and source | 5×5 screening for prioritization only; NOT GIS overlay, loss, PD, flood depth or financial impact |
| Asesmen Risiko Transisi | transition | risk / climate model analyst | Approved portfolio+scenario refs, driver, transmission, carbon-price assumption and currency unit, adaptation, source | **No** bank loss/PD/LGD/EAD or sector stress computation; manual input |
| Paket Laporan Internal | report_package | compliance reviewer, CRMS project administrator | Period, management/draft mapping, evidence index, data quality, model limits, reviewer notes | Internal draft only; not an OJK submission or proof of compliance |

The existing five foundation kinds remain unchanged: risk, factor, emission, regulatory_document, requirement.

## Bank data / assurance constraints
- Access requires a verified Cloudflare Access JWT and active membership in a dedicated `ENTERPRISE_DB`. Never reuse the browser IP scope, legacy login tables, public `DB`, or public state.
- External auditors only read approved records; separate maker, checker, and approver.
- **Never paste personal customer names, NIK, private addresses, passwords or raw documents into the UAT portfolio form.** IDs must be opaque bank-approved references. UAT fixtures are labelled SYNTHETIC.
- Screening numbers and scenario assumptions are **not** endorsed OJK/PCAF/NGFS model outputs. No final credit, provisioning, CAR, liquidity or sharia compliance decision is supported by these forms.
- Use sources with recorded publication date/vintage/version. Independently validate hazard geodata, geocoding, exposures, climate/NGFS series, carbon price units, formulae, and expected results before moving to calculation engines.
- Manual report packages must be reconciled to approved controlled datasets and OJK's actual official reporting definitions; an approved package is still internal-only.

## Staging database migration
Run only against the isolated **enterprise** staging database, after the existing 0001 migration and a verified full backup:

```bash
npx wrangler d1 execute <ENTERPRISE_STAGING_DB_NAME> --remote --file migrations/enterprise/0002_domain_registers.sql
```

Replace the placeholder with the correct environment-managed staging DB. Do not run against the existing public `greencal-db`, do not silently enable enterprise production, and never paste banking data into source control. 0002 adds `gcx_domain_records`, `gcx_domain_versions`, the indexed tenant queries, frozen record triggers and audit through `gcx_events`. It deliberately **does not rewrite** existing `gcx_records`, prior migrations, or their history.

Before enabling UI against any shared staging DB, verify:
- Both migration versions are applied exactly once; `PRAGMA integrity_check`, `PRAGMA foreign_key_check`, records count and sample audit chain; backup/restore rehearsal on a clone.
- Role matrices, forged Access JWTs, expired sessions, cross-tenant references, invalid date/decimal inputs, stale revision conflicts, separate actor approvals and hard-delete denial.
- New domain `/api/enterprise/records`, `/api/enterprise/references`, summary, history, export, and responsive desktop/mobile screens.
- Existing public GreenCal calculator workflows, public AI, data reset/isolation and asset routing remain green.

## Seven-book programme integration and gates
This increment is a scaffolding step only:
- **Buku 1 / governance:** policy/risk register documentation (no bank board approval claim).
- **Buku 2 / transition:** driver + approved exposure/scenario linkage (no validated impact estimation).
- **Buku 3 / carbon:** existing exact activity-factor server calculation, current factor approvals; bank PCAF portfolio computation remains pending.
- **Buku 4 / macroeconomic:** scenario metadata only; no endorsed macro series/elasticities.
- **Buku 5 / physical:** hazard screening only; geospatial join and financial vulnerability engine remain pending.
- **Buku 6 / reporting:** evidence register and internal report work package only; no official format/export.
- **Buku 7 / standardized CRMS:** **not implemented** pending official source extraction, model sign-off, and UAT.

Next priority gates: primary OJK source-to-requirement traceability by book/page; bank-specific ownership and SSO; normalized customer/facility/collateral/geo facts with reconciled imports; versioned NGFS/macro/hazard datasets; independently reviewed model runs and validations; approved official report mappings; bank UAT/security/DR/operational sign-off. No acceptance is implied by compilation or tests.
