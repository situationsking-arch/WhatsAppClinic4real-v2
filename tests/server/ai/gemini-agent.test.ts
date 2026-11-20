import { describe, expect, it } from 'vitest';
import { runGeminiAgent } from '@/server/ai/gemini-agent';

function reply(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe('runGeminiAgent', () => {
  it('runs a tool, echoes the model turn verbatim and returns the final text', async () => {
    const requests: Array<{ url: string; body: any }> = [];
    let n = 0;
    const fetcher = (async (url: string, init: { body: string }) => {
      requests.push({ url, body: JSON.parse(init.body) });
      n += 1;
      return n === 1
        ? reply({
            candidates: [
              { content: { role: 'model', parts: [{ functionCall: { name: 't', args: {} }, thoughtSignature: 'sig' }] } },
            ],
          })
        : reply({ candidates: [{ content: { role: 'model', parts: [{ text: 'fini' }] } }] });
    }) as unknown as typeof fetch;

    const result = await runGeminiAgent({
      apiKey: 'k',
      model: 'm',
      system: 's',
      history: [{ role: 'model', text: 'dropped' }, { role: 'user', text: 'a' }, { role: 'user', text: 'b' }],
      tools: [{ name: 't', description: 'd', parameters: { type: 'object' }, execute: async () => ({ ok: true }) }],
      fetcher,
    });

    expect(result.text).toBe('fini');
    expect(requests[0]?.body.contents).toHaveLength(1);
    expect(requests[0]?.url.includes('key=')).toBe(false);
    expect(requests[1]?.body.contents[1].parts[0].thoughtSignature).toBe('sig');
    expect(result.toolCalls).toEqual([{ name: 't', ok: true }]);
  });

  it('does not leak tool exception details to the model', async () => {
    let n = 0;
    const bodies: string[] = [];
    const fetcher = (async (_url: string, init: { body: string }) => {
      bodies.push(init.body);
      n += 1;
      return n === 1
        ? reply({ candidates: [{ content: { parts: [{ functionCall: { name: 't', args: {} } }] } }] })
        : reply({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
    }) as unknown as typeof fetch;

    const result = await runGeminiAgent({
      apiKey: 'k',
      model: 'm',
      system: 's',
      history: [{ role: 'user', text: 'x' }],
      tools: [
        {
          name: 't',
          description: 'd',
          parameters: { type: 'object' },
          execute: async () => {
            throw new Error('db password leak');
          },
        },
      ],
      fetcher,
    });

    expect(result.toolCalls).toEqual([{ name: 't', ok: false }]);
    expect(bodies[1]?.includes('leak')).toBe(false);
  });
});
