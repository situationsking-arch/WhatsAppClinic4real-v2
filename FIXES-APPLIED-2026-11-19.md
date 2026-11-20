# Fixes applied — 2026-11-19

## What this package contains

This package is based on the latest supplied `whatsapp-receptionist-supabase-auth-setup.zip` and incorporates the coordinated WhatsApp/Gemini fixes from the previously audited working copy. The Supabase Auth setup notes from the latest package are preserved.

## Corrected

- Provider identity now follows `WHATSAPP_PROVIDER_MODE` for webhook event records, tenant integration lookup/provisioning, outbox and voice job paths.
- Meta credentials are resolved from the matching tenant integration; the Meta template sync no longer uses a shared global token/WABA ID for arbitrary tenants.
- Meta template pagination and provider identity persistence are handled, with migrations allowing Meta provider values in template and queue records.
- Meta sender/media credential resolution fails closed when tenant credentials are absent rather than falling back to a global Meta token.
- Gemini message history normalization and bounded retry/backoff for retryable failures are included.
- AI fallback paths include operational logging without logging message bodies or API secrets.
- Meta webhook signature regression tests and Gemini adapter tests are included.
- Locale foundation for English/French/Arabic and RTL shell behavior is included; this is not a complete translation of every screen.

## Environment example aligned to the requested stack

`.env.example` now selects:

- `LLM_PROVIDER="gemini"`
- `WHATSAPP_PROVIDER_MODE="meta"`
- `WHATSAPP_GRAPH_API_VERSION="v26.0"`

`AMBROGIO_AI_AUTOREPLY_ENABLED` intentionally remains `false`. Enable it only after configuring real Meta/Gemini credentials, verifying the webhook, and completing a controlled test. Do not turn on automatic replies for a live customer number before that check.

## Validation performed here

- TypeScript syntax transpilation: 321 `.ts`/`.tsx` files checked, 0 syntax errors.
- `node scripts/check-rls-migration.mjs`: PASS; 22 declared tables have RLS enabled in migration coverage.

## Not verified

- Full TypeScript semantic typecheck, ESLint, Vitest suite, Next.js production build: not run because `node_modules` is incomplete and `vitest`/`tsc` executables are missing.
- Live Meta webhook/send, Gemini API calls, Supabase Auth, deployed migrations, RLS authorization, and concurrent booking: not run. These require configured external credentials and a test environment.
- Provider selection remains a global deployment mode, not mixed per tenant. Before switching an existing production deployment to Meta, reconnect every active tenant and reconcile queued jobs. This package is not a production-ready mixed-provider migration.
