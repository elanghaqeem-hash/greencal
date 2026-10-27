# Foundation operations, migration and release runbook

## Current operating boundary

No enterprise production database binding, institution account or real bank dataset is configured by this release. Public GreenCal retains the existing `DB`, `AI_CONFIG`, secrets and behavior. Enterprise endpoints return 503 if dedicated configuration is missing. Never bind `ENTERPRISE_DB` to `greencal-db` or silently clone `gc_state` into a bank workspace.

## Provision and staging sequence

1. Obtain bank-approved hosting/processor/security/retention/SSO scope and named data/model/report owners. Initial proposed use case is PT Bank Jabar Banten Syariah; its verified user subjects/emails and institution profile are not invented.
2. Create a new isolated staging D1 database. Review jurisdiction and location against bank policy; an APAC location hint alone does not establish Indonesian data residency or compliance. The account had 10 existing databases at audit time; do not delete or repurpose another project's database to free a slot.
3. Capture empty staging schema/checkpoint. Apply only `migrations/enterprise/0001_foundation.sql` to the dedicated enterprise DB. No production data migration is included. Run schema, foreign-key, trigger, isolation and restore checks on staging.
4. Configure a staging Worker with separate public settings/secrets as appropriate; bind ENTERPRISE_DB to staging only. GC_ENTERPRISE_ENABLED=true must be accompanied by GC_ENTERPRISE_ACCESS_DOMAIN and GC_ENTERPRISE_ACCESS_AUD for a distinct bank/staging Access application. Production wrangler config intentionally does not contain these values/binding or an enabling flag.
5. Access must protect both `/enterprise*` and `/api/enterprise*`, including alternate Worker domains/previews; remove bypass policies and validate user IdP/MFA/session requirements. The Worker still independently verifies JWT signatures and claims, even if someone reaches the origin directly.
6. Capture bank-reviewed subjects from verified IdP identities, not from typed email claims. Feed a private approved JSON document to `node scripts/enterprise-provision.mjs` to generate SQL. Review that SQL and apply it in one D1 batch/transaction on staging. The generator performs no network or DB writes. Store approval record and operator audit in the same batch. No public bootstrap or password/token is generated.
7. Run automated tests, then actual staged role/session/SoD/cross-tenant UAT, including logout and revocation. Only synthetic labelled data is allowed until the bank authorizes real data processing.
8. Import reviewed original PDF metadata into the document register; approve independent source review. `python scripts/ingest-ojk-crms.py SOURCE OUTPUT` hashes whole originals and extracts every PDF page; incomplete/HTML/encrypted inputs fail. It does not assert that OCR, formulas or requirements are validated. Never register a partial download hash as an official full-file hash.

## Verification commands (local)

```bash
node scripts/build-dist.mjs
node --test tests/*.test.mjs
node --check src/worker.js
node --check src/enterprise/api.js
node --check assets/enterprise.js
node tests/enterprise-browser.mjs
```

Use Node 24 for the real SQLite test adapter. CI pins Playwright 1.56.1 and installs Chromium. Browser harness uses valid cryptographic synthetic JWTs with a local JWKS transport, real Worker handlers and real SQLite. It is not bank SSO or remote D1 evidence. It binds only 127.0.0.1, contains synthetic data in memory and cannot be enabled through production environment variables.

## Backup, restore and rollback gate

Before any production migration: capture current Worker version/deployment, public + enterprise config/binding names without secret values, D1 full export/checkpoint in bank-approved private storage, export SHA-256, row counts by tenant/entity/status and approved result fingerprints. Preserve object evidence and encryption-key recovery according to bank policy. Never commit bank data or secret values to this public repository.

Restore exports to a separate database and prove integrity/FKs/counts/frozen result parity, role and isolation tests; record measured RTO/RPO against bank-approved targets. Rehearse the additive migration on that restored copy. If a migration fails, stop, preserve evidence, and leave the current production version serving traffic. Never attempt “rollback” by dropping official records or disabling audit triggers.

Application rollback: switch traffic back to the captured known-good Worker version, preserving the dedicated enterprise DB and its records; the new code is additive. For data errors, create reviewed superseding versions/corrections; any backup restore needs explicit incident/change approval and an isolated validation first. Do not restore over a changing production database based on a stale bookmark.

Current verified baseline for public Worker: version `64fa72a7-3aba-428b-8959-40071b853a35`; deployment `2470e276-04a5-4030-90c6-86bda9c0b3b6`. Re-read current deployment before any actual rollout; this snapshot can become stale.

## Production rollout

Only after all applicable release gates PASS: approve exact commit/artifact hashes, clean CI, staging tests/UAT, backup/recovery and monitoring plan; deploy through the configured Cloudflare mechanism; verify actual version/traffic and HTTP assets; exercise public calculator regressions and the full accepted enterprise workflow with authorized users; record rollback status and handover owners. No automatic main-branch deployment trigger was present at this audit. A PR, merge, successful build or public HTTP 200 does not establish production CRMS readiness.

## Monitoring and restrictions

Monitor failed identities/tenant access, 4xx/5xx, slow requests, D1 errors, audit-write failures, changes to master/membership/approval data, model/job failures, AI quota and recovery checkpoints. Set WAF/user/tenant quotas before enabling broad access. Logging must exclude JWTs, cookies, bank payloads and API keys. Database administrators can alter triggers and are a separate privileged threat: export audit evidence to an approved immutable archive and review operator changes.
