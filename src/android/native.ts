import { Capacitor, registerPlugin } from '@capacitor/core';
import { installGameStorage, type GameStorage } from '../platform/storage';
import { installModelTransport, type ModelTransport } from '../dm/llm/transport';

export const isNativeAndroid = () => Capacitor.getPlatform() === 'android';
export interface NativeStore {
  readAll(): Promise<{ values: Record<string, string> }>;
  write(options: { key: string; value: string | null }): Promise<void>;
}
export interface NativeHttp {
  request(options: { id: string; url: string; method: string; headers: Record<string, string>; body: string }): Promise<{ status: number; body: string }>;
  cancel(options: { id: string }): Promise<void>;
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
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { queue(key, value); values.set(key, value); },
    removeItem: (key) => { queue(key, null); values.delete(key); },
    flush: async () => {
      await pending;
      if (failure) {
        for (const [key, value] of dirty) queue(key, value);
        await pending;
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
    const abort = () => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', abort);
      void native.cancel({ id }).catch(() => undefined);
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, key) => { headers[key] = value; });
    void native.request({ id, url, method: init.method ?? 'POST', headers, body: typeof init.body === 'string' ? init.body : '' })
      .then((result) => {
        if (settled) return;
        resolve(new Response([204, 205, 304].includes(result.status) ? null : result.body, { status: result.status }));
      }).catch((error: unknown) => { if (!settled) reject(error); })
      .finally(() => { settled = true; signal?.removeEventListener('abort', abort); });
  });
}

export async function initializeAndroidPlatform(): Promise<void> {
  if (!isNativeAndroid()) return;
  const initial = await store.readAll();
  installGameStorage(createNativeStorage(initial.values, store));
  installModelTransport(createNativeTransport(http));
}
