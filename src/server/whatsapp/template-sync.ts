import { AppError } from '@/lib/errors/app-error';
import { env } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { readCredentialSecret } from '@/server/integrations/credential-encryption';

export type SyncedWhatsAppTemplateStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'paused'
  | 'disabled';

export type SyncedWhatsAppTemplate = {
  name: string;
  languageCode: string;
  category: 'utility' | 'marketing' | 'authentication';
  status: SyncedWhatsAppTemplateStatus;
  externalId: string | null;
  qualityRating: string | null;
  components: unknown[];
  raw: Record<string, unknown>;
};

export type SyncWhatsAppTemplatesResult = {
  fetchedTemplates: number;
  syncedTemplates: number;
  skippedTemplates: number;
};

export type WhatsAppTemplateProvider = 'whatsapp_360dialog' | 'whatsapp_meta_cloud_api';

export interface WhatsAppTemplateListClient {
  readonly provider?: WhatsAppTemplateProvider;
  listTemplates(): Promise<unknown>;
}

export interface WhatsAppTemplateSyncRepository {
  upsertTemplates(input: {
    tenantId: string;
    provider: WhatsAppTemplateProvider;
    templates: SyncedWhatsAppTemplate[];
    syncedAt: Date;
  }): Promise<void>;
}

type FetchLike = typeof fetch;

export class Dialog360WhatsAppTemplateClient implements WhatsAppTemplateListClient {
  readonly provider = 'whatsapp_360dialog' as const;
  constructor(
    private readonly config: {
      apiUrl?: string;
      apiKey?: string;
      fetcher?: FetchLike;
    } = {},
  ) {}

  async listTemplates(): Promise<unknown> {
    const apiKey = this.config.apiKey ?? env.WHATSAPP_API_KEY;

    if (!apiKey) {
      throw new AppError('internal', 'WhatsApp API key is not configured', {
        expose: false,
      });
    }

    const url = new URL('/v1/configs/templates', this.config.apiUrl ?? env.WHATSAPP_API_URL);
    url.searchParams.set('limit', '1000');
    url.searchParams.set('sort', 'name');

    const response = await (this.config.fetcher ?? fetch)(url, {
      method: 'GET',
      headers: {
        'D360-API-KEY': apiKey,
      },
    });
    const rawResponse = await readJsonResponse(response);

    if (!response.ok) {
      throw new AppError('upstream_error', 'WhatsApp template sync failed', {
        cause: {
          status: response.status,
          body: rawResponse,
        },
        expose: false,
      });
    }

    return rawResponse;
  }
}

/** Elenco template via Meta Graph API. Credentials must be supplied by the
 * caller after resolving the tenant integration; global credentials are unsafe
 * in a multi-tenant application. */
export class MetaWhatsAppTemplateClient implements WhatsAppTemplateListClient {
  readonly provider = 'whatsapp_meta_cloud_api' as const;

  constructor(
    private readonly config: {
      accessToken: string;
      businessAccountId: string;
      graphApiVersion?: string;
      graphApiUrl?: string;
      fetcher?: FetchLike;
      maxPages?: number;
    },
  ) {
    if (!config.accessToken.trim() || !config.businessAccountId.trim()) {
      throw new AppError('internal', 'Tenant Meta credentials are not configured', { expose: false });
    }
  }

