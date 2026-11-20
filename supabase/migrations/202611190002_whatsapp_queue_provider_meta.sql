-- Permit both providers in queue records. The application writes the active
-- globally selected provider when enqueueing; existing 360dialog rows remain
-- valid and are not rewritten by this migration.
alter table public.whatsapp_outbox_jobs
  drop constraint if exists whatsapp_outbox_jobs_provider_check;

alter table public.whatsapp_outbox_jobs
  add constraint whatsapp_outbox_jobs_provider_check
  check (provider in ('whatsapp_360dialog', 'whatsapp_meta_cloud_api'));

alter table public.whatsapp_voice_jobs
  drop constraint if exists whatsapp_voice_jobs_provider_check;

alter table public.whatsapp_voice_jobs
  add constraint whatsapp_voice_jobs_provider_check
  check (provider in ('whatsapp_360dialog', 'whatsapp_meta_cloud_api'));
