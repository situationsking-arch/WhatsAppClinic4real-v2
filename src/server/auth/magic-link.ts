// Passwordless authentication through Supabase Auth. The public anon key is
// sufficient for signInWithOtp; the service-role key must never be needed here.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { AppError } from '@/lib/errors/app-error';
import { logger } from '@/lib/logging/logger';
import { env } from '@/lib/env';

export type MagicLinkInput = {
  email: string;
  requestId: string;
  /** Same-origin callback URL selected by the server route. */
  redirectTo?: string;
};

export type MagicLinkResult = { ok: true };

export interface MagicLinkSender {
  send(input: { email: string; redirectTo: string }): Promise<{ error: Error | null }>;
}

export class MagicLinkService {
  constructor(
    private readonly sender: MagicLinkSender,
    private readonly redirectTo: string,
  ) {}

  async request(input: MagicLinkInput): Promise<MagicLinkResult> {
    const email = normalizeEmail(input.email);
    if (!email) {
      logger.info({ requestId: input.requestId }, 'Magic link request rejected: invalid email format');
      return { ok: true };
    }

    const { error } = await this.sender.send({
      email,
      redirectTo: input.redirectTo ?? this.redirectTo,
    });

    if (error) {
      logger.warn({ requestId: input.requestId, err: error }, 'Magic link sender returned an error');
    } else {
      logger.info({ requestId: input.requestId }, 'Magic link dispatched');
    }
    return { ok: true };
  }
}

class SupabaseMagicLinkSender implements MagicLinkSender {
  private readonly supabase: SupabaseClient;

  constructor() {
    if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      throw new AppError('internal', 'Supabase public credentials are not configured', { expose: false });
    }
    this.supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async send(input: { email: string; redirectTo: string }): Promise<{ error: Error | null }> {
    const { error } = await this.supabase.auth.signInWithOtp({
      email: input.email,
      options: { emailRedirectTo: input.redirectTo },
    });
    return { error: error ?? null };
  }
}

export function createMagicLinkService(appUrl = env.NEXT_PUBLIC_APP_URL): MagicLinkService {
  const redirectTo = new URL('/auth/callback', appUrl).toString();
  return new MagicLinkService(new SupabaseMagicLinkSender(), redirectTo);
}

export function normalizeEmail(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}