  async listTemplates(): Promise<unknown> {
    const baseUrl = this.config.graphApiUrl ?? env.WHATSAPP_GRAPH_API_URL;
    const version = this.config.graphApiVersion ?? env.WHATSAPP_GRAPH_API_VERSION;
    const fetcher = this.config.fetcher ?? fetch;
    const templates: unknown[] = [];
    let after: string | null = null;
    const maxPages = this.config.maxPages ?? 50;

    for (let page = 0; page < maxPages; page += 1) {
      const url = new URL(
        `/${version}/${encodeURIComponent(this.config.businessAccountId)}/message_templates`,
        baseUrl,
      );
      url.searchParams.set('limit', '200');
      if (after) url.searchParams.set('after', after);

      const response = await fetcher(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.config.accessToken}` },
        signal: AbortSignal.timeout(15_000),
      });
      const body = await readJsonResponse(response);

      if (!response.ok) {
        throw new AppError('upstream_error', 'WhatsApp template sync failed', {
          cause: { status: response.status, body },
          expose: false,
        });
      }

      if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        throw new AppError('upstream_error', 'Meta returned an invalid template response', { expose: false });
      }

      const record = body as Record<string, unknown>;
      if (Array.isArray(record.data)) templates.push(...record.data);

      const paging = record.paging;
      const cursors = typeof paging === 'object' && paging !== null
        ? (paging as Record<string, unknown>).cursors
        : null;
      const nextAfter = typeof cursors === 'object' && cursors !== null
        ? (cursors as Record<string, unknown>).after
        : null;
      const hasNext = typeof paging === 'object' && paging !== null && Boolean((paging as Record<string, unknown>).next);

      if (!hasNext) {
        return { data: templates };
      }
      if (typeof nextAfter !== 'string' || !nextAfter || nextAfter === after) {
        throw new AppError('upstream_error', 'Meta template pagination returned an invalid cursor', {
          expose: false,
        });
      }
      after = nextAfter;
    }

    throw new AppError('upstream_error', 'Meta template pagination exceeded the safety limit', { expose: false });
  }
}

export class WhatsAppTemplateSyncService {
  constructor(
    private readonly client: WhatsAppTemplateListClient,
    private readonly repository: WhatsAppTemplateSyncRepository,
  ) {}

  async syncTenantTemplates(input: {
    tenantId: string;
    now?: Date;
  }): Promise<SyncWhatsAppTemplatesResult> {
    const rawResponse = await this.client.listTemplates();
    const rawTemplates = extractTemplateItems(rawResponse);
    const templates = rawTemplates
      .map(normalizeTemplate)
      .filter((template): template is SyncedWhatsAppTemplate => template !== null);

    if (templates.length > 0) {
      await this.repository.upsertTemplates({
        tenantId: input.tenantId,
        provider: this.client.provider ?? 'whatsapp_360dialog',
        templates,
        syncedAt: input.now ?? new Date(),
      });
    }

    return {
      fetchedTemplates: rawTemplates.length,
      syncedTemplates: templates.length,
      skippedTemplates: rawTemplates.length - templates.length,
    };
  }
}

export class SupabaseWhatsAppTemplateSyncRepository implements WhatsAppTemplateSyncRepository {
  private readonly supabase = createSupabaseAdminClient();

  async upsertTemplates(input: {
    tenantId: string;
    provider: WhatsAppTemplateProvider;
    templates: SyncedWhatsAppTemplate[];
    syncedAt: Date;
  }): Promise<void> {
    const rows = input.templates.map((template) => ({
      tenant_id: input.tenantId,
      provider: input.provider,
      name: template.name,
      language_code: template.languageCode,
      category: template.category,
      status: template.status,
      external_id: template.externalId,
      quality_rating: template.qualityRating,
      components: template.components,
      last_synced_at: input.syncedAt.toISOString(),
      metadata: {
        raw: template.raw,
      },
    }));

    const { error } = await this.supabase.from('whatsapp_message_templates').upsert(rows, {
      onConflict: 'tenant_id,provider,name,language_code',
    });

    if (error) {
      throw new AppError('upstream_error', 'Failed to upsert WhatsApp templates', {
        cause: error,
        expose: false,
      });
    }
  }
}

export async function createWhatsAppTemplateSyncService(
  tenantId: string,
): Promise<WhatsAppTemplateSyncService> {
  if (env.WHATSAPP_PROVIDER_MODE === 'meta') {
    // Resolve credentials and WABA ID from the same active tenant integration.
    // Never use global Meta credentials for a tenant-scoped sync operation.
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('integrations')
      .select('credentials, config')
      .eq('tenant_id', tenantId)
      .eq('provider', 'whatsapp_meta_cloud_api')
      .eq('status', 'active')
      .maybeSingle();

    if (error) {
      throw new AppError('upstream_error', 'Failed to resolve tenant Meta credentials', {
        cause: error,
        expose: false,
      });
    }

    const row = data as {
      credentials: Record<string, unknown> | null;
      config: Record<string, unknown> | null;
    } | null;
    const accessToken = row?.credentials
      ? readCredentialSecret(row.credentials, 'api_key')
      : null;
    const businessAccountId = row?.config?.['business_account_id'];

    if (!accessToken || typeof businessAccountId !== 'string' || !businessAccountId.trim()) {
      throw new AppError('internal', 'Tenant Meta credentials or WABA ID are missing', {
        expose: false,
      });
    }

    return new WhatsAppTemplateSyncService(
      new MetaWhatsAppTemplateClient({ accessToken, businessAccountId }),
      new SupabaseWhatsAppTemplateSyncRepository(),
    );
  }

  return new WhatsAppTemplateSyncService(
    new Dialog360WhatsAppTemplateClient(),
    new SupabaseWhatsAppTemplateSyncRepository(),
  );
}

export function normalizeTemplate(value: Record<string, unknown>): SyncedWhatsAppTemplate | null {
  const name = getString(value.name);
  const languageCode = getString(value.language_code) ?? getString(value.language) ?? 'it';
  const category = normalizeCategory(value.category);
  const status = normalizeStatus(value.status);

  if (!name || !category || !status) {
    return null;
  }

  return {
    name,
    languageCode,
    category,
    status,
    externalId: getString(value.external_id) ?? getString(value.id) ?? getString(value.template_id),
    qualityRating:
      getString(value.quality_rating) ?? getString(value.quality) ?? getString(value.quality_score),
    components: Array.isArray(value.components) ? value.components : [],
    raw: value,
  };
}

export function extractTemplateItems(response: unknown): Record<string, unknown>[] {
  const candidates = Array.isArray(response)
    ? response
    : getFirstArrayProperty(response, [
        'data',
        'templates',
        'business_templates',
        'message_templates',
      ]);

  return candidates.filter(
    (item): item is Record<string, unknown> =>
      typeof item === 'object' && item !== null && !Array.isArray(item),
  );
}

function normalizeStatus(value: unknown): SyncedWhatsAppTemplateStatus | null {
  const normalized = getString(value)
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  switch (normalized) {
    case 'approved':
    case 'active':
    case 'active_quality_pending':
    case 'active_high_quality':
    case 'active_medium_quality':
    case 'active_low_quality':
      return 'approved';
    case 'pending':
    case 'submitted':
    case 'in_review':
      return 'pending';
    case 'rejected':
      return 'rejected';
    case 'paused':
      return 'paused';
    case 'disabled':
      return 'disabled';
    case 'draft':
      return 'draft';
    default:
      return null;
  }
}

function normalizeCategory(value: unknown): SyncedWhatsAppTemplate['category'] | null {
  const normalized = getString(value)?.trim().toLowerCase();

  switch (normalized) {
    case 'utility':
      return 'utility';
    case 'marketing':
      return 'marketing';
    case 'authentication':
      return 'authentication';
    default:
      return null;
  }
}

function getFirstArrayProperty(response: unknown, properties: string[]): unknown[] {
  if (typeof response !== 'object' || response === null) {
    return [];
  }

  const record = response as Record<string, unknown>;

  for (const property of properties) {
    if (Array.isArray(record[property])) {
      return record[property];
    }
  }

  return [];
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
