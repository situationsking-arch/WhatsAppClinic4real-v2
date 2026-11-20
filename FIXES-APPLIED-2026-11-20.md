# Independent fixes and verification — 20 November 2026

## Scope and source

This pass was performed against `whatsapp-receptionist-meta-gemini-fixed.zip` (the latest available audited Meta/Gemini working archive in the Library). The ZIP integrity check passed before extraction. This is not the same as a live Codespaces checkout: the GitHub repository `situationsking-arch/WhatsAppClinic4real` currently exposes only an initial commit and no project files through the GitHub contents API.

## Changes made

### 1. Registration no longer creates an orphan tenant

Previously, `SignUpService` inserted a `suspended` tenant before the email address was verified. The subsequent onboarding RPC independently inserted a second, active tenant and the owner membership. The pre-verification tenant was never attached to the authenticated user, creating duplicate/orphan tenant records.

The registration flow now:

- validates the business name, email and sector;
- sends the Supabase magic link without inserting a tenant;
- preserves the submitted business name and sector in the trusted same-origin callback's `next` path, so the existing onboarding form can prefill them;
- leaves tenant creation to the existing atomic onboarding RPC after authentication;
- returns a generic accepted response instead of a tenant ID that does not yet exist;
- avoids checking whether the email already belongs to a tenant, reducing account-existence disclosure.

The signup route also applies both its existing IP rate limit and the magic-link per-email rate limit, reducing distributed OTP-email abuse against a single address.

Regression tests were updated for the new registration contract and redirect preservation. They are present in the archive but could not be executed in this environment (see validation below).

### 2. RLS migration checker now catches more classes of omission

The previous checker only discovered `CREATE TABLE IF NOT EXISTS`, and only checked for the presence of an `ENABLE ROW LEVEL SECURITY` substring. A plain `CREATE TABLE` in a future migration could escape discovery; a table with RLS enabled but no explicit policy could also pass unnoticed.

The checker now:

- discovers both `CREATE TABLE` and `CREATE TABLE IF NOT EXISTS`;
- strips SQL comments before scanning, preventing commented-out DDL from satisfying checks;
- checks every discovered public table for an explicit RLS enable statement;
- checks every discovered public table for at least one explicit policy;
- retains the existing required migration safeguard checks;
- prints a warning that static checks do not prove policy correctness or runtime tenant isolation.

### 3. Validation performed

- ZIP integrity: **PASS** (`unzip -t`, no archive errors).
- RLS migration checker: **PASS** — 22 public tables, all with RLS enabled and at least one policy.
- RLS checker negative probe: **PASS** — an added unprotected table caused the checker to fail as intended.
- TypeScript/TSX syntax transpilation: **PASS** — 321 `.ts` / `.tsx` files, zero syntax diagnostics.
- Package metadata and lockfile sanity: **PASS** — package name and lockfile name agree; lockfile version 3; Node engine range is Node 22.

## Not verified / still blocking a production claim

- `npm ci --ignore-scripts` did not complete because the execution environment could not resolve `registry.npmjs.org` (`EAI_AGAIN`). `node_modules` is incomplete.
- Semantic TypeScript typecheck: **BLOCKED** by missing `@types` packages (`chai`, `deep-eql`, `estree`, `json-schema`, `json5`, `node`, `react`, `react-dom`, `ws`).
- Vitest, ESLint, Prettier, Next.js production build and Playwright: **NOT RUN** because their installed binaries/dependencies are absent.
- Supabase migrations were not applied to a live database; RLS policy behavior and tenant A/B isolation were not proven against PostgreSQL.
- Meta webhook verification, inbound/outbound messages, tenant credential resolution, template pagination, Gemini requests, voice transcription, Google OAuth, Stripe billing, and email delivery were not live-tested; real provider credentials and test accounts are required.

## Known architectural/product gaps from the source audit

1. `WHATSAPP_PROVIDER_MODE` is still a global deployment switch, not a per-tenant provider selection. Mixed Meta/360dialog tenants are not supported. Switching a live deployment requires a controlled tenant reconnection and queued-job reconciliation process.
2. Meta template/credential fixes are tenant-scoped in the code, but need integration tests against real Meta test assets before production.
3. Arabic/French/English localization is incomplete. The current UI and several date/number/currency formatters remain Italy-first (`it-IT`, `Europe/Rome`, EUR, country `IT`). The existing `LOCALE_PROFILE=tn` support is partial and does not make the full product Tunisia-ready.
4. Application-level tenant filters exist in many service-role query paths, but service-role access bypasses RLS. A real PostgreSQL/Supabase two-tenant isolation suite is still required.
5. The cross-tenant admin panel remains intentionally unconnected; it must not be treated as a working admin product.
6. Prompt-injection defenses, asynchronous AI execution outside the inbound webhook, operational exception tracking, resource-level booking constraints, and team invitations remain open product/architecture work.
7. Existing suspended tenant rows created by earlier signup attempts were not deleted. They require a reviewed cleanup against the actual database; this archive does not include a destructive cleanup migration.

