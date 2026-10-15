import { Capacitor, registerPlugin } from '@capacitor/core';
import { installGameStorage, type GameStorage } from '../platform/storage';
import { installModelTransport, type ModelTransport } from '../dm/llm/transport';

export const isNativeAndroid = () => Capacitor.getPlatform() === 'android';
export interface NativeStore {
  readAll(): Promise<{ values: Record<string, string>; unreadableRecords?: number }>;
  write(options: { key: string; value: string | null }): Promise<void>;
}
export interface NativeHttp {
  request(options: { id: string; url: string; method: string; headers: Record<string, string>; body: string }): Promise<{ status: number; body: string }>;
  cancel(options: { id: string }): Promise<void>;
  stream?(options: { id: string; url: string; method: string; headers: Record<string, string>; body: string },
    callback: (value: { status?: number; contentType?: string; chunk?: string; done?: boolean } | null,
      error?: { message?: string }) => void): Promise<string>;
}
const store = registerPlugin<NativeStore>('GameStorage');
const http = registerPlugin<NativeHttp>('AiTransport');

/** Native writes stay ordered. A failure is retained until a later successful rewrite. */
export function createNativeStorage(initial: Record<string, string>, native: NativeStore): GameStorage {
  const values = new Map(Object.entries(initial));
  const dirty = new Map<string, string | null>();
  let pending: Promise<void> = Promise.resolve();
  let failure: unknown = null;
  const queue = (key: string, value: string | null) => {
    if (!key.startsWith('trpg-') || key.length > 100 || (value?.length ?? 0) > 8_000_000) throw new Error('存储内容超出限制');
    dirty.set(key, value);
    pending = pending.then(async () => {
      if (!dirty.has(key)) return;
      const latest = dirty.get(key)!;
      try {
        await native.write({ key, value: latest });
        if (dirty.get(key) === latest) dirty.delete(key);
        if (!dirty.size) failure = null;
      } catch (error) { failure = error; }
    });
  };
  const drain = async () => {
    let current: Promise<void>;
    // A background snapshot or another store can join the queue while we wait.
    do { current = pending; await current; } while (current !== pending);
  };
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { queue(key, value); values.set(key, value); },
    removeItem: (key) => { queue(key, null); values.delete(key); },
    flush: async () => {
      await drain();
      if (failure) {
        for (const [key, value] of dirty) queue(key, value);
        await drain();
        if (failure) throw new Error('保存失败，请检查设备存储空间后重试。');
      }
    },
  };
}

let requestSequence = 0;
export function createNativeTransport(native: NativeHttp): ModelTransport {
  return (url, init) => new Promise((resolve, reject) => {
    const signal = init.signal;
    if (signal?.aborted) { reject(signal.reason ?? new DOMException('Aborted', 'AbortError')); return; }
    const id = `${Date.now()}-${++requestSequence}`;
    let settled = false;
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    let headersReceived = false;
    const cleanup = () => { settled = true; signal?.removeEventListener('abort', abort); };
    const fail = (error: unknown) => {
      if (settled) return;
      if (headersReceived) streamController?.error(error); else reject(error);
      cleanup();
    };
    const abort = () => {
      if (settled) return;
      void native.cancel({ id }).catch(() => undefined);
      fail(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, key) => { headers[key] = value; });
    let streaming = false;
    try { streaming = JSON.parse(typeof init.body === 'string' ? init.body : '{}').stream === true; } catch { /* ordinary request */ }
    if (streaming && native.stream) {
      const body = new ReadableStream<Uint8Array>({
        start: controller => { streamController = controller; },
        cancel: () => { if (!settled) { cleanup(); void native.cancel({ id }).catch(() => undefined); } }
      });
      void native.stream({ id, url, method: init.method ?? 'POST', headers, body: typeof init.body === 'string' ? init.body : '' }, (value, error) => {
        if (settled) return;
        if (error) { fail(new Error(error.message ?? '模型响应读取失败')); return; }
        if (!value) { fail(new Error('模型响应为空')); return; }
        if (value.status !== undefined && !headersReceived) {
          headersReceived = true;
          resolve(new Response([204, 205, 304].includes(value.status) ? null : body,
            { status: value.status, headers: { 'Content-Type': value.contentType ?? 'application/json' } }));
        }
        if (value.chunk && headersReceived) streamController?.enqueue(new TextEncoder().encode(value.chunk));
        if (value.done) {
          if (!headersReceived) { fail(new Error('模型响应缺少状态')); return; }
          streamController?.close(); cleanup();
        }
      }).catch(fail);
      return;
    }
    void native.request({ id, url, method: init.method ?? 'POST', headers, body: typeof init.body === 'string' ? init.body : '' })
      .then((result) => {
        if (settled) return;
        resolve(new Response([204, 205, 304].includes(result.status) ? null : result.body, { status: result.status }));
      }).catch(fail)
      .finally(cleanup);
  });
}

export async function initializeAndroidPlatform(): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  const initial = await store.readAll();
  installGameStorage(createNativeStorage(initial.values, store));
  installModelTransport(createNativeTransport(http));
  return Boolean(initial.unreadableRecords);
}
