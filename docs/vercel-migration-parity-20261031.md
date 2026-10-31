# GreenCal Cloudflare → Vercel parity & bank release gates — 2026-10-31

## Verified source and destination (read-only inventory)
**Source:** Cloudflare Worker `greencal`; public D1 `greencal-db` (id f9169067-32bc-425c-bef8-1cb86a4d5fcd), KV `GREENCAL_AI_CONFIG`, Cloudflare managed services. The public D1 has `ai_settings`, `gc_events`, `gc_login_limits`, `gc_public_ai_quota`, `gc_sessions`, `gc_state`, `gc_users`, `sessions`, and `users`; source count queries found **2 rows in gc_users, zero rows in other user/public-state tables**. KV key listing was empty. This inventory does **not** authorize any export of PII, account secrets, hashed credentials, tokens or bank records.

**Destination:** Vercel team `collman` (Serayamg), project `greencal-crms-enterprise` ID `prj_e5FsKGSQ8EKYCusZJuR7DMm4ml8l`, linked to `elanghaqeem-hash/greencal` main. Native runtime: `api/bridge.js` Node serverless and `dist/` public + enterprise UI. Project build command `node scripts/build-dist.mjs`, output `dist`, Node **24.x**. Prior production Vercel deployments report `READY` (distinct from bank production readiness). Project is currently protected by Vercel SSO for deployment URLs except custom domains.

**Destination operational gap:** project has no DATABASE_URL / DATABASE_URL_POOLED / GREENCAL_POSTGRES_URL, no bank `GC_ENTERPRISE_ACCESS_DOMAIN` / `GC_ENTERPRISE_ACCESS_AUD`, and no connected database resource. Its only stored environment key (read-only key listing) is `IP_SCOPE_SECRET`, an encrypted network-scoping secret. Prisma Marketplace integration is installed at team level but has **zero selected projects and no GreenCal database binding**.

## What is migrated as runnable Vercel code
- Public GreenCal static frontend / calculators / assets, including mobile/desktop.
- Authenticated enterprise frontend menus: risk/portfolio, NGFS/geospatial, PCAF, Buku 6/7, Discovery Readiness, source approvals, audit, release workflow, reporting preview.
- Bank-specific quantitative methods and all Book 7 A/B/C annex PDF-precision lookup catalogues retained in GitHub `main`; Vercel native handler can dispatch to `handleEnterpriseApi` only after verified institution identity and database.
- Vercel PostgreSQL D1 prepared-statement adapter, now including **placeholder conversion inside atomic batches**. This adapter is *not* a completed SQLite→PostgreSQL schema migration and must not be claimed as such.
- Vercel bridge forwards explicitly allowlisted Enterprise flags (quantitative, Buku 6, Buku 7, advanced, data source review, release and source manifest), all OFF unless individually enabled. No unreviewed secret or arbitrary environment-variable forwarding.
- Public per-network browser scope uses only Vercel-managed forwarding identity, HMAC secret never returned, no implicit Cloudflare identity reuse.
- Controlled `/api/health` is intentionally not a bank-readiness certificate; reports configuration presence but bankProductionReady/regulatoryReportingApproved remain **false**.

## Strictly outstanding work (not completed and must NOT be silently activated)
1. **Bank-approved hosting and identity:** acquire a bank SSO/IdP or approved Access JWT flow, enforce MFA, allowed domains, audience and tenant membership, disable public bypass. Vercel Authentication for collaborators does **not** replace bank identity.
2. **Isolated Vercel PostgreSQL:** connect an approved database to this project and provide pooled TLS credentials via Vercel integration; review jurisdiction, encryption, backup, retention, cost, data residency. Apply PostgreSQL-native schema reviewed against `migrations/enterprise/*.sql`; do not execute D1 SQLite DDL in PostgreSQL without conversion and validation. No source enterprise production DB currently exists in the inventoried Cloudflare D1 list.
3. **Migration data:** the D1 listed above is the legacy **public** DB, containing two legacy auth accounts, not a bank enterprise DB. No bank data or login hashes should be automatically copied. Use explicit inventory/export SHA256, staging recovery test, anonymization/approval and approved account identity re-enrolment.
4. **Integration of CBS / GL / CKPN / NGFS / geospatial / bank data sources** and official full-precision OJK workbooks. Uploaded PDF scalar values are presentation-rounded; one CRE/RRE source cell is `NaN` and blocked by design. No official CKPN/ATMR/LCR/OJK submission claims.
5. **Legacy/public Cloudflare backend:** D1-auth, public AI provider settings, state and audit endpoints are intentionally blocked on Vercel until PostgreSQL and bank-approved identity, anti-abuse and provider secret integration are commissioned. Browser-only calculator function remains separate and does not mutate enterprise state.
6. **Independent validation & UAT:** multi-tenant access security, transaction/restore/reconciliation parity, maker/checker/approver SoD, model validations, actual institutional UAT, Risk/Finance/Compliance/IT/Model Validation signoff before promoting sensitive functionality.
7. **Cut-over:** monitor Vercel production version, verify asset/health URLs in authenticated browser, validate no 404/function errors. Keep Cloudflare public environment in place until a written cut-over plan including rollback and domain/DNS migration has been approved.

## Runbook for authorized operator
1. Attach a **new, dedicated** PostgreSQL instance using Vercel Storage/Prisma only after approval; do **not** redirect `DATABASE_URL` to another project's database.
2. Validate connection URL SSL, schema parity, all DDL constraints and trigger behavior, migrations order, rate limits and backup/restore.
3. Create explicitly scoped env values in Vercel **Preview first** for `DATABASE_URL_POOLED`, `GC_ENTERPRISE_ACCESS_DOMAIN`, `GC_ENTERPRISE_ACCESS_AUD`, and flags only for allowed tested modules. Keep `GC_ENTERPRISE_ENABLED=false` in production until all acceptance gates passed.
4. Run `node --test tests/vercel-runtime.test.mjs`, `node --test tests/*.test.mjs`, `node scripts/build-dist.mjs`, signed JWT/tenant negative tests, real PostgreSQL integration tests, and staging restore. No demo subjects should be admitted to production.
5. Deploy main and inspect deployment/build/runtime logs. Observe `/api/health` after authentication if the site is behind Deployment Protection. Require `bankProductionReady=false` until independent approval is actually recorded.

## Evidence classification
- GitHub commit / CI: source and synthetic tests only.
- Vercel READY: artifact build and availability state only; may still be deployment-protected.
- Cloudflare D1 list/count: source metadata only.
- Bank-ready: **NO**.
- Complete migration of Cloudflare D1, private AI configuration, bank SSO, PostgreSQL records: **NO**.
