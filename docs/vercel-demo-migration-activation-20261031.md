# GreenCal — controlled dummy migration to Vercel PostgreSQL

User confirmed on 31 October 2026 that GreenCal currently uses **dummy data, not real bank data**, and permits the connected US-region Prisma PostgreSQL for this simulation.

The operational one-time migration is run ONLY by a branch-scoped Vercel Preview build with `GC_DEMO_MIGRATION_APPLY=apply-demo-only-20261031`, `GC_DEMO_APPROVED_TARGET=greencal-crms-enterprise`, and `GC_DEMO_TARGET_DATABASE=postgres`. The build aborts if the target is wrong, in recovery, has existing public tables or already contains the `greencal_demo` schema. A single transaction creates and populates `greencal_demo` without modifying `public`.

Synthetic seeded content: two fictitious institutions, ten `.invalid` user-role memberships, one synthetic risk draft, one unpublished internal Book 6 draft. Immutable histories and triggers must be verified. Source inventory receipt merely records Cloudflare D1 source table counts, not a copy of the two old password-based accounts. **No passwords, real emails, provider secrets, real bank data, or official workbook parity are imported.**

After successful Vercel Preview deployment: immediately set the one-time migration environment variable to `disabled` and verify the default production build performs no migration. Keep `GC_ENTERPRISE_ENABLED=false` and `GREENCAL_PUBLIC_AI_ENABLED=false` until protected identity, source controls, data quality and regulatory approval are in place. Keep Cloudflare untouched for rollback.

## Execution evidence (verified on Vercel Preview)

- User authorized use of US-region PostgreSQL because the GreenCal project dataset is **dummy/synthetic only**.
- Transactional migration succeeded: Vercel Preview `dpl_7PKuu7eoSYenWuGrXrL9YRKJnn8b`, branch `feat/vercel-dummy-database-apply-20261031`.
- Logs: `GREENCAL_DEMO_MIGRATION_RESULT` → `applied=true`; `greencal_demo` schema, **21 enterprise tables**, 2 demo institutions, 10 synthetic memberships, 1 synthetic risk draft, 1 unpublished internal Buku 6 draft, 2 audit events. Source receipts only; no old password hashes or real bank data.
- Separate read-only Preview deployment `dpl_J5dkePhWzUwPoStgbVepkTwEkz5p` confirmed `demoVerified=true`, `missingTables=[]`, `missingGuards=[]`, `publicTableCount=0`, `inventoryReceiptPresent=true`, and `bankProductionReady=false`.
- One-time `GC_DEMO_MIGRATION_APPLY` was changed to `disabled` and `GC_DEMO_VERIFY_READONLY` to `false` after proof. Neither switch is configured for Production.
- All seven CI workflows on commit `4602b908dd7e8b3e4305d6e731ee84ef5361652b` succeeded.

**Remain blocked:** Bank operational SSO and two legacy account re-enrollments; Cloudflare API-key values cannot be read/exported and must be rotated/reentered into Vercel; public AI remains off, enterprise bank access remains off; no official Buku 6 workbook parity or model sign-off. Dummy data exist in a separate schema on the connected Prisma resource and are not automatically accessible to unverified users.
