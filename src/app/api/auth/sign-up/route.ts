// POST /api/auth/sign-up — validate registration and send the verification link.
import { type NextRequest } from 'next/server';
import { z } from 'zod';

import { readJsonBody } from '@/lib/api/body';
import { jsonHandler } from '@/lib/api/json';
import { applyRateLimit } from '@/lib/rate-limit/apply';
import { createSignUpService } from '@/server/auth/sign-up';

export const runtime = 'nodejs';

const SignUpBodySchema = z.object({
  business_name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  vertical: z.enum(['dental', 'beauty', 'fitness', 'professional', 'other']),
}).strict();

export async function POST(request: NextRequest): Promise<Response> {
  return jsonHandler(async (context) => {
    await applyRateLimit('authLogin', { kind: 'ip', value: context.ipAddress });
    const parsed = SignUpBodySchema.parse(await readJsonBody(request));
    await applyRateLimit('authMagicLink', {
      kind: 'email',
      value: parsed.email.toLowerCase(),
    });

    // The callback host must match the Codespaces preview host used by this request.
    const service = createSignUpService(request.nextUrl.origin);
    await service.signUp({
      businessName: parsed.business_name,
      email: parsed.email,
      vertical: parsed.vertical,
      requestId: context.requestId,
    });
    return { accepted: true };
  }, request);
}
