import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateJson } from '../../../src/dm/llm/client';
import { DM_TOOLS } from '../../../src/dm/tools';
import type { ApiConfig } from '../../../src/types/game';

const config: ApiConfig = { provider: 'mimo', protocol: 'responses', endpoint: 'https://unit.test/v1', apiKey: 'tp-test-only', model: 'mimo-v2.6-pro' };
const request = { label: 'unit', instructions: 'Return the scene as JSON.', input: [{ role: 'user' as const, content: '查看门廊。' }], schemaName: 'scene', schema: { type: 'object', properties: { narrative: { type: 'string' } }, required: ['narrative'], additionalProperties: false }, maxOutputTokens: 128 };
const reasoning = { id: 'rs_1', type: 'reasoning', summary: [], content: [{ type: 'reasoning_text', text: 'Private model reasoning.' }], status: 'completed' };
const tool = { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'request_check', arguments: '{"skill":"侦查","difficulty":"普通","player":"亨利"}' };
const reply = (body: object) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
afterEach(() => vi.unstubAllGlobals());

describe('MiMo structured output and tool continuation', () => {
  it('permits tool calls, preserves opaque reasoning and uses JSON mode for the final prose', async () => {
    const bodies: Record<string, any>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      bodies.push(JSON.parse(init.body));
      return reply(bodies.length === 1 ? { status: 'completed', output: [reasoning, tool] }
        : { status: 'completed', output: [reasoning, { type: 'message', content: [{ type: 'output_text', text: '{"narrative":"门廊里很安静。"}' }] }] });
    }));
    const first = await generateJson(config, { ...request, tools: [DM_TOOLS[0]] });
    expect(first.rawText).toBe('');
    expect(first.toolCalls).toHaveLength(1);
    expect(bodies[0].text.format).toEqual({ type: 'text' });
    expect(bodies[0].reasoning).toEqual({ effort: 'high' });
    expect(bodies[0].max_output_tokens).toBe(4224);
    expect(bodies[0].instructions).toContain(JSON.stringify(request.schema));
    const final = await generateJson(config, { ...request, input: [...request.input, ...first.outputItems, { type: 'function_call_output', callId: 'call_1', output: '{"pending":true}' }], useTools: false });
    expect(bodies[1].text.format).toEqual({ type: 'json_object' });
    expect(bodies[1].tools).toBeUndefined();
    expect(bodies[1].input).toContainEqual(reasoning);
    expect(bodies[1].input).toContainEqual(expect.objectContaining({ type: 'function_call', call_id: 'call_1' }));
    expect(final.rawText).toBe('{"narrative":"门廊里很安静。"}');
    expect(final.rawText).not.toContain('Private model');
  });
  it('retains chat reasoning alongside the tool calls instead of losing the required history field', async () => {
    const bodies: Record<string, any>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      bodies.push(JSON.parse(init.body));
      return reply({ choices: [{ finish_reason: 'stop', message: bodies.length === 1
        ? { content: null, reasoning_content: 'Private model reasoning.', tool_calls: [{ id: 'call_1', type: 'function', function: { name: tool.name, arguments: tool.arguments } }] }
        : { content: '{"narrative":"门廊里很安静。"}' } }] });
    }));
    const chat = { ...config, protocol: 'chat-completions' as const };
    const first = await generateJson(chat, { ...request, tools: [DM_TOOLS[0]] });
    await generateJson(chat, { ...request, input: [...request.input, ...first.outputItems, { type: 'function_call_output', callId: 'call_1', output: '{"pending":true}' }], useTools: false });
    expect(bodies[0].response_format).toEqual({ type: 'text' });
    expect(bodies[0].max_completion_tokens).toBe(4224);
    expect(bodies[0].max_tokens).toBeUndefined();
    expect(bodies[1].response_format).toEqual({ type: 'json_object' });
    expect(bodies[1].messages).toContainEqual(expect.objectContaining({ role: 'assistant', reasoning_content: 'Private model reasoning.', tool_calls: [expect.objectContaining({ id: 'call_1' })] }));
  });
});
