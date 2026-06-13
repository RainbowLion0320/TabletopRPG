import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateJson } from '../../../src/dm/llm/client';
import { DM_TOOLS } from '../../../src/dm/tools';
import type { ApiConfig } from '../../../src/types/game';

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    narrative: { type: 'string' }
  },
  required: ['narrative']
} satisfies Record<string, unknown>;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LLM provider adapters', () => {
  it('uses Responses request and response shapes for responses protocol', async () => {
    const config: ApiConfig = {
      provider: 'openai',
      protocol: 'responses',
      endpoint: 'https://unit.test/v1',
      apiKey: 'unit-key',
      model: 'gpt-test'
    };
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify({
        output_text: '{"narrative":"responses ok"}',
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: '{"narrative":"responses ok"}' }]
          },
          {
            type: 'function_call',
            id: 'fc_1',
            call_id: 'call_1',
            name: 'request_check',
            arguments: '{"skill":"侦查","difficulty":"普通","player":"亨利"}'
          }
        ]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateJson(config, {
      label: 'unit',
      instructions: 'system prompt',
      input: [{ role: 'user', content: 'hello' }],
      schemaName: 'unit_response',
      schema,
      maxOutputTokens: 128,
      tools: [DM_TOOLS[0]],
      useTools: true
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://unit.test/v1/responses');
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'gpt-test',
      instructions: 'system prompt',
      input: [{ role: 'user', content: 'hello' }],
      max_output_tokens: 128,
      store: false,
      tool_choice: 'auto'
    });
    expect(body.text).toMatchObject({
      format: { type: 'json_schema', name: 'unit_response', strict: true }
    });
    expect(body.tools).toEqual([
      expect.objectContaining({
        type: 'function',
        name: 'request_check'
      })
    ]);
    expect(result.rawText).toBe('{"narrative":"responses ok"}');
    expect(result.toolCalls).toEqual([
      {
        id: 'fc_1',
        callId: 'call_1',
        name: 'request_check',
        arguments: { skill: '侦查', difficulty: '普通', player: '亨利' }
      }
    ]);
  });

  it('uses Chat Completions request and response shapes for chat-compatible protocol', async () => {
    const config: ApiConfig = {
      provider: 'custom',
      protocol: 'chat-completions',
      endpoint: 'https://gateway.test/v1',
      apiKey: 'unit-key',
      model: 'gateway-model'
    };
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify({
        choices: [
          {
            message: {
              role: 'assistant',
              content: '{"narrative":"chat ok"}',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'request_check',
                    arguments: '{"skill":"聆听","difficulty":"困难","player":"艾达"}'
                  }
                }
              ]
            }
          }
        ]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateJson(config, {
      label: 'unit',
      instructions: 'system prompt',
      input: [{ role: 'user', content: 'hello' }],
      schemaName: 'unit_response',
      schema,
      maxOutputTokens: 128,
      tools: [DM_TOOLS[0]],
      useTools: true
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://gateway.test/v1/chat/completions');
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'gateway-model',
      messages: [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'hello' }
      ],
      max_tokens: 128,
      tool_choice: 'auto'
    });
    expect(body.response_format).toMatchObject({
      type: 'json_schema',
      json_schema: { name: 'unit_response', strict: true }
    });
    expect(body.tools).toEqual([
      expect.objectContaining({
        type: 'function',
        function: expect.objectContaining({ name: 'request_check' })
      })
    ]);
    expect(result.rawText).toBe('{"narrative":"chat ok"}');
    expect(result.toolCalls).toEqual([
      {
        id: 'call_1',
        callId: 'call_1',
        name: 'request_check',
        arguments: { skill: '聆听', difficulty: '困难', player: '艾达' }
      }
    ]);
  });
});