## Release decision

**Not production-ready yet.** The fixes above close a real registration lifecycle defect and strengthen the static RLS migration gate, but the full test/build suite and live integration/security checks remain unverified. Do not enable automatic replies on a real clinic number until those checks pass with test credentials and a controlled number.

## Additional repair pass — 20 November 2026

### Fixed in source

1. **Meta integrations were rejected by the database schema.** The initial `integrations.provider` CHECK constraint allowed `whatsapp_360dialog` but not `whatsapp_meta_cloud_api`, even though application code and the onboarding instructions supported Meta. Added `202611200001_whatsapp_provider_integrity.sql` to permit both providers.
2. **Revoked WhatsApp numbers could not be reclaimed.** The legacy unique index included revoked integrations. The new migration replaces it with active-only WhatsApp ownership uniqueness, adds one-active-connection-per-tenant/provider protection, and retains the old uniqueness guarantee for non-WhatsApp external integrations. The migration fails with explicit messages if existing active data already contains duplicates.
3. **Concurrent number-claim race.** The provisioning service now maps PostgreSQL unique-violation errors to a safe HTTP conflict instead of an opaque internal error. The database indexes are the authoritative race-safe guard; the existing pre-check remains a user-friendly early check.
4. **Tunisia onboarding defaults.** Added a deployment profile helper. With `LOCALE_PROFILE=tn`, new tenants default to country `TN`, timezone `Africa/Tunis`, and `fr-FR`; existing saved tenant settings remain authoritative. The onboarding timezone selector now includes Tunisia and uses the profile default. Booking/time-format fallback paths and several dashboard formatters use the profile timezone/locale.
5. **Cutover safety.** Added `scripts/whatsapp-meta-cutover-preflight.sql` to identify active tenants without a complete Meta integration before the deployment-wide provider switch. Documented that mixed per-tenant provider routing is still unsupported. Updated the Tunisia `.env.example` defaults to Gemini booking-agent mode and the Tunisia locale profile.
6. **Regression coverage.** Added tests for locale-profile defaults and migration invariants; expanded provisioning coverage to assert the phone-number ID is persisted in the config used by the sender resolver. The static migration checker now requires the new provider safeguards.

### Validation after this pass

- ZIP extraction and original archive integrity: PASS.
- Static RLS migration coverage: PASS (22 public tables; still not a runtime authorization proof).
- TypeScript/TSX syntax transpilation: PASS (324 files, zero syntax diagnostics).
- Full semantic typecheck, Vitest, ESLint, production build and Playwright: BLOCKED because dependency installation could not complete. `npm ci` timed out against the npm registry; offline installation confirmed required package tarballs are not cached. The errors from `tsc --noEmit` are dominated by absent Next.js, React, Node and Playwright declarations, so no clean semantic typecheck can be claimed.
- The Supabase migration and cutover SQL have not been applied to a live database. Do not switch the production provider until the migration is applied and the preflight returns no unready active tenants.

### Still not completed (release blockers)

- Provider selection is still deployment-wide, not per tenant. A deployment cannot safely mix 360dialog and Meta tenants on the same running app. The preflight makes a global cutover safer; it does not implement mixed-provider routing.
- Full French/Arabic/English localization and Arabic RTL visual QA remain incomplete. Some UI, marketing, legal, help and operational strings remain Italian.
- The AI reply path is not fully moved to an asynchronous inbound-job architecture; prompt-injection hardening and operational retry/dead-letter behavior still need end-to-end verification.
- Live PostgreSQL two-tenant RLS tests, concurrent booking tests, Meta webhook/message round trips, Gemini calls, and production browser tests still require a Supabase test project and provider credentials.
- Admin cross-tenant management and team invitations remain incomplete.
- Tunisia-specific billing/tax readiness is not established. Existing Stripe/Italian SDI assumptions must be reviewed before offering paid subscriptions or local invoices in Tunisia.

**Release status remains: NOT production-ready.**
