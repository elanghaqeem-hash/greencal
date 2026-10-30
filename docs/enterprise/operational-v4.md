# GreenCal CRMS Enterprise — quantitative v4 execution and bank production release gates
Date: 31 October 2026
Repository: https://github.com/elanghaqeem-hash/greencal

**Deployment disposition: NO-GO for bank-data production.** The public GreenCal calculator must not be confused with the private Enterprise workspace. All new quantitative APIs are disabled by default unless both the existing enterprise gate and advanced quantitative flags are explicitly configured on an isolated bank-controlled environment.

## Implemented in this increment

1. Physical hazard screening from previously committed v3, plus externally calibrated damage curve, vulnerability and mitigation ratio. Zero extrapolation; sensitivity outputs only.
2. Climate-driven credit analytics: retained single-period PD/LGD/EAD sensitivity plus new 12-month Stage 1 and lifetime Stage 2 ECL with scenario-weighted, conditional PD and period discounting; Stage 3 explicitly unsupported rather than fabricated.
3. Finance transmission: incremental ECL, NII, OPEX, profit, capital and CAR ratio sensitivity from bank-supplied GL/ATMR references. This is not regulatory capital calibration or a posted PSAK 71 journal.
4. PCAF seven supported asset-type attribution classes and Scope 1/2/3 data-quality controls (v3) plus immutable per-source reconciliation: header SHA, total GL, count, per-batch subtotals, cross-batch duplicate facility rejection and coverage-aware financed-emission reconciliation.
5. Offline anonymized CSV→PCAF importer, up to 25 MB per file in pilot, safe JSON batches (<=29 KiB) for the existing 32 KiB JSON API, SHA-256 of original input and independent external GL control JSON. Direct live CBS integration is not implemented.
6. Offline IAMC-formatted NGFS CSV series adapter: exact model/scenario/region/variable/unit selection, file SHA-256, dataset vintage, interpolation constrained to existing years; no remote series downloaded, injected, or preseeded.
7. Internal-only model-run storage in dedicated D1 migration 0004, institution-specific source control and immutable GL source register in migration 0005; audit events and role-restricted API.
8. New responsive analytic console in the existing Enterprise navigation. No browser persistence; uploads require anonymous references. Reconciled PCAF source-level internal JSON is available under `GET /api/enterprise/analytics/sources/{sha256}/report`, intentionally NOT an official Buku 6 template.

## Source and method register

- Official OJK CRMS 2026 listing (seven books, released 6 October 2026): https://ojk.go.id/id/Publikasi/Roadmap-dan-Pedoman/Perbankan/Pages/Panduan-Climate-Risk-Management-and-Scenario-Analysis-Perbankan-CRMS-2026.aspx
- PCAF Part A financed emissions, Third Edition (2025): https://carbonaccountingfinancials.com/resources
- Official NGFS scenarios data portal and disclaimers: https://www.ngfs.net/ngfs-scenarios-portal/data-resources/

Source documents with verified full-byte SHA-256 and page numbers may be approved only through independent OJK source-review workflow. Do NOT assert Buku 7 approved coefficients, risk-scenario calibration or Buku 6 field-level official export from high-level listing alone. The GitHub catalog currently has no fully verified Books 6/7. Book 4 and NGFS IAMC must be reconciled for region, vintage, variables, period and unit conversions.

## Controlled bank ingestion instructions

Input CSV for `scripts/portfolio-cbs-adapter.mjs` must have EXACT header, in this order:

```csv
facilityRef,obligorRef,assetClass,currency,asOf,outstanding,attributionDenominator,denominatorCurrency,denominatorBasis,scope1,scope2,scope3,dataQualityScore,evidenceReference,emissionSourceVintage
```

The CSV and its accompanying GL control JSON must be in an authorized private environment. Example *schema only* (all amounts below must be provided from the bank and are NOT hard-coded defaults):

```json
{
  "asOf": "YYYY-MM-DD",
  "currency": "IDR",
  "sourceSystem": "BANK_APPROVED_SYSTEM",
  "glControlTotal": "DECIMAL_STRING_FROM_GL",
  "glControlCount": 0,
  "controlReference": "BANK_APPROVED_GL_RECON_REFERENCE"
}
```

Usage:

```sh
node scripts/portfolio-cbs-adapter.mjs approved-anonymized.csv bank-gl-control.json private-batches.ndjson
```

- The adapter rejects unexpected CSV columns, bank PII columns, duplicate facility IDs, source mismatches and totals diverging from the independent GL declaration.
- Before uploading any batch, record the full-file source control via `POST /api/enterprise/analytics/sources` using original file SHA, as-of date, currency, GL total, GL count and source system.
- Upload each NDJSON line as a **separate** request to `POST /api/enterprise/analytics/import` under the institution's Access session. Use `GC_ENTERPRISE_REQUIRE_SOURCE_MANIFEST=true` for bank acceptance environment.
- Verify `GET /api/enterprise/analytics/sources/{sha256}` returns `completed=true` and the source total/count match. If any batch fails, no regulatory aggregation or bank UAT acceptance is allowed.
- Retrieve `/sources/{sha256}/report` only for completed sources up to 10,000 facilities. Higher-volume bank reconciliation requires a separately validated streaming aggregation; no silent partial output.
- The GL figures are still **operator-declared**. Direct live CBS/GL adapter, inbound signature verification, automated FX rate reconciliation, PII DLP and file checksum verification against upstream CBS exports must be delivered and tested before production use.

