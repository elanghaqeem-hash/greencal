# GreenCal: Cloudflare D1 → Vercel Marketplace PostgreSQL (controlled migration)

Status: **migration preparation and synthetic verification only**. No production cutover or bank data migration is claimed. Source of truth remains the live Cloudflare D1 database until the destination and all application APIs pass UAT.

## Verified source inventory (31 October 2026)

- Cloudflare D1 `greencal-db` (UUID `f9169067-32bc-425c-bef8-1cb86a4d5fcd`): ~96 KiB.
- Public D1 data: `gc_users=2`; `gc_sessions=0`, `gc_state=0`, `gc_events=0`, `gc_login_limits=0`, `gc_public_ai_quota=0`, `ai_settings=0`, `sessions=0`, `users=0` at inventory time. The source can change; take a fresh export at cutover.
- Internal `_cf_KV` is Cloudflare-managed and **excluded**.
- CRMS Enterprise `ENTERPRISE_DB` **does not exist** in production. There are no institutional portfolios, Discovery assessments, approved Buku 6 reports or bank membership data to migrate. Do not invent institution records.
- Cloudflare `AI_CONFIG` KV is external to D1 and **not transferred** by the D1 migration.
- Vercel team `serayamg` has a Prisma Postgres marketplace installation but **no GreenCal-specific Postgres database confirmed**. Prisma/Marketplace databases are not Cloudflare D1 bindings.

## Architecture decision

**Vercel is a hosting and database marketplace, not a D1-compatible SQLite engine.** A PostgreSQL resource accessed via Vercel (e.g., Prisma Postgres) requires adapting GreenCal server-side SQL and HTTP handling. Merely uploading the dump, changing `wrangler.jsonc` or setting a `DATABASE_URL` will **not** make the Cloudflare Worker use PostgreSQL.

Choose and review one migration architecture before cutover:

1. **Recommended for complete Vercel migration:** Vercel Functions / Node server API with PostgreSQL, while preserving the public calculator assets. Implement PostgreSQL transactions, equivalent SQLite trigger/lock behavior, Cloudflare Access replacement using verified OIDC, Cloudflare-origin IP pseudonym/quota replacement, and encrypted AI_CONFIG transfer.
2. **Hybrid alternative:** keep GreenCal assets/Worker on Cloudflare, access a tightly authenticated HTTPS API hosted on Vercel with the database. Never embed database credentials in browser JavaScript or expose publicly callable admin API endpoints.

CRMS Enterprise needs a separate institutional Postgres database/schema, bank-approved data residency/processor contract, RBAC and tenant isolation, version/audit triggers, protected SSO, and independent model validations. Existing D1 enterprise migration files are **SQLite dialect** and cannot be executed against PostgreSQL as-is.

## Export and copy (public D1 only)

1. Obtain the verified database owner, hosting/processing approval and target region; **APAC does not establish Indonesia-only residency**.
2. Provision an isolated, **empty** PostgreSQL database for GreenCal in the appropriate Vercel team and connect only the intended project. Do not reuse the existing CollMan/TotalARC/BG database.
3. Export a complete, consistent snapshot from Cloudflare D1. Store the dump in a restricted, encrypted location **outside GitHub**, with SHA-256 and controlled retention. Never attach SQL dumps, account hashes or credentials to CI logs or PRs.
4. Validate and inventory without PostgreSQL credentials:

   ```bash
   python3 scripts/migrate-d1-to-postgres.py /secure/greencal-d1-export.sql
   ```

5. On an approved trusted execution host, install `psycopg[binary]` and set `GREENCAL_POSTGRES_URL` using secret environment management (TLS required). Execute:

   ```bash
   python3 scripts/migrate-d1-to-postgres.py /secure/greencal-d1-export.sql --apply
   ```

   The migration refuses existing PostgreSQL tables, copies nine whitelisted public tables transactionally, checks row counts plus order-independent SHA-256 of every row, and commits a migration receipt **only when parity passes**. It intentionally does not print row contents or passwords.

6. Repeat the transfer from a **fresh final snapshot** after a tightly controlled write freeze. A copied snapshot without a write-freeze/change-data-capture guarantee is not a lossless production migration.
7. Build and independently test a Vercel-compatible backend against that target. Verify sign-in, role segregation, password rotation, public AI quota, AI key encryption, JSON state revision conflicts, session expiry, audit trail, and IP pseudonym handling. Preserve Cloudflare Access protections until identity replacement is proved. Test revocation, mobile UI, 5xx handling, and security negative cases.
8. Validate PostgreSQL backup/restore and failed-cutover rollback, obtain business/security sign-offs, then perform a controlled traffic switch. **Do not delete D1** until retention and rollback windows close.

## Release gates

- [ ] Vercel team/project and a new isolated PostgreSQL database confirmed.
- [ ] Bank-approved processing location, retention, and Vercel/Postgres DPA.
- [ ] Fresh encrypted D1 export, checksum and source freeze.
- [ ] Dry-run, target transaction and SHA-256 parity PASS.
- [ ] All Cloudflare KV/secret-dependent capabilities explicitly reconciled; no secrets committed.
- [ ] Vercel API runtime and secure identity migration implemented and tested.
- [ ] Enterprise PostgreSQL schema and tenant/approval workflows ported separately before institutional go-live.
- [ ] Recovery point/time verified by real restore; 401/403 SoD/tenant tests PASS; authorized UAT.
- [ ] Cutover decision and monitoring/rollback owners approved.

**Current state:** Only the **copy utility and synthetic local tests** are prepared. No PostgreSQL resource creation, data transfer to Vercel, production app modification, or Cloudflare D1 deletion has been performed.
