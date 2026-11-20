import { env } from '@/lib/env';
import { logger } from '@/lib/logging/logger';
import { createAnthropicClientForModel } from '@/server/ai/anthropic-adapter';
import { createGeminiClientForModel } from '@/server/ai/gemini-adapter';
import type { LlmClient } from '@/server/ai/llm';

export type LlmTier = 'fast' | 'primary';

/** Sceglie il client LLM in base a `LLM_PROVIDER`. Ritorna null se non configurato. */
export function createLlmClient(tier: LlmTier): LlmClient | null {
  const model = env.LLM_PROVIDER === 'gemini'
    ? (tier === 'fast' ? env.GEMINI_MODEL_FAST : env.GEMINI_MODEL_PRIMARY)
    : (tier === 'fast' ? env.ANTHROPIC_MODEL_FAST : env.ANTHROPIC_MODEL_PRIMARY);

  if (!model.trim()) {
    logger.warn(
      { provider: env.LLM_PROVIDER, tier },
      `LLM ${tier} model is not configured; the application will use its explicit fallback`,
    );
    return null;
  }

  const client = env.LLM_PROVIDER === 'gemini'
    ? createGeminiClientForModel(model)
    : createAnthropicClientForModel(model);

  if (!client) {
    logger.warn(
      { provider: env.LLM_PROVIDER, tier },
      `LLM ${tier} client could not be created; the application will use its explicit fallback`,
    );
  }

  return client;
}
