# PR #31 closure — safe reconciliation into GreenCal CRMS Enterprise

Date: 2026-10-31
Original PR: https://github.com/elanghaqeem-hash/greencal/pull/31
Current production target: GitHub main -> Vercel greencal-crms-enterprise.

## Decision

PR #31 was created on 2026-10-18 and was 120 commits behind main by
2026-10-31. Its proposed anonymous, server-persisted D1 cookie workspace
(migrations/0003_public_scoped_state.sql; src/public-state.js;
GET/PUT /api/public/state) conflicts with the currently deployed design.
**Do not carry the old D1 server-state implementation into Vercel, replace
the current auth-client.js, or expose bank records through public APIs.**
This is a deliberate reconciliation of the obsolete PR, NOT a claim that
its originally proposed server-side per-device persistence was activated.

## Current maintained implementation and tests

| Original PR concern | Maintained implementation | Regression evidence |
| --- | --- | --- |
| Anonymous workspaces | Network HMAC scope from GET /api/client-scope; browser-local scoped storage, fail closed when unverified | tests/p1-api.test.mjs; tests/p1-browser-isolation.mjs; tests/p0-browser-smoke.mjs |
| Server D1 public-state GET/PUT and cookie tokens | **Not ported**; current production does not provide /api/public/state; clients export/import their own backups | docs/ip-scoped-data-and-reset.md; docs/vercel-private-migration-reconciliation-20261031.md |
| Public AI provider access | Explicit opt-in, aggregate-only /api/ai/status and /api/ai/analyze | tests/p1-api.test.mjs; tests/vercel-cloudflare-cutover.test.mjs |
| Old 5/device/day D1 quota | Superseded by 3/network/day + 50/global/day with an isolated public PostgreSQL adapter on Vercel (not enabled without separate DB, provider keys and approvals) | src/public-ai.js; src/vercel/public-ai.js; tests/p1-api.test.mjs; tests/vercel-cloudflare-cutover.test.mjs |
| Navigation, six wizard types and persistence | Current desktop/mobile smoke tests and calculation regression tests | tests/p0-browser-smoke.mjs; tests/p1-browser-isolation.mjs; tests/wizard-interaction.test.mjs; tests/business-travel.test.mjs; tests/pcaf-securities.test.mjs |
| Role and admin isolation | Public cannot use authenticated state, settings or enterprise API | tests/p1-api.test.mjs; tests/auth-ui.test.mjs; tests/rbac.test.mjs; tests/vercel-runtime.test.mjs |

CI reconciliation workflow:
`.github/workflows/pr31-reconciliation.yml`.
Other existing workflows run browser Chromium and more detailed regressions.

## Explicit release and privacy gates

1. No copying legacy D1 users, hashes, session cookies, API keys or bank data.
2. Public network/IP scope is **not** a unique user identity and must not
   be treated as authenticated tenant isolation.
3. Optional public AI requires a *separate* provisioned PostgreSQL quota DB,
   source/usage approval, provider credentials, cost/abuse controls, and
   staging validation before GREENCAL_PUBLIC_AI_ENABLED can be enabled.
4. Current Cloudflare D1 / KV resources remain available for authorized
   rollback. No D1 0003/0004 legacy migration is to be executed as a side
   effect of merging this historical PR.
5. Vercel READY is deployment/build status, not a claim that every OJK
   workbook/model, enterprise identity, bank data connection or regulatory
   sign-off is complete.
6. A future requirement for anonymous *server-side* synchronized workspaces
   needs a separate privacy/security-reviewed design and database; do not
   reintroduce the 2026-10-18 patch silently.

## Merge resolution

The PR branch is reconciled against the current main tree while retaining
its historical Git commits. Only this decision log and the dedicated
regression workflow are added. Existing production APIs, authentication,
storage, database and configuration are left unchanged.
