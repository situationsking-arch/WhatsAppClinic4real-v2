import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/202611200001_whatsapp_provider_integrity.sql',
  'utf8',
).toLowerCase();

describe('WhatsApp provider integrity migration', () => {
  it('allows Meta Cloud API integrations', () => {
    expect(migration).toContain("'whatsapp_meta_cloud_api'");
    expect(migration).toContain('alter table public.integrations');
  });

  it('enforces unique active phone-number ownership at database level', () => {
    expect(migration).toContain('integrations_provider_external_account_active_unique_idx');
    expect(migration).toContain("status = 'active'");
  });

  it('allows a revoked phone number to be reconnected', () => {
    expect(migration).toContain('drop index if exists public.integrations_provider_external_account_unique_idx');
    expect(migration).toContain('integrations_non_whatsapp_provider_external_account_unique_idx');
  });
});
