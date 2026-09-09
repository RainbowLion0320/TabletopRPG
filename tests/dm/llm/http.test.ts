import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiConnectionError, AiHttpError, AiResponseFormatError } from '../../../src/dm/llm/errors';
import { requestJsonResponse } from '../../../src/dm/llm/http';

afterEach(() => vi.unstubAllGlobals());

const request = (signal?: AbortSignal) => requestJsonResponse('https://unit.test', { signal }, 'unit');

describe('LLM HTTP error classification', () => {
  it.each([
    ['<html>Bad gateway</html>', 502],
    ['null', 401],
    ['[]', 429]
  ])('keeps the HTTP status for non-object or non-JSON error bodies (%s)', async (body, status) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status })));
    await expect(request()).rejects.toMatchObject({ name: AiHttpError.name, status });
  });

  it('still classifies malformed successful responses as format errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>unexpected body</html>')));
    await expect(request()).rejects.toBeInstanceOf(AiResponseFormatError);
  });

  it('reports a dropped response body as a connection failure', async () => {
    const cause = new TypeError('terminated');
    const response = new Response('');
    vi.spyOn(response, 'text').mockRejectedValue(cause);
    vi.stubGlobal('fetch', vi.fn(async () => response));
    await expect(request()).rejects.toMatchObject({ name: AiConnectionError.name, cause });
  });

  it('preserves the cancellation reason if reading the body is aborted', async () => {
    const controller = new AbortController();
    const cause = new Error('Session replaced');
    const response = new Response('');
    vi.spyOn(response, 'text').mockImplementation(async () => {
      controller.abort(cause);
      throw cause;
    });
    vi.stubGlobal('fetch', vi.fn(async () => response));
    await expect(request(controller.signal)).rejects.toBe(cause);
  });
});
