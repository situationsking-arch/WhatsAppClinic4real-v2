import { type NextRequest } from 'next/server';
import { z } from 'zod';

import { jsonHandler } from '@/lib/api/json';
import { readJsonBody } from '@/lib/api/body';
import { requireSession } from '@/lib/auth/session';
import { applyRateLimit } from '@/lib/rate-limit/apply';

const LocaleSchema = z.object({ locale: z.enum(['fr', 'en', 'ar']) }).strict();

export async function POST(request: NextRequest): Promise<Response> {
  const response = await jsonHandler(async () => {
    const session = await requireSession();
    await applyRateLimit('settingsWrite', { kind: 'userId', value: session.userId });
    return LocaleSchema.parse(await readJsonBody(request));
  }, request);

  if (response.ok) {
    const body = (await response.clone().json()) as { data?: { locale?: 'fr' | 'en' | 'ar' } };
    if (body.data?.locale) {
      response.cookies.set('NEXT_LOCALE', body.data.locale, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
      });
    }
  }

  return response;
}
