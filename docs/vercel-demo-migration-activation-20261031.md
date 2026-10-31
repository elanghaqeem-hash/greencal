# GreenCal — controlled dummy migration to Vercel PostgreSQL

User confirmed on 31 October 2026 that GreenCal currently uses **dummy data, not real bank data**, and permits the connected US-region Prisma PostgreSQL for this simulation.

The operational one-time migration is run ONLY by a branch-scoped Vercel Preview build with `GC_DEMO_MIGRATION_APPLY=apply-demo-only-20261031`, `GC_DEMO_APPROVED_TARGET=greencal-crms-enterprise`, and `GC_DEMO_TARGET_DATABASE=postgres`. The build aborts if the target is wrong, in recovery, has existing public tables or already contains the `greencal_demo` schema. A single transaction creates and populates `greencal_demo` without modifying `public`.

Synthetic seeded content: two fictitious institutions, ten `.invalid` user-role memberships, one synthetic risk draft, one unpublished internal Book 6 draft. Immutable histories and triggers must be verified. Source inventory receipt merely records Cloudflare D1 source table counts, not a copy of the two old password-based accounts. **No passwords, real emails, provider secrets, real bank data, or official workbook parity are imported.**

After successful Vercel Preview deployment: immediately set the one-time migration environment variable to `disabled` and verify the default production build performs no migration. Keep `GC_ENTERPRISE_ENABLED=false` and `GREENCAL_PUBLIC_AI_ENABLED=false` until protected identity, source controls, data quality and regulatory approval are in place. Keep Cloudflare untouched for rollback.
