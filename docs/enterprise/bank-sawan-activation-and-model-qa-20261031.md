# GreenCal CRMS Enterprise — Bank Sawan synthetic activation and model QA
Date: 2026-10-31. Scope: Vercel Team serayamg, project greencal-crms-enterprise, GitHub elanghaqeem-hash/greencal.

## Decision
**Synthetic Preview activation verified; bank institution SSO and regulated production remain NO-GO.** No real customer, account, facility or bank employee identities were activated. Do not enable `GC_ENTERPRISE_ENABLED` for production until a verified bank IdP and institution role memberships exist. Production remains deny-by-default.

## PostgreSQL evidence (Preview only)
- Resource: existing Vercel-connected Prisma PostgreSQL; isolated schema `greencal_demo`, not `public`.
- One-time branch: `feat/bank-sawan-demo-20261031`, commit `d3767f7a897a7525fe4cd3df2786ba1874e57e14`; exact target `greencal-crms-enterprise`.
- Seed deployment `dpl_3fCT75LYuKMkktGSmrCasc4m3s1o`, Vercel status READY. Build log `GREENCAL_SAWAN_SEED_RESULT`: allowed=true, applied=true, tenant=`bank-sawan-demo`, mode=SYNTHETIC_ONLY, institutions=1, memberships=6, risks=1, book6=1, readiness=1, book7=1, bankProductionReady=false, officialOjkSubmission=false.
- Preview-only `GC_SAWAN_SEED_APPLY` reset to `disabled` immediately after seeding.
- Separate read-only verification deployment `dpl_8j1FzuECgmf4WWYaX39QWN1D7YtF`, status READY. Build log `GREENCAL_SAWAN_VERIFY`: verified=true, syntheticOnly=true, book6=draft, book7Runs=1, readiness=draft, bankProductionReady=false.
- Preview-only `GC_SAWAN_VERIFY_READONLY` reset to `false` after verification. All existing main/Production features left disabled.

## Identity status
Six synthetic database memberships exist for roles `data_maker`, `checker`, `approver`, `risk_analyst`, `climate_model_analyst`, `compliance_reviewer`; subjects are demo placeholders and emails use .invalid. This is NOT a bank login or completed IdP onboarding. No verified OIDC issuer, JWKS, audience, bank-subject identities, signed tokens or domain policies are configured. Vercel collaborator SSO is not bank institutional SSO; never bypass crypto validation using plain user headers.

## Model regression validation
- Isolated source on Vercel Sandbox from GitHub `main` commit `c3b25877056375164e64777128e0231b519f3bda`, runtime Node.js v24.22.1, no production DB credentials or live portfolio supplied.
- Automated selected tests: books124, book3, book6-workpaper, book7-standardized, book7-annex-parameter, quant-engines, advanced-engines, bank-release-uat, ckpn-reconciliation, discovery-readiness, source-provenance, source-reconciliation, pcaf-securities, rbac, ngfs-iamc-adapter.
- Direct test execution result: **85 passed, 0 failed, 0 skipped, exit code 0**. Golden vectors include financed emission attribution, physical damage interpolation, ECL discounting, capital/CAR bridge, and scenario/Source/SoD/tenant guards. This is model **implementation QA on synthetic cases**; not backtesting or independent quantitative validation of actual bank model performance.
- Historical calibration, independently approved macro Book 4 dataset, official Buku 6 workbook parity, real CBS/GL/CKPN, physical geospatial hazard sources, independent model validator sign-off, bank data processing approvals and five-role release evidence are NOT established.

## Production health after demo
- `GET https://greencal-crms-enterprise.vercel.app/api/health`: HTTP 200, postgresConfigured=true, institutionSSOConfigured=false, enterpriseEnabled=false, bankProductionReady=false, regulatoryReportingApproved=false.
- `GET /api/enterprise/session`: HTTP 503 ENTERPRISE_NOT_ENABLED (correct fail-closed condition).
- Public static app remains online; no production banking tenant opened.

## Required activation before real bank operation
1. Institution-owned OIDC/SAML IdP with issuer, audience, JWKS/metadata, verified people and revocation/MFA policy. Provision memberships using signed verified subject/email only.
2. Dedicated approved PostgreSQL instance/schema per bank and permitted hosting region, not the shared synthetic schema. Apply and independently verify migrations, RLS/tenant isolation, audit immutability, secrets and backup/restore.
3. Obtain real bank-approved CBS/GL/CKPN, emissions, NGFS and GIS datasets, validate Book 4 data tables and bank-specific PD/LGD/EAD model calibration and challenger/backtesting results.
4. Complete maker-checker-approver UAT, negative tests, five-owner Release Gate (Risk/Finance/Compliance/IT/Independent Validation), regulator report reconciliation and bank approval. Only then consider enabling production flags.

Do not misrepresent this demonstration as official OJK validation or a live authenticated bank portal.
