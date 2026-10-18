# GreenCal AI — Activation & security

## Implemented
- Cloudflare Worker server-side API: /api/ai/status, /api/ai/settings and /api/ai/analyze.
- Four providers: Gemini, OpenAI, OpenRouter, Groq; Admin defines ordering, models and enabled flags.
- Sequential failover when a selected provider returns an error, times out or produces an empty response.
- New Admin API keys are encrypted with AES-256-GCM and stored in Cloudflare KV. The encryption secret is a Worker secret.
- Provider keys are never returned from the API and never stored in browser localStorage.
- Access JWT signature, audience and expiry checked by backend, plus Admin/Maker email allowlists.

## Required before Cloud AI can run
1. Set up a Cloudflare Access self-hosted application protecting /api/ai/* (preferably protect the entire GreenCal hostname). Deny public access. Approve real Admin and Maker users via Cloudflare Access policy.
2. Add Cloudflare Worker environment variables:
   - CF_ACCESS_TEAM_DOMAIN = green-heart-e2b0.cloudflareaccess.com
   - CF_ACCESS_AUD = the new Access application's AUD value
   - GREENCAL_ADMIN_EMAILS = exact approved Admin email addresses, comma-separated
   - GREENCAL_MAKER_EMAILS = exact approved Maker email addresses, comma-separated
3. Log in as Admin, visit Analisa AI → Pengaturan AI, enter API keys, choose models and priority. Select enabled models. Admin can also provision AI_KEY_GEMINI, AI_KEY_OPENAI, AI_KEY_OPENROUTER and AI_KEY_GROQ as Cloudflare Worker Secrets.
4. Log in as Maker and run an AI analysis. The result must identify the real provider/model that answered and any previous failed provider names.

## Acceptance checks
- Anonymous request to /api/ai/status returns 401/503 (never configuration or secrets).
- Maker cannot POST /api/ai/settings (403). Admin can change settings.
- API keys must never be exposed in GET responses, HTML, logs or localStorage.
- If provider 1 is unavailable and provider 2 is configured, real model response should be returned from provider 2.
- If all models fail, return ALL_PROVIDERS_FAILED / HTTP 502. Do not claim AI was executed.
- All AI outputs are drafts; data, financial and regulatory claims require human validation.

## Data security limitations
- The existing application retains some operational data in client-side localStorage. Full production banking deployment requires authenticated server-side storage, tenant isolation and audit trails.
- The AI gateway sends only validated aggregate emissions and financed-emissions figures, not client names or account-level records.
- Existing local Tier 1/2 analysis is heuristic and is not evidence of regulatory audit PASS or confirmed OJK compliance.

## Live state as of 2026-10-18
- Worker and KV deployed; AES-GCM secret configured.
- Cloudflare Access app AUD and approved Admin/Maker identities not yet configured.
- No provider API key has been entered. Real cloud AI inference not yet activated.
