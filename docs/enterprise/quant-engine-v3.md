# GreenCal CRMS Quantitative Engine v3 — Controlled Increment (31 October 2026)

Status: **source implementation on feature branch; not approved for bank production, nor official OJK reporting.**
Applies after enterprise migrations 0001, 0002 and 0003 against a **dedicated ENTERPRISE_DB** only.
No datasets, account identities, borrower names, access tokens, API keys or confidential bank positions are included in this repository.

## Regulatory/reference sources and scope

1. OJK CRMS Perbankan 2026, **7 books**, official release 6 October 2026: https://ojk.go.id/id/Publikasi/Roadmap-dan-Pedoman/Perbankan/Pages/Panduan-Climate-Risk-Management-and-Scenario-Analysis-Perbankan-CRMS-2026.aspx
2. PCAF Global GHG Accounting and Reporting Standard, **Part A, Third Edition (December 2025)**: https://www.carbonaccountingfinancials.com/en/resources
3. NGFS scenario datasets and limitations: https://www.ngfs.net/ngfs-scenarios-portal/data-resources/
4. OJK Buku 6 (official working paper) and Buku 7 (Pendekatan Standar) require **line-by-line verified field/formula mapping and model-owner sign-off** before submitting or labelling compliance.

## Implemented modules

- `quant.js`: asset-specific attribution-denominator validation for seven supported asset classes; exact six-decimal BigInt arithmetic, *no proxy emission factor*, explicit Scope 1/2/3 missingness and PCAF quality scores. Excludes projects where denominator cannot be substantiated, class not mapped, exposure > denominator or currency not comparable; never silently caps an attribution share.
- `reconcilePortfolio`: up to 100 validated, anonymous positions per batch; identical as-of date/currency; duplicate rejection; GL count and total reconciliation. Declared source SHA-256 and general ledger reference; **actual source-file checksum and GL API verification have not yet been implemented**.
- `interpolateScenario`: bank-supplied NGFS/other climate scenario series, vintage, model, region, variable, unit and dataset SHA-256; one-year interpolation inside versioned observed years, **no extrapolation**. This is not a full NGFS scenario download, calibration or macroeconomic linkage.
- `physicalOverlay`: WGS84 point-in-polygon for user-provided hazard coverage with optional interior holes, source/version/hash and ordinal hazard class. Not a calibrated hazard intensity, depth-damage or economic-loss model; users must ensure coordinate/projection quality.
- `creditTransmission`: user-calibrated additive PD/LGD/EAD shocks and incremental one-period ECL + net-profit sensitivity. NOT a PSAK 71 ECL model (no stages, term structures, discount factors, macro-weighting, SICR, cure, amortization or overlays) and NOT a CAR/ATMR capital model.
- `standardizedApproach`: transparently configurable exposure × coefficient components. **This is NOT an officially verified implementation of OJK Buku 7.** No default coefficients, sector mappings or regulatory claims are supplied.
- `reconcileOjkDraft`: outstanding and computed financed-emissions aggregation to a declared GL control balance; explicitly labelled **internal mapping draft**, not a regulator-file-format Buku 6 export.

## Data controls and API

All endpoints are under `/api/enterprise/analytics/*`. The parent enterprise Worker verifies Cloudflare Access JWT, tenant membership, same-origin mutation and dedicated D1 database BEFORE dispatch.

An additional fail-closed switch `GC_ENTERPRISE_QUANT_ENABLED=true` must be explicitly set in a controlled staging environment. Production remains disabled by default. **Do not activate in the public environment with bank data.**

| Endpoint | Role | Function |
| --- | --- | --- |
| POST `/analytics/import` | data_maker | Validated source-referenced portfolio batch, atomic D1 transaction |
| GET `/analytics/batches` | eligible institution roles | Up to 50 tenant-scoped batch headers |
| GET `/analytics/batches/{uuid}` | eligible roles | Bank-internal reconciliation preview, not official working paper |
| POST `/analytics/runs` | model, risk or compliance role by kind | Quantitative run; stored as immutable JSON and request/result SHA-256 |
| GET `/analytics/runs` and `/analytics/runs/{uuid}` | eligible roles | Read-only lineage/evidence |

Accepted POST `/analytics/runs` kinds: `ngfs_interpolation`, `geospatial_overlay`, `credit_transmission`, `book7_standardized`, `ojk_reconciliation`. The `ojk_reconciliation` kind takes `{"kind":"ojk_reconciliation","input":{"batchId":"...uuid..."}}` and computes from stored tenant-side records, not user-submitted summary numbers.

Import example (all **synthetic test values**, not recommended financial or emission factors):

```json
{
 "asOf":"2026-09-30","currency":"IDR","sourceSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
 "sourceSystem":"SYNTHETIC_CORE_BANKING","glControlTotal":"20","glControlCount":1,
 "controlReference":"SYNTHETIC_GL_UAT",
 "exposures":[{
  "facilityRef":"FAC-ANON-01","obligorRef":"OBL-ANON-01","assetClass":"business_loans",
  "currency":"IDR","asOf":"2026-09-30","outstanding":"20","attributionDenominator":"100",
  "denominatorBasis":"total_equity_and_debt",
  "emissions":{"scope1":"100","scope2":"30","scope3":null},
  "dataQualityScore":3,"evidenceReference":"SYNTHETIC_TEST_ONLY","emissionSourceVintage":"2025"
 }]
}
```

All numeric inputs are **decimal strings**; currency and tCO2e units must be harmonized before import. API accepts JSON only and the existing 32 KiB request ceiling; bank bulk ingestion needs a separate asynchronous/object-storage pipeline with virus scanning, file integrity and staging/reconciliation before it is production usable.

## Remaining release gates — must not be bypassed

- Approved PCAF 2025 implementation by instrument and business line (especially sovereign methods, double-count treatment, financed Scope 3 applicability, quality-score evidence, and financing syariah instruments).
- Verified OJK Buku 2–7 quantitative control matrix, **Buku 7 formula and coefficient tables**, official Buku 6 template/output mapping, and independent regulatory/legal review.
- **Real** NGFS/IAM/NGFS-physical/Macro OJK source ingestion with license, source checksum, country/sector crosswalk, interpolation units, model-vintage comparison and documented uncertainty.
- Credible Indonesia hazards with coordinate reference and asset-level vulnerability/damage functions; authoritative source licensing and geographic validation.
- Bank PD/LGD/EAD calibration, climate overlays and scenario mapping approved by model-risk, independent validation/backtesting and reconciliation with PSAK 71 & bank finance data.
- Actual CBS/financing, treasury securities, GL, collateral/GIS, CKPN/PSAK71 and data warehouse connectors with end-to-end source totals, effective-dated corrections, same-currency FX and duplicate prevention.
- Bank Access SSO enrolment, enterprise D1 provisioning, tenancy, encryption, retention, approvals of analytic results, backup/restore/UAT sign-off, security tests and permissioned release approval.
- The future OJK submission export is **intentionally absent**, and all current JSON reports carry non-submission disclaimers.

## Execute tests

```sh
node --test tests/quant-engines.test.mjs
node --test tests/*.test.mjs
node --check src/enterprise/quant.js
node --check src/enterprise/quant-api.js
```

Go/no-go must be evidenced by CI status, isolated staging migration, identity/RBAC negative tests, actual source-to-report reconciliation and independent validation. A GitHub merge alone does not deploy the production Cloudflare Worker.
