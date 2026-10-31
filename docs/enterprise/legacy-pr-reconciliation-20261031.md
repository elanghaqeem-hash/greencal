# GreenCal legacy pull request reconciliation — 31 October 2026

Baseline: main `fae4177fc3a590048d4a9bf4889e987edbb9f109`. This review was requested to merge old PRs #3, #12, #31 and #38. Only changes that preserve the current public-no-login, enterprise Access isolation, existing Cloudflare deployment and banking model controls are acceptable. This document records **not merging unsafe or superseded PRs**. It does not claim that historical PR branches were successfully merged.

| PR | Status at inspection | Findings | Disposition |
| --- | --- | --- | --- |
| [#3](https://github.com/elanghaqeem-hash/greencal/pull/3) | Draft, `mergeable_state=dirty`, no head checks | Legacy `worker/index.js`, `schema.sql`, login/admin pages and full-site authentication conflict with current `src/worker.js`, no-login public calculator and Access-only CRMS bank | **Superseded; close without merging**, leave public pages and D1 untouched |
| [#12](https://github.com/elanghaqeem-hash/greencal/pull/12) | `mergeable_state=dirty`, no head checks | Adds password-backed Admin/Maker login and modifies main Worker, AI, storage and `wrangler.jsonc`; current code has more recent enterprise identity, RBAC and privacy gates; legacy public login contradicts current requirements | **Superseded; close without merging**, preserve existing enterprise security |
| [#31](https://github.com/elanghaqeem-hash/greencal/pull/31) | Draft, historical head CI passed, mergeable clean on stale base | Replaces IP-scoped public storage with per-browser HMAC cookie and D1 state, changes AI quota/endpoint semantics and adds 2 new migrations. This is a **behavioral/product/privacy decision**, not a clean minor fix. Branch says staging, privacy and real integration gates missing. Public state currently intentionally remains isolated according to the deployed design. | **Blocked, leave open as draft** until staging data migration, consent/privacy, public AI budget/rate limits and real E2E are accepted |
| [#38](https://github.com/elanghaqeem-hash/greencal/pull/38) | Historical head CI passed; direct API merge rejected with HTTP 405 conflict | Most safe fixes **already exist in current main**: zero outstanding excluded from financed-emission coverage, invalid numeric input rejected before save, and regression tests. Last addition disallows **negative debtor profit**, which is not a universally valid banking data-quality rule (loss-making borrowers exist and matter to climate/credit risk). | **Superseded; close without merging**; preserve current safer behavior and add negative-profit regression vector |

## Evidence from current main

- `index.html`: `expCalc` already enforces positive outstanding (including ownership method); save-finance checks visible invalid numerics, `os>0`, and denominator and percentage ranges.
- `tests/p2-calculations.test.mjs`: zero-outstanding and malformed-input regression cases already present; this change adds protection for negative legitimate profit values while rejecting malformed values.
- `src/worker.js`: server-side enterprise API remains guarded by `GC_ENTERPRISE_ENABLED` and separate `ENTERPRISE_DB` checks. `wrangler.jsonc` preserves public D1, KV, and public Worker asset routing.
- PR #31's staging and privacy gates must not be skipped. A green CI on an obsolete branch does not show safety when rebased onto present main.

## Release handling

1. The compatible regression test is committed on the consolidated cleanup branch and must pass the full main-compatible CI: `node --test tests/*.test.mjs`, security/RBAC and browser smoke.
2. Merge this consolidated PR only after green CI, with **no change** to public runtime/Worker/Cloudflare configuration or bank D1.
3. Close the superseded historical PRs with links to this audit; **do not claim they merged**. Keep PR #31 as draft with a documented future release gate.
4. No Cloudflare deployment or enterprise feature activation is necessary for test/documentation-only changes. Existing bank operational release gate remains closed.

Outcome: preserve modern controls, avoid conflicts and lost data, and account transparently for all four old PRs.
