# GreenCal CRMS Enterprise — Cloudflare service → Vercel cutover runbook
Date: 31 October 2026

## Purpose / architecture
This is an actual repository implementation of Vercel-compatible API, public AI and
native PostgreSQL Enterprise schema. It is **not** an assertion that bank integrations
are deployed, approved or that Cloudflare can be shut down.

| Old Cloudflare service | New Vercel target | Implementation / limitation |
| --- | --- | --- |
| Workers static assets + API | Vercel build `dist/` + `api/bridge.js` | GitHub deployment; build validated |
| D1 `greencal-db` public state/auth | Per-browser public calculations + **new dedicated public PostgreSQL** if optional AI Cloud is enabled | Existing browser data are *not* stored in D1. Legacy usernames require bank/owner-approved identity re-enrollment |
| KV `AI_CONFIG` | `GREENCAL_AI_ORDER_JSON` encrypted/plain environment configuration in Vercel | Source KV had **zero keys** at inventory. Admin editing is *not* implemented in Vercel; use protected config/redeployment |
| Cloudflare API key secrets | Vercel encrypted `AI_KEY_*` environment variables | Cloudflare secret plaintext cannot be exported. Rotate/reconfigure directly in Vercel; never put keys in Git |
| D1 public AI quotas | `migrations/vercel/0001_public_ai.sql` in dedicated public PostgreSQL + atomic upserts | IP scope HMAC via server-trusted Vercel forwarded address; no raw IP stored in SQL |
| Cloudflare Access bank identity | Bank-managed OIDC (RS256, pinned issuer & JWKS) | Identity verifier available. Actual bank IdP, login flow, user enrollment and memberships **not configured** |
| Separate D1 `ENTERPRISE_DB` | Dedicated institution PostgreSQL | PostgreSQL DDL under `migrations/vercel/0100_...` and `0101_...`; requires DB provisioning and independent approval |
| Enterprise D1 migration / audit | Native PostgreSQL triggers, immutable histories, composite tenant FKs | Run synthetic CI proof; bank production migration/restore, OJK parity & independent approvals still required |
| Cloudflare public AI | `/api/ai/status`, `/api/ai/analyze` on Vercel | OFF unless public DB/secret, AI env keys and explicit feature flag; aggregate metrics only |

## Verified Cloudflare source inventory
Account Worker `greencal`, public D1 `greencal-db`. Inventory query:
`gc_users=2`, `gc_state=0`, `gc_sessions=0`, `gc_login_limits=0`,
`gc_events=0`, `gc_public_ai_quota=0`, `ai_settings=0`, `users=0`,
`sessions=0`. `AI_CONFIG` KV namespace key count **zero**.

**No user rows, password hashes, API keys, encrypted keys or cookies were exported.**
Enterprise tables do not exist in the inventoried public D1. No verified bank
enterprise records were transferred. All old secrets must be re-provisioned by
their authorized owners; never transfer only hashes without re-enrollment.

## Vercel destination
- Account/team: Serayamg / `collman`; project `greencal-crms-enterprise`.
- Code: `elanghaqeem-hash/greencal`, production branch `main`.
- Production URL: `https://greencal-crms-enterprise.vercel.app`.
- At pre-change inventory only `IP_SCOPE_SECRET` was configured; Vercel
  project **had no connected institution database**, no bank IdP configuration,
  and no public AI quota database. An installed Prisma Marketplace free-plan
  integration does **not** mean a resource is connected to this project.
- Serverless API features must remain explicitly `false` until tested.

## Minimum secure environment — separate data stores

Public only:
- `IP_SCOPE_SECRET` (already present) — HMAC pseudonym, not an IP.
- `GREENCAL_PUBLIC_DATABASE_URL_POOLED` — approved PostgreSQL DB reserved
  exclusively for PUBLIC AI quota; **must differ** from all institution DBs.
- `GREENCAL_PUBLIC_AI_ENABLED=true` only after public quota DDL, anti-abuse
  monitoring and key/usage acceptance.
- `GREENCAL_AI_ORDER_JSON` nonsecret allowlist e.g.
  `[{"provider":"gemini","model":"gemini-2.5-flash","enabled":true}]`.
