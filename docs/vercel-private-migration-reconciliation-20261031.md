# GreenCal private configuration and data reconciliation — 31 October 2026

Status: **partial operational cutover; no bank/customer data copy, no provider secret export, no regulatory approval**.

## 1. Live source record-level inventory (read-only Cloudflare D1)

Cloudflare Worker: `greencal`; public D1 `greencal-db` database ID `f9169067-32bc-425c-bef8-1cb86a4d5fcd`.

| Table | Rows |
| --- | ---: |
| gc_state | 0 |
| gc_users | 2 |
| gc_sessions | 0 |
| gc_login_limits | 0 |
| gc_events | 0 |
| gc_public_ai_quota | 0 |
| ai_settings | 0 |
| users | 0 |
| sessions | 0 |

`gc_users` contains **1 admin and 1 maker**. Encrypted/salted password hashes are not a portable login or a verified bank IdP. Do not copy them. Confirm identities directly with their owners and re-enroll via verified bank OIDC once an approved tenant exists.

Cloudflare KV `AI_CONFIG`: **0 keys**. There was no persisted AI-chain configuration to export. Runtime defaults are in `src/ai-worker.js`.

Cloudflare Worker source secret **names** include `AI_KEY_GEMINI`, `AI_KEY_OPENAI`, `AI_KEY_OPENROUTER`, `AI_KEY_GROQ`, `GREENCAL_AI_ENCRYPTION_KEY`, `IP_SCOPE_SECRET`, `CF_ACCESS_AUD`, `CF_ACCESS_TEAM_DOMAIN` and historic admin/maker allowlists. Their *plaintext* values cannot be retrieved through Cloudflare secrets inventory and must not be guessed, reconstructed or committed. Re-provision and rotate required credentials directly in Vercel.

## 2. Live Vercel destination resource verification

Vercel team `collman` (Serayamg); project `greencal-crms-enterprise` `prj_e5FsKGSQ8EKYCusZJuR7DMm4ml8l`.

`DATABASE_URL_POOLED`, `DATABASE_URL`, `PRISMA_DATABASE_URL`, `POSTGRES_URL` are sensitive Vercel integration-store references. Each resolves to **the same Vercel store** `store_P5wWpDcSxnp8Z6V1`, product Prisma Postgres, name `prisma-postgres-champagne-notebook`, connected to exactly one project (GreenCal), targets Preview/Production, state `ready`, region `iad1` (United States).

The Vercel plugin does not expose the contents of these credentials through regular metadata reads. **Do not insert connection strings into GitHub or copy them into chat.**

### Actual PostgreSQL connection/probe proof

A one-time Preview-only Vercel build with `GC_MIGRATION_READONLY_PROBE=true` used the real integration-provided connection without exposing its value. The log reported:

```json
{
  "connected": true,
  "readOnly": true,
  "bankProductionReady": false,
  "hasNamedDatabase": false,
  "schemaIsPublic": true,
  "isRecovery": false,
  "bankTableCount": 0,
  "publicQuotaTablePresent": false,
  "otherTableCount": 0,
  "dbNameRedacted": true,
  "readyForWrite": false
}
```

Vercel Preview deployment: `dpl_A9q2H8UnDjt9vW4oNRCVwhx94RGh` on PR #64 head `b51b4af51230436751b55fbbffd36a57214e03a6`. Diagnostic flag was subsequently set to **false** in Vercel Preview, and production never ran it.

Interpretation: connection works, but database remains empty, and the configured database has a default/system name blocked by the bank-safe name gate. **No enterprise schema has been migrated or bank data imported.** Geographic and institutional owner approvals are also absent.

## 3. Configuration that was actually migrated into Vercel

