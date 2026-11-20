-- Allow template records to retain the provider that actually owns them.
-- Meta credentials/provisioning remain tenant-scoped and are intentionally not
-- enabled by this migration alone.
alter table public.whatsapp_message_templates
  drop constraint if exists whatsapp_message_templates_provider_check;

alter table public.whatsapp_message_templates
  add constraint whatsapp_message_templates_provider_check
  check (provider in ('whatsapp_360dialog', 'whatsapp_meta_cloud_api'));