NGFS IAMC import:

```sh
node scripts/ngfs-iamc-adapter.mjs bank-approved-ngfs.csv ngfs-selection.json private-selected-series.json
```

Selection must match exactly: `model, scenario, region, variable, unit, vintage, year, sourceUrl`. The adapter rejects ambiguous series and out-of-range interpolation. The output input object may be submitted for the `ngfs_interpolation` run by an authorized `climate_model_analyst`.

## API and role matrix

All calls require existing Cloudflare Access JWT, verified institution membership, same-origin POST and `ENTERPRISE_DB`.

| Route | Allowed to write | Notes |
| --- | --- | --- |
| `POST /analytics/sources` | data_maker | Source-wide GL control, immutable |
| `POST /analytics/import` | data_maker | Each batch GL check; atomic DB batch |
| `GET /analytics/sources/{sha}/report` | institution readers | Full-source internal-only PCAF/GL evidence, no official OJK wording |
| `POST /analytics/runs` | by existing kind-specific roles | NGFS, GIS screening, PD sensitivity, draft Buku 7 and internal OJK batch preview |
| `POST /analytics/advanced/runs` | risk, model or data_maker by kind | physical_damage, lifetime_ecl, capital_bridge, source_manifest |
| `GET /analytics/advanced/runs/{id}` | authorized readers | Immutable, SHA-256 linked internal model output |

Feature flags: `GC_ENTERPRISE_ENABLED=true`, `GC_ENTERPRISE_QUANT_ENABLED=true`, `GC_ENTERPRISE_ADVANCED_ENABLED=true`, `GC_ENTERPRISE_REQUIRE_SOURCE_MANIFEST=true`. **Never turn these on in the public Worker** without dedicated enterprise D1, qualified institution Access/SSO, independently approved datasets and bank UAT. Other existing enterprise identity variables are required.

## Production prerequisite audit (31 October 2026)

The Cloudflare account currently has **ten D1 databases** and no GreenCal dedicated `ENTERPRISE_DB` binding. Cloudflare D1 Free offers up to **ten** databases per account (see https://developers.cloudflare.com/d1/platform/limits/). Do not delete another application's DB or mix bank records into `greencal-db`; obtain an approved separate account/capacity or paid tier, and validate Indonesian hosting/data residency requirements before provisioning.

- **BLOCKER**: no verified bank SSO users, enterprise Access domain/AUD, institution/role provisioning or tenant acceptance evidence.
- **BLOCKER**: no real CBS/GL/CKPN/collateral/GIS approved access; bank balances and data owner attestation absent.
- **BLOCKER**: OJK 2026 Books 6/7 original source full review and official formula/field mapping not complete.
- **BLOCKER**: NGFS/OJK official source dataset vintage and checksum not ingested and signed off; no bank calibration/validation curves.
- **BLOCKER**: accounting Stage 3 recovery model, SICR, amortization and capital/ATMR validation, independently reviewed and backtested, still required.
- **BLOCKER**: protected bank UAT, production D1 backup/restore, vulnerability assessment, negative RBAC tests on real Access, legal/operational approvals.
- **BLOCKER**: official OJK workbook export is not implemented; internal JSON previews must NEVER be filed as regulatory returns.

## Staged release verification and rollback

1. Provision **new, bank-approved dedicated D1** and separate Access app; preserve public database and Worker production settings.
2. Apply migrations `0001` through `0005` in order to isolated D1; capture full backup, table/foreign-key counts, migrations checksums and recovery evidence.
3. Enrol named bank users after approved IdP and institution setup; verify signed JWT, revocation, SoD, cross-tenant 403/404.
4. Run `node --test tests/*.test.mjs`, browser tests, checksum controls, exact PCAF vectors, hazards, scenario years, PD/LGD/EAD and versioned report reconciliation. Stop on any failure.
5. Perform signed-off UAT in staging on bank-authorized datasets with maker→checker→approver governance. Record evidence and independently validate losses against bank model.
6. Map every official OJK Buku 6 cell and Buku 7 calculation to a verified page, evidence, calculation and bank approval; release only after gap matrix is zero or explicitly exempted.
7. Deploy controlled Cloudflare Worker version to approved environment, verify live HTTP endpoints and DB binding, monitor 4xx/5xx/errors, and retain rollback Worker version plus D1 Time Travel/backup according to bank RTO/RPO.

**Implementation readiness ≠ production usability.** A merged code branch, all-green CI, or visible public Greencal page cannot substitute for security, source, methodology and bank acceptance gates.
