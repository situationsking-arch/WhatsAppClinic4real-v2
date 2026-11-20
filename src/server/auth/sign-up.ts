// Self-service sign-up: validate the requested business profile and send a
// Supabase magic link. The tenant is created exactly once, after email
// verification, by TenantOnboardingService.createTenant().

import { AppError } from '@/lib/errors/app-error';
import { env } from '@/lib/env';
import { logger } from '@/lib/logging/logger';
import { MagicLinkService, normalizeEmail } from '@/server/auth/magic-link';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export type SignUpVertical = 'dental' | 'beauty' | 'fitness' | 'professional' | 'other';

export type SignUpInput = {
  businessName: string;
  email: string;
  vertical: SignUpVertical;
  requestId: string;
};

export type SignUpResult = { ok: true };

export class SignUpService {
  constructor(
    private readonly magicLinkService: MagicLinkService,
    private readonly appUrl: string,
  ) {}

  async signUp(input: SignUpInput): Promise<SignUpResult> {
    const businessName = normalizeBusinessName(input.businessName);
    const email = normalizeEmail(input.email);

    if (!email) {
      throw new AppError('bad_request', 'A valid email is required');
    }

    const callback = new URL('/auth/callback', this.appUrl);
    const onboarding = new URL('/onboarding', this.appUrl);
    onboarding.searchParams.set('business_name', businessName);
    onboarding.searchParams.set('vertical', input.vertical);
    callback.searchParams.set('next', `${onboarding.pathname}${onboarding.search}`);

    try {
      await this.magicLinkService.request({
        email,
        requestId: input.requestId,
        redirectTo: callback.toString(),
      });
    } catch (error) {
      // Keep sign-up responses generic. A user can request another link, and
      // logs retain the request ID without exposing provider details.
      logger.warn(
        { requestId: input.requestId, err: error },
        'Sign-up magic link dispatch failed',
      );
    }

    return { ok: true };
  }
}

export function createSignUpService(): SignUpService {
  const redirectTo = `${env.NEXT_PUBLIC_APP_URL}/auth/callback`;
  const sender = {
    async send(input: { email: string; redirectTo: string }) {
      const supabase = createSupabaseAdminClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: input.email,
        options: { emailRedirectTo: input.redirectTo },
      });
      return { error: error ?? null };
    },
  };

  return new SignUpService(new MagicLinkService(sender, redirectTo), env.NEXT_PUBLIC_APP_URL);
}

function normalizeBusinessName(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 120) {
    throw new AppError('bad_request', 'Business name must be 2-120 chars');
  }
  return trimmed;
}
