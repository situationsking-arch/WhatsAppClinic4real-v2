# Technical audit report — WhatsApp AI Receptionist
**Audit date:** 2026-11-19  
**Repository:** `whatsapp-receptionist-tunisia` from the supplied ZIP  
**Scope:** Static source/configuration review, focused inspection of Gemini, WhatsApp Cloud API, webhook security, booking, localization, tests and Supabase migrations.

## Executive result

**The project is not ready to be described as a stable Meta Cloud API + multilingual production release.** The supplied repository contains substantial work and a useful test suite, but several requirements in the master task are still incomplete or contradicted by the implementation.

I did **not** reapply the patch or rewrite the project. I did not make speculative production-code changes: the most serious WhatsApp issues cross provisioning, integration records, webhook tenant resolution and template storage, so changing one file in isolation could route messages or templates across tenants. A safe fix requires coordinated schema/API/UI work and integration tests.

## 1. Confirmed findings

### Critical / high

1. **Meta template synchronization is not tenant-aware.**
   - `src/server/whatsapp/template-sync.ts` — `MetaWhatsAppTemplateClient.listTemplates()` reads `env.WHATSAPP_API_KEY` and `env.WHATSAPP_BUSINESS_ACCOUNT_ID` globally.
   - `WhatsAppTemplateSyncService.syncTenantTemplates()` accepts a `tenantId` only after the global client has fetched the templates; it cannot prove the fetched templates belong to that tenant.
   - `SupabaseWhatsAppTemplateSyncRepository.upsertTemplates()` hardcodes `provider: 'whatsapp_360dialog'`, including when the Meta client was selected.
   - Meta pagination (`paging.next`) is not followed.
   - **Impact:** a shared Meta WABA/token can cause one tenant's templates to be saved under another tenant; Meta templates are also mislabeled in storage.

2. **Provider selection is global, not per tenant.**
   - `src/lib/env.ts` defines one global `WHATSAPP_PROVIDER_MODE`.
   - `src/server/whatsapp/client.ts`, `src/server/whatsapp/media.ts`, `src/app/api/webhook/whatsapp/route.ts` and `src/server/whatsapp/template-sync.ts` branch on that global setting.
   - `src/server/whatsapp/webhook-events.ts` defines the provider as the constant `whatsapp_360dialog`.
   - Provisioning in `src/server/whatsapp/provisioning.ts` writes and reads integration rows using that same provider constant.
   - **Impact:** the code cannot safely run a mixed fleet where some tenants use Meta and others still use 360dialog. A global switch can change transport behavior for every tenant at once.

3. **Appointment creation uses a check-then-insert flow, but the database already has an atomic overlap guard.**
   - `src/server/appointments/booking.ts` checks availability in `getAvailableSlots()` and then separately calls `repository.insertAppointment()`.
   - Contrary to the initial audit note, `supabase/migrations/202604240001_initial_backend_mvp.sql` creates `btree_gist` and defines `appointments_no_confirmed_overlap`, an exclusion constraint over tenant and overlapping `tstzrange` values for `confirmed` appointments.
   - `insertAppointment()` maps PostgreSQL exclusion/unique violations (`23P01`/`23505`) to a booking conflict.
   - A dedicated concurrent booking test is still absent, so the database guard is statically verified but not yet integration-tested under concurrent transactions.
   - **Impact:** the inspected schema has an atomic protection against overlapping confirmed appointments for a tenant; do not add a duplicate constraint. Validate this constraint against the deployed database and add a real concurrency test before claiming runtime verification.

### Medium

4. **Gemini conversation history was not normalized in the general LLM adapter (partially fixed in this work session).**
   - `src/server/ai/gemini-adapter.ts` maps each input message directly to a Gemini `contents` item. It does not merge consecutive messages with the same role.
   - `src/server/ai/gemini-agent.ts` has a separate `toContents()` normalizer, but that does not protect the normal LLM adapter path.
   - **Fix applied:** `normalizeGeminiContents()` now merges consecutive messages with the same role and drops empty fragments; focused unit tests were added. Execution remains blocked until dependencies install successfully.

5. **Missing FAST model silently disables LLM intent classification.**
   - `src/server/ai/llm-factory.ts` returns `null` when a model is absent.
   - `src/server/ai/reply-orchestrator.ts` silently selects `RuleBasedIntentClassifier` when the FAST client is null.
   - The requested explicit, logged fallback strategy and startup validation are not implemented in these paths.

