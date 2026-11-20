// Self-service sign-up: validate the business profile and send a Supabase
// magic link. Tenant creation happens only after successful email verification.
import { AppError } from '@/lib/errors/app-error';
import { env } from '@/lib/env';
import { logger } from '@/lib/logging/logger';
import { createMagicLinkService, normalizeEmail } from '@/server/auth/magic-link';

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
    private readonly magicLinkService: ReturnType<typeof createMagicLinkService>,
    private readonly appUrl: string,
  ) {}

  async signUp(input: SignUpInput): Promise<SignUpResult> {
    const businessName = normalizeBusinessName(input.businessName);
    const email = normalizeEmail(input.email);
    if (!email) throw new AppError('bad_request', 'A valid email is required');

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
      logger.warn({ requestId: input.requestId, err: error }, 'Sign-up magic link dispatch failed');
      throw error;
    }
    return { ok: true };
  }
}

export function createSignUpService(appUrl = env.NEXT_PUBLIC_APP_URL): SignUpService {
  return new SignUpService(createMagicLinkService(appUrl), appUrl);
}

function normalizeBusinessName(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 120) {
    throw new AppError('bad_request', 'Business name must be 2-120 chars');
  }
  return trimmed;
}
