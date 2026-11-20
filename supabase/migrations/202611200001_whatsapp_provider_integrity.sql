-- Repair provider constraints and enforce active WhatsApp ownership atomically.
-- This remains a deployment-wide provider mode (360dialog OR Meta), not mixed
-- per-tenant routing. Apply only after reviewing any duplicate active records.

alter table public.integrations
  drop constraint if exists integrations_provider_check;
alter table public.integrations
  add constraint integrations_provider_check
  check (provider in (
    'whatsapp_360dialog',
    'whatsapp_meta_cloud_api',
    'google_calendar',
    'cal_com',
    'calendly',
    'fatture_in_cloud',
    'stripe'
  ));

-- Fail with a readable message rather than partially applying the migration
-- when legacy data already violates the intended active-ownership invariant.
do $$
begin
  if exists (
    select 1 from public.integrations
    where external_account_id is not null and status = 'active'
      and provider in ('whatsapp_360dialog', 'whatsapp_meta_cloud_api')
    group by provider, external_account_id having count(*) > 1
  ) then
    raise exception 'WhatsApp provider migration blocked: duplicate active provider/phone_number_id ownership exists. Resolve duplicates before retrying.';
  end if;

  if exists (
    select 1 from public.integrations
    where status = 'active'
      and provider in ('whatsapp_360dialog', 'whatsapp_meta_cloud_api')
    group by tenant_id, provider having count(*) > 1
  ) then
    raise exception 'WhatsApp provider migration blocked: a tenant has multiple active integrations for the same provider. Resolve duplicates before retrying.';
  end if;
end;
$$;

-- The old index included revoked rows, so a released number could never be
-- claimed again. Active ownership must be unique, while history is retained.
drop index if exists public.integrations_provider_external_account_unique_idx;
create unique index integrations_provider_external_account_active_unique_idx
  on public.integrations(provider, external_account_id)
  where external_account_id is not null and status = 'active'
    and provider in ('whatsapp_360dialog', 'whatsapp_meta_cloud_api');

-- Preserve the former uniqueness guarantee for calendar, Stripe and other
-- non-WhatsApp integrations after replacing the broad legacy index.
create unique index integrations_non_whatsapp_provider_external_account_unique_idx
  on public.integrations(provider, external_account_id)
  where external_account_id is not null
    and provider not in ('whatsapp_360dialog', 'whatsapp_meta_cloud_api');

-- A tenant can have at most one active connection for the selected WhatsApp
-- provider. The partial predicate permits a revoked historical record.
create unique index integrations_tenant_whatsapp_provider_active_unique_idx
  on public.integrations(tenant_id, provider)
  where status = 'active'
    and provider in ('whatsapp_360dialog', 'whatsapp_meta_cloud_api');

-- Explicitly document provider values accepted by webhook event storage.
-- webhook_events.provider intentionally remains unconstrained because it also
-- stores Stripe and future webhook sources.