6. **The webhook signature implementation had no direct signature tests (tests added in this work session).**
   - `src/lib/whatsapp/webhook-security.ts` does compute HMAC-SHA256 over the raw body and uses `timingSafeEqual`.
   - `src/app/api/webhook/whatsapp/route.ts` reads the raw body and verifies the Meta signature before JSON parsing, which is the correct order.
   - **Fix applied:** `tests/lib/webhook-security.test.ts` now covers valid, invalid, missing and modified-body signatures using a deterministic test App Secret. Execution remains blocked until dependencies install successfully.

7. **Localization/RTL architecture is absent.**
   - No `i18n`, locale-message, translation-key or RTL implementation files were found under `src`.
   - User-facing pages/components contain Italian strings (for example dashboard, billing, calendar, authentication, onboarding and marketing).
   - There is no persistent language selector or centralized typed translation dictionary.
   - There is no Arabic RTL layout implementation or localization/RTL test suite.
   - **Impact:** Arabic, French and English interface support is not implemented to the stated requirements; changing `<html lang>` alone would not solve this.

8. **Fallback errors in the reply orchestrator are swallowed without operational logging.**
   - `src/server/ai/reply-orchestrator.ts` catches domain reply and context failures and silently returns rule-based content / empty context.
   - The fallback metadata records some reasons, but the catch blocks do not log the original failure.
   - **Impact:** production failures can be difficult to diagnose and the requested logged fallback behavior is incomplete.

### Positive findings observed

- `src/lib/whatsapp/webhook-security.ts` verifies Meta HMAC over the raw request body and uses constant-time comparison after checking equal byte lengths.
- `src/app/api/webhook/whatsapp/route.ts` performs signature validation before JSON parsing in Meta mode.
- WhatsApp credentials are encrypted through the existing credential-encryption helper during provisioning; the status response exposes only whether a key exists, not the key.
- Tenant credential resolution exists in `src/server/whatsapp/client.ts`, with a short-lived cache and invalidation hook.
- Voice pipeline call site passes `job.tenantId` to `downloadMedia()`, avoiding the documented global-key fallback for that path.
- Booking agent requires explicit confirmation in its tool logic and returns a human-handoff fallback on agent exceptions.
- `npm run db:lint` passed: **22 tables declared, all with RLS enabled**. This is migration lint coverage, not proof that every API query is correctly tenant-authorized.

## 2. Fixes applied after the initial audit

- `src/server/ai/gemini-adapter.ts`: adjacent Gemini message roles are normalized into one role turn; empty fragments are ignored.
- `tests/server/ai/gemini-adapter.test.ts`: added focused normalization tests for same-role merging, role ordering, and empty history.
- `tests/lib/webhook-security.test.ts`: added valid/invalid/missing/tampered raw-body signature cases.
- Appointment audit correction: the initial report incorrectly stated that no overlap constraint existed. The original migration does contain the `appointments_no_confirmed_overlap` exclusion constraint and repository conflict mapping. A concurrent integration test remains outstanding.

## 3. Test inventory and execution

- Test files present: **85**.
- Focused tests exist for Gemini agent function-calling, booking, WhatsApp sending, media, provisioning, template sync, webhook processing and voice pipeline.
- No locale/RTL test files were found.
- No dedicated Meta signature tests were found.
- No explicit appointment concurrency/race test was found.

### Commands attempted

| Command | Result |
|---|---|
| `npm ci --ignore-scripts` | Installation did not complete within the execution environment's 60-second interruption window; `node_modules` was left incomplete. |
| `npm run typecheck` | **Blocked**: TypeScript reported missing type definitions (`chai`, `deep-eql`, `estree`, `json-schema`, `json5`, `node`, `react`, `react-dom`, `ws`) due to incomplete dependencies. |
| `npm run test -- --reporter=dot` | **Blocked**: `vitest: Permission denied` in the incomplete `node_modules`. |
| `npm run lint` | **Blocked**: `eslint: Permission denied` in the incomplete `node_modules`. |
| `npm run db:lint` | **Passed**: `RLS migration coverage OK: 22 tables declared, all with RLS enabled.` |
| `npm run build` | Not run; dependencies were incomplete. |
| E2E tests | Not run; dependencies/browser setup were not validated. |

No test is represented as passing unless the command actually completed successfully.

## 4. Required coordinated fixes (still outstanding)

