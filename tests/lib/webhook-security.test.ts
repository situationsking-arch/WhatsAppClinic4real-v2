import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', () => ({
  env: {
    WHATSAPP_WEBHOOK_HEADER_NAME: 'x-webhook-secret',
    WHATSAPP_WEBHOOK_HEADER_SECRET: 'legacy-secret',
    WHATSAPP_APP_SECRET: 'meta-app-secret',
  },
}));

import {
  assertMetaWebhookSignature,
  createWebhookIdempotencyKey,
} from '@/lib/whatsapp/webhook-security';
import { AppError } from '@/lib/errors/app-error';

const rawBody = '{"object":"whatsapp_business_account","entry":[]}';
const signature = (body: string) =>
  `sha256=${createHmac('sha256', 'meta-app-secret').update(body, 'utf8').digest('hex')}`;

beforeEach(() => vi.clearAllMocks());

describe('Meta webhook signature validation', () => {
  it('accepts a valid signature for the exact raw body', () => {
    expect(() =>
      assertMetaWebhookSignature(rawBody, new Headers({ 'x-hub-signature-256': signature(rawBody) })),
    ).not.toThrow();
  });

  it('rejects an invalid signature', () => {
    expect(() =>
      assertMetaWebhookSignature(rawBody, new Headers({ 'x-hub-signature-256': 'sha256=invalid' })),
    ).toThrow(AppError);
  });

  it('rejects a missing signature', () => {
    expect(() => assertMetaWebhookSignature(rawBody, new Headers())).toThrow(AppError);
  });

  it('rejects a payload modified after signing', () => {
    const headers = new Headers({ 'x-hub-signature-256': signature(rawBody) });
    expect(() => assertMetaWebhookSignature(`${rawBody} `, headers)).toThrow(AppError);
  });
});

describe('createWebhookIdempotencyKey', () => {
  it('creates stable provider-scoped keys', () => {
    const first = createWebhookIdempotencyKey({ provider: 'whatsapp_360dialog', externalId: 'wamid.demo' });
    const second = createWebhookIdempotencyKey({ provider: 'whatsapp_360dialog', externalId: 'wamid.demo' });
    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });
});
