import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationsDir = 'supabase/migrations';
const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort();

if (migrationFiles.length === 0) {
  console.error('No SQL migrations found; the RLS check cannot verify an empty migration set.');
  process.exit(1);
}

// Remove comments before inspecting DDL so commented-out statements cannot
// make a missing RLS declaration appear to pass.
const sql = migrationFiles
  .map((file) => readFileSync(join(migrationsDir, file), 'utf8'))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/--.*$/gm, '');

// Match both CREATE TABLE and CREATE TABLE IF NOT EXISTS. The old checker only
// matched the latter, allowing a future migration to add an unprotected table.
const declaredTables = [
  ...sql.matchAll(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)/gi),
]
  .map((match) => match[1].toLowerCase())
  .filter((table, index, all) => all.indexOf(table) === index)
  .sort();

if (declaredTables.length === 0) {
  console.error('No public tables found in migrations; the RLS check is not inspecting anything.');
  process.exit(1);
}

const enabledTables = new Set(
  [...sql.matchAll(/\balter\s+table\s+(?:if\s+exists\s+)?public\.([a-z_][a-z0-9_]*)\s+enable\s+row\s+level\s+security\b/gi)].map(
    (match) => match[1].toLowerCase(),
  ),
);

const policyTables = new Set(
  [...sql.matchAll(/\bcreate\s+policy\s+[a-z_][a-z0-9_]*\s+on\s+public\.([a-z_][a-z0-9_]*)\b/gi)].map(
    (match) => match[1].toLowerCase(),
  ),
);

const missingRls = declaredTables.filter((table) => !enabledTables.has(table));
const missingPolicies = declaredTables.filter((table) => !policyTables.has(table));

if (missingRls.length > 0 || missingPolicies.length > 0) {
  if (missingRls.length > 0) {
    console.error(`Tables without ENABLE ROW LEVEL SECURITY: ${missingRls.join(', ')}`);
  }
  if (missingPolicies.length > 0) {
    console.error(
      `Tables without an explicit RLS policy (default deny may be intentional, review explicitly): ${missingPolicies.join(', ')}`,
    );
  }
  process.exit(1);
}

const requiredSnippets = [
  "auth.jwt() -> 'app_metadata' ->> 'tenant_id'",
  "auth.jwt() -> 'app_metadata' ->> 'role'",
  'revoke execute on function public.increment_usage_metrics',
  'grant execute on function public.increment_usage_metrics',
  'create or replace function public.match_knowledge_base',
  'revoke execute on function public.match_knowledge_base',
  'grant execute on function public.match_knowledge_base',
  'integrations_provider_external_account_unique_idx',
  'integrations_tenant_singleton_provider_unique_idx',
  'auto_reply_enabled boolean not null default false',
  'provider_message_id text',
  'messages_tenant_provider_message_unique_idx',
  'whatsapp_outbox_jobs_ready_idx',
  'whatsapp_message_templates_tenant_status_idx',
  'customer_service_window_expires_at',
  'appointments_reminder_due_idx',
  'confirmation_queued_at timestamptz',
  'booking_min_lead_minutes integer not null default 120',
  'booking_slot_step_minutes integer not null default 15',
  'booking_buffer_minutes integer not null default 0',
  'booking_max_days_ahead integer not null default 30',
  'calendar_sync_status text not null default',
  'appointments_tenant_status_scheduled_idx',
  'appointments_no_confirmed_overlap',
  'create extension if not exists "btree_gist"',
  'revoke execute on function public.claim_whatsapp_outbox_jobs',
  'grant execute on function public.claim_whatsapp_outbox_jobs',
  'revoke execute on function public.complete_whatsapp_outbox_job',
  'grant execute on function public.complete_whatsapp_outbox_job',
  'revoke execute on function public.fail_whatsapp_outbox_job',
  'grant execute on function public.fail_whatsapp_outbox_job',
  'whatsapp_voice_jobs_ready_idx',
  'revoke execute on function public.claim_whatsapp_voice_jobs',
  'grant execute on function public.claim_whatsapp_voice_jobs',
  'create or replace function public.replace_tenant_business_hours',
  'revoke execute on function public.replace_tenant_business_hours',
  'grant execute on function public.replace_tenant_business_hours',
  'create or replace function public.create_tenant_onboarding',
  'revoke execute on function public.create_tenant_onboarding',
  'grant execute on function public.create_tenant_onboarding',
  'add column if not exists stripe_customer_id text',
  'add column if not exists stripe_subscription_id text',
  'add column if not exists subscription_status text',
  'add column if not exists current_period_end timestamptz',
  'add column if not exists cancel_at_period_end boolean not null default false',
  'tenants_stripe_customer_id_key',
  'tenants_stripe_subscription_id_key',
  'invoices_tenant_status_idx',
  'billing_events_tenant_created_idx',
  'voice_messages_count integer not null default 0',
  'p_voice_messages_delta integer default 0',
  'usage_metrics_tenant_month_idx',
  'integrations_provider_external_account_active_unique_idx',
  'integrations_tenant_whatsapp_provider_active_unique_idx',
  'whatsapp_meta_cloud_api',
];

const normalizedSql = sql.toLowerCase();
const missingSnippets = requiredSnippets.filter(
  (snippet) => !normalizedSql.includes(snippet.toLowerCase()),
);

if (missingSnippets.length > 0) {
  console.error(`Missing required migration safeguards: ${missingSnippets.join(', ')}`);
  process.exit(1);
}

console.log(
  `RLS migration coverage OK: ${declaredTables.length} public tables; every table enables RLS and declares at least one policy.`,
);
console.warn(
  'Static migration check only: this does not prove policy correctness or runtime tenant isolation against PostgreSQL.',
);
