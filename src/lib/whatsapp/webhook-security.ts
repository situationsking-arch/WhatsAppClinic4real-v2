import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { AppError } from '@/lib/errors/app-error';
import { env } from '@/lib/env';

export function assertWhatsAppWebhookSecret(headers: Headers): void {
  const headerName = env.WHATSAPP_WEBHOOK_HEADER_NAME.toLowerCase();
  const expectedSecret = env.WHATSAPP_WEBHOOK_HEADER_SECRET;

  if (!expectedSecret) {
    throw new AppError('internal', 'WhatsApp webhook secret is not configured', {
      expose: false,
    });
  }

  const receivedSecret = headers.get(headerName);

  if (!receivedSecret || !safeEqual(receivedSecret, expectedSecret)) {
    throw new AppError('webhook_rejected', 'Webhook secret mismatch');
  }
}

/**
 * Verifica della firma Meta (`X-Hub-Signature-256: sha256=<hmac>`) calcolata con
 * l'App Secret sul corpo grezzo della richiesta. Va chiamata PRIMA di fare il
 * parse del JSON, sul testo esatto ricevuto.
 */
export function assertMetaWebhookSignature(rawBody: string, headers: Headers): void {
  const appSecret = env.WHATSAPP_APP_SECRET;

  if (!appSecret) {
    throw new AppError('internal', 'WhatsApp app secret is not configured', { expose: false });
  }

  const received = headers.get('x-hub-signature-256');

  if (!received || !received.startsWith('sha256=')) {
    throw new AppError('webhook_rejected', 'Missing webhook signature');
  }

  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')}`;

  if (!safeEqual(received, expected)) {
    throw new AppError('webhook_rejected', 'Webhook signature mismatch');
  }
}

export function createWebhookIdempotencyKey(input: {
  provider: 'whatsapp_360dialog' | 'whatsapp_meta_cloud_api' | 'stripe';
  externalId: string;
}): string {
  return createHash('sha256').update(`${input.provider}:${input.externalId}`).digest('hex');
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.byteLength !== rightBuffer.byteLength) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
