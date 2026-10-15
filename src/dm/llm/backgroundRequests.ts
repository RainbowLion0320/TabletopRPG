interface SharedRequest {
  controller: AbortController;
  consumers: number;
  done: boolean;
  promise: Promise<unknown>;
}

/** Share identical in-flight maintenance only. No completed cache or lost turns. */
export class BackgroundRequests {
  private pending = new Map<string, SharedRequest>();

  run<T>(key: string, signal: AbortSignal | undefined, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    let shared = this.pending.get(key);
    if (!shared || shared.controller.signal.aborted) {
      const controller = new AbortController();
      shared = { controller, consumers: 0, done: false, promise: Promise.resolve().then(() => work(controller.signal)) };
      this.pending.set(key, shared);
      const entry = shared;
      void shared.promise.then(() => { entry.done = true; }, () => { entry.done = true; });
      void shared.promise.finally(() => { if (this.pending.get(key) === entry) this.pending.delete(key); }).catch(() => undefined);
    }
    const entry = shared;
    entry.consumers++;
    return new Promise<T>((resolve, reject) => {
      let finished = false;
      const release = () => {
        if (finished) return false;
        finished = true;
        signal?.removeEventListener('abort', abort);
        if (--entry.consumers === 0 && !entry.done) entry.controller.abort(new DOMException('No active consumers', 'AbortError'));
        return true;
      };
      const abort = () => { if (release()) reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')); };
      signal?.addEventListener('abort', abort, { once: true });
      void entry.promise.then(value => { if (release()) resolve(value as T); }, error => { if (release()) reject(error); });
    });
  }
}

export const backgroundRequests = new BackgroundRequests();
