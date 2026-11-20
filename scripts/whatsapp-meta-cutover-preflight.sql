-- Run in the Supabase SQL editor BEFORE setting WHATSAPP_PROVIDER_MODE=meta.
-- It returns every active tenant that is not ready for the global provider cutover.
-- A zero-row result is necessary, but not sufficient, for a safe cutover.

select
  t.id as tenant_id,
  t.name as tenant_name,
  coalesce(i.status, 'missing') as integration_status,
  i.external_account_id as phone_number_id,
  nullif(i.config ->> 'business_account_id', '') as business_account_id,
  case
    when i.id is null then 'missing_meta_integration'
    when i.status <> 'active' then 'meta_integration_not_active'
    when nullif(i.external_account_id, '') is null then 'missing_phone_number_id'
    when nullif(i.config ->> 'business_account_id', '') is null then 'missing_waba_id'
    when i.credentials -> 'api_key_encrypted' is null then 'missing_encrypted_access_token'
    else 'ready_for_static_preflight'
  end as readiness
from public.tenants t
left join public.integrations i
  on i.tenant_id = t.id
 and i.provider = 'whatsapp_meta_cloud_api'
 and i.status = 'active'
where t.status = 'active'
  and (
    i.id is null
    or i.status <> 'active'
    or nullif(i.external_account_id, '') is null
    or nullif(i.config ->> 'business_account_id', '') is null
    or i.credentials -> 'api_key_encrypted' is null
  )
order by t.name, t.id;

-- Check active ownership collisions (the migration also enforces this with
-- unique indexes, but this query makes existing data problems visible first).
select provider, external_account_id, count(*) as active_owners
from public.integrations
where status = 'active'
  and provider in ('whatsapp_360dialog', 'whatsapp_meta_cloud_api')
  and external_account_id is not null
group by provider, external_account_id
having count(*) > 1;
