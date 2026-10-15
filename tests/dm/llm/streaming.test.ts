import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateJson } from '../../../src/dm/llm/client';
import { clearModelMetrics, getModelMetrics } from '../../../src/dm/llm/metrics';
import { ModelScheduler } from '../../../src/dm/llm/scheduler';
import { BackgroundRequests } from '../../../src/dm/llm/backgroundRequests';
import { readModelStream } from '../../../src/dm/llm/stream';
import { createNativeTransport, type NativeHttp } from '../../../src/android/native';
import { installModelTransport } from '../../../src/dm/llm/transport';
import type { ApiConfig } from '../../../src/types/game';

const config: ApiConfig = { provider: 'mimo', protocol: 'responses', model: 'mimo-v2.6-flash', endpoint: 'https://unit.test/v1', apiKey: 'private-test-key' };
const request = { label: 'Narrator', instructions: 'Return JSON', schemaName: 'test', schema: { type: 'object' }, input: [{ role: 'user' as const, content: '观察' }] };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function sse(events: unknown[], step = 7) {
  const bytes = new TextEncoder().encode(events.map(event => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\r\n\r\n`).join(''));
  return new Response(new ReadableStream<Uint8Array>({ start(controller) {
    for (let offset = 0; offset < bytes.length; offset += step) controller.enqueue(bytes.slice(offset, offset + step));
    controller.close();
  } }), { headers: { 'Content-Type': 'text/event-stream' } });
}
afterEach(() => { vi.unstubAllGlobals(); installModelTransport((url, init) => fetch(url, init)); clearModelMetrics(); });

describe('complete model streams and private performance observations', () => {
  it('assembles Responses Unicode, tool arguments and opaque reasoning across arbitrary byte boundaries', async () => {
    const args = JSON.stringify({ narrative: '雨夜🌧', proposals: [] });
    const reasoning = { type: 'reasoning', id: 'rs1', content: [{ type: 'reasoning_text', text: 'private reasoning' }] };
    const events = [
      { type: 'response.created' },
      { type: 'response.reasoning_text.delta', delta: 'private reasoning' },
      { type: 'response.output_item.added', output_index: 0, item: { type: 'function_call', call_id: 'c1', name: 'complete_turn', arguments: '' } },
      { type: 'response.function_call_arguments.delta', output_index: 0, delta: args },
      { type: 'response.completed', response: { status: 'completed', output: [reasoning, { type: 'function_call', call_id: 'c1', name: 'complete_turn', arguments: args }],
        usage: { input_tokens: 123, input_tokens_details: { cached_tokens: 64 }, output_tokens: 32, output_tokens_details: { reasoning_tokens: 20 } } } }
    ];
    const progress: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async () => sse(events, 1)));
    const result = await generateJson(config, { ...request, onProgress: phase => progress.push(phase) });
    expect(result.toolCalls[0].arguments).toEqual({ narrative: '雨夜🌧', proposals: [] });
    expect(result.outputItems).toContainEqual({ type: 'reasoning', data: reasoning });
    expect(result.rawText).not.toContain('private reasoning');
    expect(progress).toContain('reasoning'); expect(progress).toContain('receiving');
    expect(getModelMetrics()[0]).toMatchObject({ outcome: 'complete', inputTokens: 123, cachedTokens: 64, reasoningTokens: 20 });
    expect(JSON.stringify(getModelMetrics())).not.toMatch(/private-test-key|unit\.test|private reasoning|雨夜/);
  });

  it('assembles Chat tool fragments and retains reasoning for the next private tool exchange', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sse([
      { choices: [{ index: 0, delta: { reasoning_content: 'keep private', tool_calls: [{ index: 0, id: 'call1', function: { name: 'request_check', arguments: '{"player":' } }] } }] },
      { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '"亨利","skill":"聆听","difficulty":"普通"}' } }] }, finish_reason: 'tool_calls' }] },
      { choices: [], usage: { prompt_tokens: 100, completion_tokens: 50, completion_tokens_details: { reasoning_tokens: 20 } } }, '[DONE]'
    ])));
    const result = await generateJson({ ...config, protocol: 'chat-completions' }, request);
    expect(result.toolCalls[0]).toMatchObject({ name: 'request_check', arguments: { player: '亨利', skill: '聆听' } });
    expect(result.outputItems[0]).toMatchObject({ reasoning: 'keep private' });
    expect(getModelMetrics()[0]).toMatchObject({ inputTokens: 100, outputTokens: 50 });
  });

  it('rejects a disconnected partial reply rather than exposing or committing it', async () => {
    await expect(readModelStream(sse([{ type: 'response.output_text.delta', delta: '{"narrative":"未完成' }]), 'responses')).rejects.toThrow('未能取得模型服务响应');
  });

  it('retains a completed tool that a compatible gateway omits from its final message snapshot', async () => {
    const result = await readModelStream(sse([
      { type: 'response.output_item.added', output_index: 0, item: { id: 'fc1', type: 'function_call', call_id: 'check1', name: 'request_check', arguments: '' } },
      { type: 'response.function_call_arguments.done', output_index: 0, arguments: '{"player":"亨利","skill":"侦查","difficulty":"普通"}' },
      { type: 'response.completed', response: { status: 'completed', output: [{ id: 'msg1', type: 'message', content: [{ type: 'output_text', text: '{}' }] }] } }
    ]), 'responses');
    expect(result.output).toContainEqual(expect.objectContaining({ call_id: 'check1', name: 'request_check', arguments: expect.stringContaining('亨利') }));
  });

  it('accepts ordinary JSON from compatible servers even when streaming was requested', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'completed', output_text: '{"narrative":"完整"}' }))));
    expect((await generateJson(config, request)).rawText).toContain('完整');
  });

  it('finishes at the explicit Responses completion instead of waiting for an idle connection to close', async () => {
    const cancelled = vi.fn();
    const response = new Response(new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"type":"response.completed","response":{"status":"completed","output_text":"{}"}}\n\n'));
    }, cancel: cancelled }), { headers: { 'Content-Type': 'text/event-stream' } });
    await expect(readModelStream(response, 'responses')).resolves.toMatchObject({ output_text: '{}' });
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it('does not accept well-formed partial prose from a failed provider stream', async () => {
    await expect(readModelStream(sse([{ type: 'response.failed', response: { output_text: '{"narrative":"partial"}' } }]), 'responses')).rejects.toThrow('未能取得模型服务响应');
  });

  it('receives native chunks before completion, then cancels the underlying request and reader', async () => {
    let callback!: Parameters<NonNullable<NativeHttp['stream']>>[1];
    const native: NativeHttp = { request: vi.fn(), cancel: vi.fn(async () => {}), stream: vi.fn(async (_options, received) => { callback = received; return 'callback1'; }) };
    const abort = new AbortController();
    const pending = createNativeTransport(native)('https://unit.test', { method: 'POST', body: '{"stream":true}', signal: abort.signal });
    callback({ status: 200, contentType: 'text/event-stream' });
    const response = await pending, reader = response.body!.getReader();
    callback({ chunk: 'data: {"type":"response.created"}\n\n' });
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('response.created');
    const remaining = reader.read(); abort.abort();
    await expect(remaining).rejects.toMatchObject({ name: 'AbortError' });
    expect(native.cancel).toHaveBeenCalledOnce();
    callback({ done: true });
  });
});

describe('foreground priority without losing background work', () => {
  it('reserves foreground capacity and holds new maintenance until the player response finishes', async () => {
    const scheduler = new ModelScheduler(), started: string[] = [], first = deferred<void>(), second = deferred<void>(), foreground = deferred<void>();
    const a = scheduler.run('background', undefined, async () => { started.push('a'); await first.promise; });
    const b = scheduler.run('background', undefined, async () => { started.push('b'); await second.promise; });
    const c = scheduler.run('background', undefined, async () => { started.push('c'); });
    const play = scheduler.run('foreground', undefined, async () => { started.push('play'); await foreground.promise; });
    await vi.waitFor(() => expect(started).toEqual(['a', 'b', 'play']));
    first.resolve(); await a; expect(started).not.toContain('c');
    foreground.resolve(); await play; await c; second.resolve(); await b;
    expect(started).toEqual(['a', 'b', 'play', 'c']);
  });

  it('cancels queued work and releases a running slot even if a broken provider ignores cancellation', async () => {
    const scheduler = new ModelScheduler(), activeAbort = new AbortController(), queuedAbort = new AbortController();
    const active = scheduler.run('foreground', activeAbort.signal, () => new Promise<void>(() => {}));
    const queued = scheduler.run('foreground', queuedAbort.signal, vi.fn());
    queuedAbort.abort(); await expect(queued).rejects.toMatchObject({ name: 'AbortError' });
    activeAbort.abort(); await expect(active).rejects.toMatchObject({ name: 'AbortError' });
    await expect(scheduler.run('foreground', undefined, async () => 'next')).resolves.toBe('next');
  });

  it('shares only identical in-flight work; cancelling one consumer keeps the other memory update alive', async () => {
    const shared = new BackgroundRequests(), result = deferred<string>(), abort = new AbortController();
    const work = vi.fn(async () => result.promise);
    const first = shared.run('same', abort.signal, work), second = shared.run('same', undefined, work);
    abort.abort(); await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    result.resolve('memory'); await expect(second).resolves.toBe('memory'); expect(work).toHaveBeenCalledOnce();
    await shared.run('same', undefined, async () => 'fresh');
    await expect(shared.run('different', undefined, async () => 'different')).resolves.toBe('different');
  });
});