1. **Tenant-aware Meta credentials:** add WABA ID to the tenant integration model/provisioning flow, store it with the tenant's encrypted access token (or in a clearly defined tenant config field), resolve both from the same tenant, and make template sync accept a tenant-scoped client. Add pagination and persist the correct provider identifier.
2. **Provider migration:** model provider per integration/tenant, preserve legacy `whatsapp_360dialog` rows, resolve webhook ownership by phone number ID and provider, and reject unknown/mismatched provider states rather than silently switching globally.
3. **Webhook routing/security:** verify Meta signatures with the Meta app secret, then resolve the phone-number ID to the owning tenant and process events using that tenant's provider context. Add rate-limit, idempotency and signature tests.
4. **Booking concurrency:** enforce non-overlap atomically in PostgreSQL (for example, an exclusion constraint over a `tstzrange` for active appointments, with the appropriate extension and careful handling of cancelled rows), or implement a transaction/locking strategy. Add a two-request concurrency test.
5. **Gemini reliability:** normalize adjacent roles in `gemini-adapter.ts`, validate required model config at startup, add explicit retry/backoff for retryable status codes with bounded attempts, log fallback reasons without logging secrets, and test usage metadata and Arabic/French/Darja prompt paths.
6. **Localization:** add typed translation dictionaries for `fr`, `en`, `ar`, make French the new-user default, persist the selected locale, apply `dir=rtl` and logical CSS/layout rules for Arabic, and migrate all user-facing strings including marketing/legal/auth/dashboard/notifications.
7. **Security regression tests:** test tenant isolation for conversations, patients, appointments, templates, usage and credentials; test valid/invalid/missing/altered Meta signatures; test template pagination and cross-tenant isolation.

## 4. External configuration required before live integration testing

- Meta Developer App with WhatsApp product, App Secret, webhook callback URL and verify token.
- Per-tenant Meta access token, Phone Number ID and WhatsApp Business Account ID with the required permissions.
- Gemini API key and explicit primary/fast model names.
- Supabase URL, service-role key, database migrations and encryption key.
- A test clinic/phone number and approved WhatsApp templates.
- A controlled test patient number for inbound/outbound, media, template and booking integration tests.

## 5. Final status

- **Fixed and tested:** no production-code fixes were made in this audit; only the database migration lint command passed.
- **Fixed but not tested:** none.
- **Not fixed:** tenant-aware Meta template sync/pagination/provider identity; per-tenant provider migration; booking race; Gemini history normalization and startup/fallback logging; complete multilingual UI/RTL; missing focused security/concurrency/localization tests.
- **Requires external credentials/manual configuration:** real Meta and Gemini integration tests, live webhook round-trip, audio media round-trip, and end-to-end booking against a configured clinic calendar.

**Conclusion:** do not deploy this ZIP as a completed Meta Cloud API + Arabic/French/English release. The highest-priority blockers are tenant-safe provider/credential resolution, booking concurrency protection, and the missing localization architecture.


## 6. Current upstream API documentation note (checked 2026-11-19)

- Google’s current Gemini documentation says the Interactions API became the default interface in June 2026 and describes `generateContent` as legacy, while still supported. The repository uses `generateContent` in `gemini-adapter.ts`, `gemini-agent.ts` and `lib/gemini/audio.ts`. This is not by itself proof that those requests are broken, but it is a migration/maintenance risk and should be included in the Gemini integration plan. See https://ai.google.dev/gemini-api/docs.
- Meta's Graph API reference for `/{WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates` documents a `data` array and a `paging` object, reinforcing that the current single-page template fetch is incomplete for accounts whose templates span multiple pages. See https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account/message_templates/.
- Supabase's current RLS guide explicitly says RLS enablement alone is not enough: grants and policies both matter, and it recommends policy tests. Therefore the successful local `db:lint` result should be treated as migration coverage only, not a full proof of tenant authorization. See https://supabase.com/docs/guides/database/postgres/row-level-security.
- PostgreSQL documents exclusion constraints as a mechanism for cross-row restrictions, supporting the recommendation to enforce appointment overlap atomically at database level rather than relying only on an application-side availability check. See https://www.postgresql.org/docs/current/ddl-constraints.html.

## 5. Implementation progress — 2026-11-19

### Fixed in source (runtime tests not yet executed)

