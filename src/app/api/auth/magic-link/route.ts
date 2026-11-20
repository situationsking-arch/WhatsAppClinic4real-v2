// POST /api/auth/magic-link — send a Supabase passwordless sign-in link.
import { type NextRequest } from 'next/server';
import { z } from 'zod';

import { readJsonBody } from '@/lib/api/body';
import { jsonHandler } from '@/lib/api/json';
import { applyRateLimit } from '@/lib/rate-limit/apply';
import { createMagicLinkService, normalizeEmail } from '@/server/auth/magic-link';

export const runtime = 'nodejs';

const MagicLinkBodySchema = z.object({ email: z.string().trim().min(3).max(254) }).strict();

export async function POST(request: NextRequest): Promise<Response> {
  return jsonHandler(async (context) => {
    const parsed = MagicLinkBodySchema.parse(await readJsonBody(request));
    const normalized = normalizeEmail(parsed.email);
    const identifier = normalized
      ? ({ kind: 'email', value: normalized } as const)
      : ({ kind: 'ip', value: context.ipAddress } as const);
    await applyRateLimit('authMagicLink', identifier);

    // Use the actual forwarded Codespaces/deployment origin, not localhost.
    const service = createMagicLinkService(request.nextUrl.origin);
    await service.request({ email: parsed.email, requestId: context.requestId });
    return { sent: true };
  }, request);
}
