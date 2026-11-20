/**
 * Ciclo "function calling" per Gemini (REST generateContent).
 *
 * Nessun import dal progetto: il modulo riceve chiave, modello e fetch dal
 * chiamante, quindi si testa da solo con un fetch finto.
 */

export class GeminiAgentError extends Error {
  readonly detail: unknown;

  constructor(message: string, detail?: unknown) {
    super(message);
    this.name = 'GeminiAgentError';
    this.detail = detail;
  }
}

export type AgentTool = {
  name: string;
  description: string;
  /** JSON Schema (sottoinsieme OpenAPI accettato da Gemini). */
  parameters: Record<string, unknown>;
  execute(args: Record<string, unknown>): Promise<unknown>;
};

export type AgentHistoryMessage = {
  role: 'user' | 'model';
  text: string;
};

export type AgentRunResult = {
  text: string;
  toolCalls: Array<{ name: string; ok: boolean }>;
  inputTokens: number;
  outputTokens: number;
  steps: number;
};

type GeminiPart = {
  text?: string;
  functionCall?: { name?: string; args?: Record<string, unknown> };
  [key: string]: unknown;
};

type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] };

type GeminiResponse = {
  candidates?: Array<{ content?: { role?: string; parts?: GeminiPart[] }; finishReason?: string }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
};

export async function runGeminiAgent(input: {
  apiKey: string;
  model: string;
  system: string;
  history: AgentHistoryMessage[];
  tools: AgentTool[];
  fetcher?: typeof fetch;
  baseUrl?: string;
  maxSteps?: number;
  timeoutMs?: number;
}): Promise<AgentRunResult> {
  const fetcher = input.fetcher ?? fetch;
  const baseUrl = input.baseUrl ?? 'https://generativelanguage.googleapis.com';
  const maxSteps = input.maxSteps ?? 6;
  const toolsByName = new Map(input.tools.map((tool) => [tool.name, tool]));
  const contents = toContents(input.history);

  if (contents.length === 0) {
    throw new GeminiAgentError('Agent needs at least one user message');
  }

  const toolCalls: AgentRunResult['toolCalls'] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  for (let step = 1; step <= maxSteps; step += 1) {
    const response = await fetcher(
      `${baseUrl}/v1beta/models/${encodeURIComponent(input.model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': input.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.system }] },
          contents,
          tools: [
            {
              functionDeclarations: input.tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
              })),
            },
          ],
          toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
          generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
        }),
        signal: AbortSignal.timeout(input.timeoutMs ?? 30_000),
      },
    );

    const raw = await response.text();
    let body: GeminiResponse = {};

    try {
      body = JSON.parse(raw) as GeminiResponse;
    } catch {
      body = {};
    }

    if (!response.ok) {
      throw new GeminiAgentError('Gemini request failed', { status: response.status });
    }

    inputTokens += body.usageMetadata?.promptTokenCount ?? 0;
    outputTokens += body.usageMetadata?.candidatesTokenCount ?? 0;

    const modelContent = body.candidates?.[0]?.content;
    const parts = modelContent?.parts ?? [];
    const calls = parts.filter((part) => part.functionCall?.name);

    if (calls.length === 0) {
      const text = parts
        .map((part) => part.text ?? '')
        .join('')
        .trim();

      if (!text) {
        throw new GeminiAgentError('Gemini returned an empty answer', {
          finishReason: body.candidates?.[0]?.finishReason ?? null,
        });
      }

      return { text, toolCalls, inputTokens, outputTokens, steps: step };
    }

    // Il contenuto del modello va rimandato identico (include eventuali firme di ragionamento).
    contents.push({ role: 'model', parts });

    const responseParts: GeminiPart[] = [];

    for (const call of calls) {
      const name = call.functionCall?.name ?? '';
      const tool = toolsByName.get(name);
      let result: unknown;

      if (!tool) {
        result = { ok: false, error: 'unknown_tool' };
      } else {
        try {
          result = await tool.execute(call.functionCall?.args ?? {});
        } catch {
          // Mai far trapelare dettagli interni al modello.
          result = { ok: false, error: 'tool_failed' };
        }
      }

      toolCalls.push({ name, ok: isOk(result) });
      responseParts.push({ functionResponse: { name, response: { result } } });
    }

    contents.push({ role: 'user', parts: responseParts });
  }

  throw new GeminiAgentError('Gemini agent exceeded the maximum number of steps');
}

function isOk(result: unknown): boolean {
  return !(typeof result === 'object' && result !== null && (result as { ok?: unknown }).ok === false);
}

/** Gemini vuole la conversazione che inizia con l'utente: unisce i turni consecutivi dello stesso ruolo. */
function toContents(history: AgentHistoryMessage[]): GeminiContent[] {
  const contents: GeminiContent[] = [];

  for (const message of history) {
    const text = message.text.trim();

    if (!text) {
      continue;
    }

    const last = contents[contents.length - 1];

    if (!last && message.role === 'model') {
      continue;
    }

    if (last && last.role === message.role) {
      last.parts.push({ text });
    } else {
      contents.push({ role: message.role, parts: [{ text }] });
    }
  }

  return contents;
}