1. **Gemini history normalization**
   - `src/server/ai/gemini-adapter.ts` now merges adjacent messages from the same role into one Gemini content turn and ignores empty fragments.
   - `tests/server/ai/gemini-adapter.test.ts` covers same-role merging, role transitions, and empty inputs.

2. **Meta webhook signature regression coverage**
   - `tests/lib/webhook-security.test.ts` now covers valid signatures, invalid signatures, missing signatures, and body tampering using a fixed test-only App Secret.
   - The production signature implementation was not changed because it already verifies the raw body with HMAC-SHA256 and timing-safe comparison.

3. **Safer Meta template client boundary**
   - `MetaWhatsAppTemplateClient` now requires an explicit access token and WABA ID in its constructor; it no longer reads global Meta credentials itself.
   - Template retrieval now follows Graph cursor pagination, with a 50-page safety ceiling.
   - Template repository writes use the provider supplied by the client rather than hardcoding 360dialog.
   - Added `202611190001_whatsapp_template_provider_meta.sql` to permit Meta-owned template records in the template table.
   - The scheduled route's current factory **fails closed** when global `WHATSAPP_PROVIDER_MODE=meta` is selected. This is intentional: tenant-scoped Meta integration provisioning and credential resolution are not yet implemented, and global Meta credentials must not be copied into arbitrary tenant records.
   - `tests/server/whatsapp/template-sync.test.ts` covers tenant credential use, cursor pagination, required credentials, and persisted provider identity.

### Corrections to initial audit

- The initial audit incorrectly reported that appointment overlap was not protected at the database layer. The initial migration does define `appointments_no_confirmed_overlap` using a GiST exclusion constraint and `btree_gist`; the repository maps `23P01`/`23505` to a conflict. A true concurrent database test is still missing. Do not add a duplicate exclusion constraint.

### Validation performed after edits

- `node scripts/check-rls-migration.mjs`: **PASS** — 22 declared tables have RLS enabled in the migration coverage check. This is static migration coverage, not a live Supabase authorization test.
- TypeScript syntax transpilation via the globally installed TypeScript compiler API: **PASS** for all five changed TypeScript source/test files.
- `npm ci --ignore-scripts --no-audit --no-fund`: **BLOCKED** — timed out twice in the execution environment; `node_modules` remains incomplete.
- `tsc --noEmit`: **BLOCKED** — missing type definitions for `chai`, `deep-eql`, `estree`, `json-schema`, `json5`, `node`, `react`, `react-dom`, and `ws` due to incomplete dependencies.
- Vitest, ESLint, production build, E2E tests, and live Meta/Gemini integration tests: **NOT RUN** because dependency installation did not complete and external credentials are unavailable.

### Still not fixed

- End-to-end tenant-specific Meta integration provisioning (encrypted token + WABA ID + provider-specific integration records).
- Per-tenant provider selection across send, receive, media, provisioning, webhook routing and outbox paths. The current Meta template-sync factory is deliberately disabled rather than using global credentials.
- Tenant ownership resolution for Meta webhook phone-number IDs.
- Gemini retry/backoff policy and startup model validation.
- Full typed `ar`/`fr`/`en` dashboard localization and RTL implementation.
- Real concurrent booking integration test against PostgreSQL/Supabase.
- Complete automated tests for all requirements in the master task.

## 7. Implementation update — 2026-11-19 (continued)

### Changes made in the working copy

1. **Meta credentials and template synchronization**
   - Provisioning now stores the tenant's Meta access token encrypted and stores the matching WABA ID in that same tenant integration's config.
   - Meta template synchronization now resolves the active integration by both `tenant_id` and `whatsapp_meta_cloud_api`, decrypts that tenant's token, reads that tenant's WABA ID, and uses the tenant-scoped Meta client.
   - Pagination now fails closed if Meta advertises another page but returns an absent, empty, or repeated cursor; it no longer silently treats an incomplete result as complete.
   - Template records persist the provider supplied by the selected client.

2. **Controlled provider migration safeguards**
   - Provider identity now follows the configured global `WHATSAPP_PROVIDER_MODE` in webhook events, tenant resolution, provisioning, voice context, outbox jobs and voice jobs.
   - The queue-table constraints now permit both `whatsapp_360dialog` and `whatsapp_meta_cloud_api`; existing 360dialog records are not rewritten.
   - Meta sender credential resolution refuses to use a global token when a tenant integration is missing. Meta media downloads also refuse to fall back to a global token when tenant context is absent.
   - The settings UI collects the WABA ID in Meta mode and displays provider-specific instructions.
   - **Limitation:** provider selection remains global, not per tenant. This is a controlled global migration path, not mixed-provider support. The deployment operator must reconnect every tenant before switching the global mode. The application fails closed for tenants without credentials in the selected provider, but there is not yet an automated all-tenant migration preflight or mixed-provider migration tool.

