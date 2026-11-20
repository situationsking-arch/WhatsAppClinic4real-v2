import { describe, expect, it } from 'vitest';
import { GeminiGenerateContentClient, normalizeGeminiContents } from '@/server/ai/gemini-adapter';

describe('normalizeGeminiContents', () => {
  it('merges consecutive messages from the same role while preserving order', () => {
    expect(
      normalizeGeminiContents([
        { role: 'user', content: '  Bonjour ' },
        { role: 'user', content: 'مرحبا' },
        { role: 'assistant', content: 'Ahlan' },
        { role: 'assistant', content: 'Comment aider ?' },
        { role: 'user', content: 'Rendez-vous' },
      ]),
    ).toEqual([
      { role: 'user', parts: [{ text: 'Bonjour' }, { text: 'مرحبا' }] },
      { role: 'model', parts: [{ text: 'Ahlan' }, { text: 'Comment aider ?' }] },
      { role: 'user', parts: [{ text: 'Rendez-vous' }] },
    ]);
  });

  it('ignores empty messages and returns an empty list for empty history', () => {
    expect(normalizeGeminiContents([{ role: 'user', content: '  ' }])).toEqual([]);
    expect(normalizeGeminiContents([])).toEqual([]);
  });
});


describe('GeminiGenerateContentClient retries', () => {
  it('retries rate-limit responses with a bounded delay', async () => {
    let calls = 0;
    const delays: number[] = [];
    const client = new GeminiGenerateContentClient({
      apiKey: 'test-key',
      model: 'test-model',
      maxRetries: 2,
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
      fetcher: async () => {
        calls += 1;
        if (calls === 1) {
          return new Response(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED' } }), {
            status: 429,
            headers: { 'retry-after': '0' },
          });
        }
        return Response.json({
          modelVersion: 'test-model',
          candidates: [{ content: { parts: [{ text: 'Bonjour' }] } }],
          usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2 },
        });
      },
    });

    const result = await client.complete({
      system: 'Reply briefly',
      messages: [{ role: 'user', content: 'Bonjour' }],
      maxTokens: 20,
    });

    expect(calls).toBe(2);
    expect(delays).toEqual([0]);
    expect(result.text).toBe('Bonjour');
    expect(result.inputTokens).toBe(4);
    expect(result.outputTokens).toBe(2);
  });
});
