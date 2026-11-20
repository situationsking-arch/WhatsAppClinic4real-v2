import { env } from '@/lib/env';
import { AppError } from '@/lib/errors/app-error';
import type { LlmClient, LlmCompletionInput, LlmCompletionResult } from '@/server/ai/llm';

type Fetcher = typeof fetch;

type GeminiClientOptions = {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetcher?: Fetcher;
  maxRetries?: number;
  sleep?: (milliseconds: number) => Promise<void>;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  modelVersion?: string;
  error?: { message?: string; status?: string };
};

/**
 * Client minimale per l'API Gemini `generateContent` (REST, senza SDK).
 * Implementa la stessa interfaccia `LlmClient` dell'adapter Anthropic, quindi
 * classificatore e generatore di risposte non cambiano.
 */
export class GeminiGenerateContentClient implements LlmClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetcher: Fetcher;
  private readonly maxRetries: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(options: GeminiClientOptions = {}) {
    this.apiKey = options.apiKey ?? env.GEMINI_API_KEY;
    this.model = options.model ?? env.GEMINI_MODEL_PRIMARY;
    this.baseUrl = options.baseUrl ?? 'https://generativelanguage.googleapis.com';
    this.fetcher = options.fetcher ?? fetch;
    this.maxRetries = Math.max(0, Math.min(options.maxRetries ?? 2, 3));
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async complete(input: LlmCompletionInput): Promise<LlmCompletionResult> {
    if (!this.apiKey || !this.model) {
      throw new AppError('internal', 'Gemini API key or model is not configured', {
        expose: false,
      });
    }

    const requestUrl = `${this.baseUrl}/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    const requestInit: RequestInit = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // La chiave va nell'header, mai nell'URL, per non finire nei log.
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.system }] },
        contents: normalizeGeminiContents(input.messages),
        generationConfig: {
          temperature: input.temperature ?? 0.2,
          maxOutputTokens: input.maxTokens,
        },
      }),
    };

    let response: Response | null = null;
    let lastNetworkError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        response = await this.fetcher(requestUrl, {
          ...requestInit,
          signal: AbortSignal.timeout(30_000),
        });
        if (response.ok || !isRetryableStatus(response.status) || attempt >= this.maxRetries) {
          break;
        }
        const retryDelay = getRetryDelay(response.headers.get('retry-after'), attempt);
        await this.sleep(retryDelay);
      } catch (error) {
        lastNetworkError = error;
        if (attempt >= this.maxRetries) {
          throw new AppError('upstream_error', 'Gemini request failed after bounded retries', {
            cause: { errorName: error instanceof Error ? error.name : 'UnknownError' },
            expose: false,
          });
        }
        await this.sleep(250 * 2 ** attempt);
      }
    }

    if (!response) {
      throw new AppError('upstream_error', 'Gemini request failed', {
        cause: { errorName: lastNetworkError instanceof Error ? lastNetworkError.name : 'UnknownError' },
        expose: false,
      });
    }
    const body = (await readJson(response)) as GeminiResponse;

    if (!response.ok) {
      throw new AppError('upstream_error', 'Gemini generateContent API failed', {
        cause: { status: response.status, body },
        expose: false,
      });
    }

    const candidate = body.candidates?.[0];
    const text = (candidate?.content?.parts ?? [])
      .map((part) => part.text ?? '')
      .join('\n')
      .trim();

    if (!text) {
      throw new AppError('upstream_error', 'Gemini returned an empty response', {
        cause: body,
        expose: false,
      });
    }

    return {
      text,
      model: body.modelVersion ?? this.model,
      inputTokens: body.usageMetadata?.promptTokenCount ?? null,
      outputTokens: body.usageMetadata?.candidatesTokenCount ?? null,
      stopReason: candidate?.finishReason ?? null,
      raw: body,
    };
  }
}

export function createGeminiClientForModel(model: string): GeminiGenerateContentClient | null {
  if (!env.GEMINI_API_KEY || !model) {
    return null;
  }

  return new GeminiGenerateContentClient({ model });
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function getRetryDelay(retryAfter: string | null, attempt: number): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1_000, 5_000);
    }
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay) && dateDelay > 0) {
      return Math.min(dateDelay, 5_000);
    }
  }
  return Math.min(250 * 2 ** attempt, 2_000);
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text.trim()) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return { raw: text };
  }
}

/** Gemini accepts one content turn per role transition. Merge adjacent messages
 * from the same speaker so callers can safely pass fragmented chat history. */
export function normalizeGeminiContents(
  messages: LlmCompletionInput['messages'],
): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> {
  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

  for (const message of messages) {
    const text = message.content.trim();
    if (!text) continue;

    const role = message.role === 'assistant' ? 'model' : 'user';
    const previous = contents.at(-1);
    if (previous?.role === role) {
      previous.parts.push({ text });
    } else {
      contents.push({ role, parts: [{ text }] });
    }
  }

  return contents;
}
