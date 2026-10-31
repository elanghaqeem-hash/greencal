# Vercel native deployment — GreenCal CRMS Enterprise

Status (31 October 2026): **static frontend deployed**, all institutional API operations **fail closed** until PostgreSQL, bank identity, schema migration, and independent sign-off. **No regulatory-compliant CRMS operational claim**.

## Verified deployment

Vercel project: `greencal-crms-enterprise`, team `serayamg`. GitHub source: `elanghaqeem-hash/greencal`, branch `main`. First deployment `dpl_CrSQZpV9AUrEfxetZcUekg7Fu1D8` has `READY` build status. Live static pages `/` and `/enterprise/` returned HTTP 200. Enterprise `/api/enterprise/session` returned HTTP 404 before native backend, so frontend being reachable did **not** mean the app worked.

The Vercel port includes:
- Build and static asset routing using `vercel.json` and `scripts/build-dist.mjs`.
- Security headers on enterprise shell and API, including no-store and a restrictive CSP.
- Vercel function under `api/bridge.js`, routed from `/api/:path*`.
- `GET /api/health`: public *capability/configuration status only*. `bankProductionReady` and `regulatoryReportingApproved` remain explicitly false; never infer them from a database URL existing.
- `GET /api/ai/status`: honest local-only fallback on Vercel. No Cloudflare KV keys or provider secrets copied.
- `/api/enterprise/*`: 503 until explicit `GC_ENTERPRISE_ENABLED=true`, reviewed PostgreSQL URL, `GC_ENTERPRISE_ACCESS_DOMAIN` and `GC_ENTERPRISE_ACCESS_AUD`. When all configured, the shared enterprise handler validates Cloudflare Access JWT signatures, issuer, audience, expiry, tenant membership and maker/checker rules. **Important:** a Vercel hostname is not inherently covered by a Cloudflare Access application. An approved ingress/domain/IdP must be implemented before enabling the flag.
- Public auth, state, and AI cloud endpoints intentionally return explicit 503 pending complete backend and identity migration. These are **not** operational on Vercel yet.
- A PostgreSQL D1-interface compatibility helper with parameter-bound SQL, case-insensitive email lookup translation and transactional `batch`. It does **not** create tables nor magically port SQLite triggers, `PRAGMA`, or unique/foreign-key behavior.

## Critical prerequisites before enabling enterprise

1. Create a **dedicated** Prisma Postgres resource through Vercel Marketplace, choose authorized region/data residency and connect it to GreenCal project in approved environments. Avoid sharing the existing bank/unrelated projects' databases. [Prisma/Vercel guide](https://www.prisma.io/docs/guides/postgres/vercel).
2. Use the **pooled URL** for Vercel Functions: `DATABASE_URL_POOLED` preferred; fallback `DATABASE_URL`. Secrets remain in Vercel environment only. No production passwords in GitHub or chat transcripts.
3. Port **all enterprise D1 migrations** (`migrations/enterprise/*.sql`) to PostgreSQL, including immutable record/version triggers, tenant isolation, release gates, Discovery Readiness, financed emissions, Buku 6 and Buku 7 tables, without omitting SQLite-specific checks. Apply with a reviewed, reversible database migration process, **never** at API startup.
4. Migrate two public Cloudflare D1 user identities only through the reviewed `scripts/migrate-d1-to-postgres.py` source snapshot workflow (PR #54). Preserve email uniqueness, passwords, timestamps, sessions and audit after verification. Cloudflare `AI_CONFIG` KV is **not** part of D1; separately migrate after secrets review. The destination should not become shared with confidential bank data.
5. Implement and test full Vercel-authenticated public API and bank SSO. A valid Cloudflare Access JWT from an unrelated Worker application cannot be assumed available at a Vercel hostname.
6. Test real PostgreSQL schema/queries (not just synthetic SQL), use read/write isolation negative tests, maker-checker-approver, backup/restore, source file hashes, model validation and bank sign-off.
7. Observe successful build, test actual endpoints, stage controlled traffic, freeze writes, reconcile rows, then perform monitored cutover and preserve source D1 for rollback.

## CI and safety

```sh
node scripts/build-dist.mjs
node --test tests/vercel-runtime.test.mjs
node --test tests/*.test.mjs
```

No D1 secrets, database passwords, bank data, dummy institution roles or synthetic regulatory coefficients are embedded in these changes. Do not turn on `GC_ENTERPRISE_ENABLED` or claim production bank operation before the above acceptance gates PASS.