3. **Gemini and AI fallback behavior**
   - Gemini generation retries network failures and retryable HTTP statuses (429, 500, 502, 503, 504) with bounded attempts and bounded `Retry-After` delays.
   - Missing LLM tier configuration is now logged when the client factory falls back to the rule-based path.
   - Domain reply and context-loading fallback paths now log safe error names and tenant/conversation references without logging message content or API secrets.
   - The existing Gemini history normalization remains in place.

4. **Interface localization foundation**
   - Added typed `fr`, `en`, and `ar` dictionaries for dashboard navigation and shared shell labels.
   - New sessions default to French unless a saved locale cookie exists.
   - Added a persistent language selector backed by an authenticated, rate-limited endpoint and an HttpOnly, SameSite=Lax cookie.
   - The root document now sets `lang` and `dir`; Arabic receives RTL direction and logical sidebar positioning, plus RTL form alignment rules.
   - **Limitation:** this is a localization foundation and dashboard-shell translation only. Many dashboard pages, authentication screens, marketing pages, help/legal pages, notifications, forms and error messages still contain hardcoded Italian text. The requirement for complete translation of every user-facing string is NOT complete.

### New migrations

- `202611190002_whatsapp_queue_provider_meta.sql` permits the Meta provider in WhatsApp outbox and voice-job records while retaining existing 360dialog values.
- The earlier `202611190001_whatsapp_template_provider_meta.sql` remains required for Meta template records.

### Tests added or expanded (not executed)

- Gemini rate-limit retry test.
- Meta tenant credentials must not fall back to a global token.
- Interface locale default, supported values, direction and dictionary-key parity tests.
- Existing Gemini history normalization and Meta webhook signature tests remain in the working copy.

### Validation after these changes

- TypeScript syntax transpilation: **PASS** for all 321 `.ts` / `.tsx` files under `src` and `tests`. This is syntax transpilation only; it is not a semantic typecheck.
- `npm run db:lint`: **PASS** — 22 declared tables have RLS enabled in the migration coverage check. This is not a live RLS authorization test.
- `npm run test`: **BLOCKED** — `vitest` is not installed in the supplied `node_modules` tree (`vitest: not found`).
- `npm run lint`: **BLOCKED** — `eslint` is not installed in the supplied `node_modules` tree (`eslint: not found`).
- `npm run typecheck`: **BLOCKED** — required `@types` packages are empty/missing in the supplied `node_modules` tree; TypeScript reports TS2688 for `chai`, `deep-eql`, `estree`, `json-schema`, `json5`, `node`, `react`, `react-dom`, and `ws`.
- `npm run build`: **NOT RUN** — Next.js package contents are also absent from the supplied `node_modules` tree.
- Live Meta, Gemini, Supabase, concurrent-booking and end-to-end tests: **NOT RUN** — dependencies and external test credentials/database are unavailable.

### Remaining blockers — not fixed

- Complete per-tenant provider selection, or a deployment-enforced global migration preflight that proves every active tenant has reconnected before the global switch.
- Automated migration/reconciliation for existing 360dialog integrations and pending jobs.
- Complete typed localization of every user-facing frontend string across dashboard, authentication, marketing, help, legal, notifications, errors and forms.
- Full Arabic typography and RTL visual regression testing in a real browser.
- Startup validation for all Gemini/Anthropic model and key combinations beyond warning when a tier is missing.
- End-to-end audio transcription validation for WhatsApp voice formats, mixed Darija/Arabic/French, silence and oversized media.
- Live tenant-isolation and RLS authorization tests against Supabase.
- Database-backed concurrent booking tests, cancellation/rescheduling ownership tests and timezone-boundary tests.
- Complete Meta webhook idempotency, rate-limit, tenant-routing and retry tests in a live integration environment.

**Release decision:** still not production-ready. Do not describe this working copy as fully fixed or deploy it to real clinics until dependencies are installed, the full test/typecheck/lint/build suite passes, migrations are applied, and the external integration tests are completed.
