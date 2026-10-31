# GreenCal CRMS — Bank Environment, Secure Data Intake and Climate Source Assurance (2026-10-31)

**Current operating decision: NO-GO for bank production.** Code and tests may be integrated into main behind feature flags, but no bank portfolio, login identity, license, official regulatory output or approval may be fabricated. No migration has been applied to the public GreenCal D1.

## 1. Dedicated enterprise infrastructure — actual API evidence

Cloudflare account `208155f241d4da84e1a6a9b44b7a8d28` has **10/10 D1 databases**. An attempted **CREATE** of `greencal-enterprise` with `primary_location_hint=apac` and read replication disabled returned **HTTP 403, error 7406: System limit reached: databases per account (10)**.

Do NOT repurpose or delete a database used by INDIA, TotalARC, ICOP or `greencal-db`. Two safe choices require account-owner action: approve a separate bank-controlled Cloudflare account, or explicitly authorize paid D1 capacity on this account. An APAC placement hint is not a promise of Indonesian data residency. Formal bank data-processing agreement, hosting/security assessment and RTO/RPO are preconditions.

Once capacity and bank governance are approved:
1. Create dedicated D1 `greencal-enterprise-staging` and `greencal-enterprise` (if capacity allows) in the approved Cloudflare account.
2. Apply `migrations/enterprise/0001_foundation.sql` through `0007_dataset_provenance.sql` in ascending order; capture migration checksum, foreign-key check, trigger test, empty database backup and isolated restore.
3. Bind **only** the dedicated database as `ENTERPRISE_DB` to a separately approved bank Enterprise Worker/environment (not public `DB`), with Access JWT AUD/domain from bank institution app.
4. Keep `GC_ENTERPRISE_ENABLED`, `GC_ENTERPRISE_QUANT_ENABLED`, `GC_ENTERPRISE_ADVANCED_ENABLED`, `GC_ENTERPRISE_SOURCE_REVIEW_ENABLED`, `GC_ENTERPRISE_RELEASE_ENABLED` **OFF** until audited tenant provisioning, bank sign-off and UAT pass.
5. Enforce auth/approval and tenant isolation tests, backup/restore under actual D1 RTO/RPO, security checks and official regulatory mapping before bank production.

## 2. Institution identity and Cloudflare Access

Existing Access application `c8c9dda0-e883-4ac8-ac3a-26d708b17861` covers both `/enterprise` and `/api/enterprise`; it has **no Allow policies** (deny by default), and session maximum is 1h. Account-level IDPs present: a generic Cloudflare account identity provider, an email-OTP provider and a passkey provider. **No bank-specific verified IdP, individual bank identities, membership authorization or bank-approved policy is present.**

To activate safely, obtain bank IdP domain/metadata/administrator authorization, verified employees and `sub` identifiers, authorized app owners, bank SSO mechanism (OIDC/SAML), required MFA, approved email domain/identity group, sessions/role map and security/retention authorization. Use least privilege Access include policies for approved IdP groups; never use unrestricted email-domain allow without bank confirmation. Validate unauthorized identities are denied, old sessions/revocations expire and Worker JWT `iss`, `aud`, `exp` and signatures are checked. Provision verified tenant memberships with the existing private provisioner; do not seed dummy principals.

## 3. External bank CBS/GL/CKPN connectors

Bank-controlled agent `scripts/bank-secure-fetch.mjs`: a strict HTTPS GET connector for `CBS`, `GL` and `CKPN`. Unlike public Worker, this agent runs inside the authorized bank environment and uses an exact allowlisted FQDN, locally injected service-account bearer credential, no redirects, response content-type and size caps, a 15s timeout and full-file SHA-256 comparison to an independently expected bank hash. The host and token are **not committed**. Any mismatch aborts before accounting/model ingestion.

Private (non-repository) manifest example with placeholders:
```json
{
  "source":"CBS",
  "url":"https://BANK_APPROVED_FQDN/bank-approved-export-path",
  "allowedHosts":["BANK_APPROVED_FQDN"],
  "expectedSha256":"64_HEX_DIGITS_FROM_SIGNED_SOURCE_CONTROL",
  "secretEnv":"BANK_CBS_SERVICE_TOKEN",
  "approvedPurpose":"CRMS_BANK_AUTHORIZED_DATA_EXTRACTION",
  "maxBytes":25000000
}
```
Use `node scripts/bank-secure-fetch.mjs bank-connector.private.json bank-export.private.csv` only inside bank-controlled execution with credentials in a non-logged environment secret. Never store the private manifest, bearer token, raw bank data or customer identity in GitHub/ChatGPT logs.

