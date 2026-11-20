// Fatto da Claude Code l'8 maggio 2026.
// POST /api/auth/sign-up: crea tenant pending + invia magic link.

import { type NextRequest } from 'next/server';
import { z } from 'zod';

import { readJsonBody } from '@/lib/api/body';
import { jsonHandler } from '@/lib/api/json';
import { applyRateLimit } from '@/lib/rate-limit/apply';
import { createSignUpService } from '@/server/auth/sign-up';

export const runtime = 'nodejs';

const SignUpBodySchema = z
  .object({
    business_name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254),
    vertical: z.enum(['dental', 'beauty', 'fitness', 'professional', 'other']),
  })
  .strict();

export async function POST(request: NextRequest): Promise<Response> {
  return jsonHandler(async (context) => {
    // Rate limit: per-IP burst limit plus per-email OTP limit.
    await applyRateLimit('authLogin', { kind: 'ip', value: context.ipAddress });

    const parsed = SignUpBodySchema.parse(await readJsonBody(request));
    // Apply both IP and normalized-email limits: per-IP throttling alone lets
    // distributed clients repeatedly trigger OTP emails to one address.
    await applyRateLimit('authMagicLink', {
      kind: 'email',
      value: parsed.email.toLowerCase(),
    });

    const service = createSignUpService();
    await service.signUp({
      businessName: parsed.business_name,
      email: parsed.email,
      vertical: parsed.vertical,
      requestId: context.requestId,
    });

    return { accepted: true };
  }, request);
}