- `AI_KEY_GEMINI`, `AI_KEY_OPENAI`, `AI_KEY_OPENROUTER`, `AI_KEY_GROQ`
  configured **inside Vercel environment** only as protected values.

Institution only:
- `DATABASE_URL_POOLED` — approved dedicated bank PostgreSQL with TLS,
  independent backup/restore and bank-authorized residency.
- `GREENCAL_BANK_DB_NAME` — exact approved PostgreSQL database name for
  read-only schema preflight. App must additionally check audit/tenant controls.
- `GC_ENTERPRISE_IDENTITY_MODE=oidc` for Cloudflare-independent identity.
- `GC_ENTERPRISE_OIDC_ISSUER`, `GC_ENTERPRISE_OIDC_JWKS_URL`,
  `GC_ENTERPRISE_OIDC_AUD` (bank-reviewed issuer, same-origin HTTPS JWKS
  and audience); JWT email must be verified and membership bound to subject.
- `GC_ENTERPRISE_ENABLED=true` only after migrations, connection controls,
  login/PKCE flow and membership, bank UAT, external release approvals.
- Separately gated modules:
  `GC_ENTERPRISE_BOOK6_ENABLED`, `GC_ENTERPRISE_BOOK7_ENABLED`,
  `GC_ENTERPRISE_QUANT_ENABLED`, `GC_ENTERPRISE_ADVANCED_ENABLED`,
  `GC_ENTERPRISE_SOURCE_REVIEW_ENABLED`, `GC_ENTERPRISE_RELEASE_ENABLED`,
  `GC_ENTERPRISE_REQUIRE_SOURCE_MANIFEST`. No implicit enablement.

## Migration and verification procedure

1. Confirm written owner/bank approvals on jurisdiction, billing/quotas,
   encryption, backup retention, data processing, operator privileges and IdP.
2. Provision **two separate databases** as necessary: public AI quota and
   each institution's approved isolated PostgreSQL. Never share one
   bank database with public AI or another tenant's public data.
3. In a temporary disposable PostgreSQL16 instance, execute:
   `psql -v ON_ERROR_STOP=1 -f migrations/vercel/0001_public_ai.sql`
   for public database; and `0100_enterprise_core.sql` then
   `0101_enterprise_modules.sql` for a **separate empty bank DB**.
   Do not apply these files directly to the legacy Cloudflare D1.
4. Run `npm run test:vercel` and `npm run test:postgres` against
   **synthetic isolated** CI database. Check all 21 GCX tables,
   active immutable triggers, cross-tenant denial, revision guards,
   user access, signed-JWT negative vectors, and backup/restore.
5. Use `node scripts/vercel/verify-bank-schema.mjs` with bank-authorized
   environment. Its return value `schemaPresent=true` is **not**
   `bankProductionReady=true`.
6. Provision bank users only from validated IdP subject + verified email.
   Do not silently migrate legacy `gc_users` hashed password rows.
   OIDC verifier currently accepts a valid externally acquired Bearer token;
   a bank-approved browser login/PKCE session and enrollment workflow
   remains an external go-live prerequisite.
7. Configure Vercel **Preview** first. Perform authorized data source
   imports (CBS/GL/CKPN/NGFS/geospatial) with SHA-256, source control totals
   and bank sign-offs. The protected OJK Buku 6 original XLSX has still
   not passed sheet/formula/cell parity validation.
8. Exercise UAT, independent model validation and separate signatures
   (Risk, Finance, Compliance, IT, Model Validation).
9. Deploy reviewed commit, inspect Vercel build/function logs,
   validate all public and permitted banking routes, demonstrate RTO/RPO
   and roll back by Vercel deployment if errors.
10. Only after signed cutover and parity can Cloudflare Worker/D1/KV
    be retired. Until then, leave all Cloudflare resources untouched.

## Explicit nonclaims
- Vercel READY = successfully built/deployed source, not a bank-safe release.
- No official OJK Excel submission occurs from the internal Buku 6 JSON engine.
- Tests use synthetic data and may establish coding correctness, **not**
  independent validation of climate/stress models on bank source data.
- No account billing upgrade, destruction, cross-project credential reuse,
  or real customer data migration is authorized by this code-only PR.
