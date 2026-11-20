# Tunisia version – quick start (Codespaces)

1. Terminal:  nvm install 22 && nvm use 22 && npm ci
2. cp .env.example .env.local   (then fill in the keys)
3. npm run typecheck && npm test
4. npm run dev

Settings for the Tunisian version (in .env.local):
LLM_PROVIDER="gemini"  STT_PROVIDER="gemini"  BOOKING_ENGINE="agent"
LOCALE_PROFILE="tn"    WHATSAPP_PROVIDER_MODE="meta"
GEMINI_API_KEY / GEMINI_MODEL_PRIMARY / GEMINI_MODEL_FAST
WHATSAPP_API_KEY / WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_BUSINESS_ACCOUNT_ID /
WHATSAPP_APP_SECRET / WHATSAPP_WEBHOOK_VERIFY_TOKEN

Status: code written but NOT yet run against real Supabase/Gemini/Meta.
New files: src/server/ai/booking-agent*.ts, gemini-*.ts, src/lib/gemini/audio.ts,
tests/server/ai/booking-agent*.test.ts, gemini-agent.test.ts


## WhatsApp provider migration

`WHATSAPP_PROVIDER_MODE` is a controlled global migration switch, not a per-tenant selector. Keep it on `360dialog` until every active tenant has been reconnected with the selected provider. For Meta, each tenant must store its own encrypted access token, Phone Number ID and WhatsApp Business Account ID. The application deliberately refuses to fall back to a global Meta token when tenant credentials are missing; old 360dialog rows are not silently treated as Meta integrations. Apply all pending Supabase migrations before switching providers.

Before using the Meta provider, apply every file in `supabase/migrations/` in filename order, including `202611200001_whatsapp_provider_integrity.sql`. Run `scripts/whatsapp-meta-cutover-preflight.sql` in Supabase SQL Editor and confirm it returns no unready active tenants. The provider switch is global, not per tenant. For Tunisia, use `LOCALE_PROFILE="tn"`; this sets new tenant defaults to `Africa/Tunis` and `fr-FR`. Existing tenant records keep their saved country/timezone/locale.