- `GREENCAL_AI_ORDER_JSON`: created in encrypted Vercel environment for Production and Preview using the exact **code default** for providers: Gemini `gemini-2.5-flash` and OpenAI `gpt-4.1-mini` enabled; OpenRouter and Groq disabled. There were no KV overrides.
- `GC_ENTERPRISE_ENABLED=false` and `GREENCAL_PUBLIC_AI_ENABLED=false` explicitly configured for Production and Preview.
- `GC_ENTERPRISE_BOOK6_ENABLED`, `GC_ENTERPRISE_BOOK7_ENABLED`, `GC_ENTERPRISE_QUANT_ENABLED`, `GC_ENTERPRISE_ADVANCED_ENABLED`, `GC_ENTERPRISE_SOURCE_REVIEW_ENABLED`, `GC_ENTERPRISE_RELEASE_ENABLED` are explicitly `false`.
- `IP_SCOPE_SECRET` already exists in Vercel as a separate Vercel-owned HMAC value. It is *not* copied from Cloudflare; network scope and browser origin therefore differ.

**NOT migrated:** Cloudflare provider API key values, AI encryption secret, original Access SSO, bank user identities/roles, real CBS/GL/CKPN feeds, original OJK Buku 6 protected XLSX mapping, backup/restore evidence or independent regulatory/model approvals. Flags remain off by design.

## 4. User-owned local data: explicit import, never server transfer

The public GreenCal stores activities, financed exposures, offsets and draft narratives in *browser localStorage*, keyed by network-scoped HMAC and origin. Vercel cannot read storage belonging to the original Cloudflare domain, even from the same browser. Cloudflare D1 inventory therefore cannot establish whether users have saved local drafts.

Implementation PR #64 adds **Impor Cadangan dari Cloudflare** in public storage panel. Flow:
1. On the **original Cloudflare GreenCal website, same device/browser**, open Penyimpanan & Cadangan Data and select **Unduh Cadangan (JSON)**.
2. On the new **Vercel website** and with verified network scope, open the same panel and select **Impor Cadangan dari Cloudflare**.
3. Confirm replacement if the destination local working copy already contains records. Only public fields (`entries`, `exposures`, `offsets`, `narrativeDrafts`) are accepted, after structural and size validation; settings, audit, passwords, role and AI keys are not imported.
4. Reload displays the restored local working copy. It remains on that browser origin, **not** in PostgreSQL.
5. Confirm record counts and calculations manually against backup, retain JSON encrypted in owner-controlled storage, then remove it as required by bank policy.

**No automatic cross-origin browsing, hidden export, upload to server, or institution data access.** Keep personally identifiable borrower/bank information out of public browser mode.

## 5. Remaining authority-controlled cutover gates

1. **Bank approval** for deployment region/jurisdiction and provisioning dedicated, individually named PostgreSQL institution DB (not default `postgres` and not the public AI quota store).
2. Reviewed schema application to the correct, empty DB and verification of 21 tables, immutable audit triggers, tenant isolation, backup/restore and SoD controls.
3. If public AI service desired: a **second dedicated public database** with `gc_public_ai_quota`, rate-limit test, cost and key approvals.
4. Provider secret **rotation / re-provisioning** in Vercel, bank OIDC + PKCE login onboarding, and verification of two legacy account owners.
5. CBS/GL/CKPN, NGFS and geospatial source approvals, original protected official Buku 6 XLSX cell parity, independent model validation and bank sign-offs.
6. Approved traffic cutover and staged retirement of Cloudflare after backup and recovery proof. Do **not** delete any Cloudflare resource before sign-off.

Issue #63 tracks operational cutover; #49 tracks banking/OJK production release.

## 6. Evidence classification

- `source counts = 0` and `KV keys = 0` prove *no backend public application state or configuration KV content to transfer*, not absence of all user-generated local data.
- `PostgreSQL connected=true` proves read-only network/credential connectivity, not DB/schema readiness.
- `Vercel deployment READY` proves package build/deployment only.
- Public browser import is a user action and cannot be claimed as completed for anyone until that user imports their JSON.
- No real bank data migration, plaintext secret transfer, or regulatory production activation is claimed.