- CBS records: `scripts/portfolio-cbs-adapter.mjs` enforces strict **anonymous** facility columns, source SHA and independent GL totals; splits to small JSON D1 API batches.
- General Ledger (GL): obtain separately verified GL control total, count, currency, date and accounting/reconciliation reference from the signed source. `prepareBankPackage` requires an independent GL control object; the new connector transports the bank-approved GL CSV but does not automatically interpret arbitrary bank GL schemas. Real GL field mapping must be signed by Finance.
- CKPN: `scripts/ckpn-reconciliation.mjs` ties booked facility CKPN to Stage 1/2 ECL, currency, date, CKPN GL control total and bank tolerance. Stage 3, recalibrated SICR and actual PSAK 71 posting require separate implementation/approval; no journal is written.
- `prepareBankPackage` checks source bytes against the upstream cryptographic checksum before accepting independent GL and ECL reconciliation. The result always carries `regulatedPostingAllowed:false`.

This is **connector implementation and synthetic test**, not actual remote bank connectivity, which needs approved endpoint URLs/credentials, network routing, production contracts, CBS schema and data owner authorization.

## 4. Climate datasets

Official public discovery and candidate sources **not bank approved**:
- NGFS long-term Phase V/2024 and short-term May 2025: https://www.ngfs.net/ngfs-scenarios-portal/data-resources/ and https://www.ngfs.net/en/what-we-do/scenario-design-and-analysis
- NGFS IIASA IAMC explorer data: https://data.ene.iiasa.ac.at/ngfs/
- Official BNPB InaRISK geospatial service catalog: https://gis.bnpb.go.id/server/rest/services/inarisk
- InaRISK risk data methodology and use limitations: https://inarisk.bnpb.go.id/v4/metodologi
- BMKG GIS API and layer metadata: https://gis.bmkg.go.id/portal/dataapi

`scripts/climate-source-validation.mjs` accepts **downloaded original bytes** and a bank-private manifest with official source URL and expected SHA. NGFS IAMC inputs must identify exact model, scenario, region, variable, unit, vintage and year, reject ambiguous/missing-series or extrapolation. GeoJSON must be approved EPSG:4326 and non-degenerate Polygon/MultiPolygon with closed rings and stable feature IDs; limits count and geometry. **A real BNPB raster or ImageServer is not automatically a GeoJSON polygon**; GIS expert must explicitly extract and reproject with provenance. NGFS climate scenarios are not probability forecasts. For long-term NGFS Phase V chronic physical economic damages, explicitly examine documented academic critique and revised release/model limitations.

`migrations/enterprise/0007_dataset_provenance.sql` + `/api/enterprise/source-registry` records immutable tenant-scoped checksum, source URL, version, license and verification-artifact SHA. Independent `checker`, `climate_model_analyst` and `approver` attestations require distinct verified Access identities. Even with three attestations, `dataValidatedForBankProduction:false` is deliberately returned until the real bank has approved source bytes, license, georeferencing, vulnerability curves and model suitability. The registry flag `GC_ENTERPRISE_SOURCE_REVIEW_ENABLED` is **OFF**.

## 5. Release gate

Priorities:
- P0: dedicated enterprise D1 and institution IdP, signed endpoints/data-sharing permissions, authenticated bank identity, actual D1 backup/restore.
- P0: real source extracts with full SHA-256, correct GL/CKPN totals and approved bank mapping; no unknown units, currencies or customer PII in public processing.
- P0: NGFS scenario file/phase/vintage approval and geospatial licensed data, coordinate validity, hazard model/backtesting and data ownership.
- P0: independent quantitative validation and OJK Books 6/7 verified formula templates and Risk/Finance/Compliance/IT sign-offs.
- P1: full volume, reliability, replay/rollback, credential rotation, model monitoring and bank acceptance evidence.

**A CI pass proves code behavior on synthetic inputs only. A Cloudflare Access app without an Allow policy is not activated for any bank person. D1 quota failure is not resolved by code changes.**
