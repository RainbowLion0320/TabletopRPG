type Priority = 'foreground' | 'background';
interface Job {
  priority: Priority;
  signal?: AbortSignal;
  start: () => void;
  abort: () => void;
}

/** Reserve one slot for play. Never cancel useful memory work to gain speed. */
export class ModelScheduler {
  private foreground = 0;
  private background = 0;
  private queue: Job[] = [];

  run<T>(priority: Priority, signal: AbortSignal | undefined, work: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const abort = () => {
        this.queue = this.queue.filter(item => item !== job);
        signal?.removeEventListener('abort', abort);
        reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
      };
      const job: Job = { priority, signal, abort, start: () => {
        signal?.removeEventListener('abort', abort);
        if (priority === 'foreground') this.foreground++; else this.background++;
        let finished = false;
        const release = () => {
          if (finished) return;
          finished = true;
          signal?.removeEventListener('abort', cancelRunning);
          if (priority === 'foreground') this.foreground--; else this.background--;
          this.drain();
        };
        const cancelRunning = () => { reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')); release(); };
        signal?.addEventListener('abort', cancelRunning, { once: true });
        void Promise.resolve().then(() => {
          if (signal?.aborted) throw signal.reason;
          return work();
        }).then(resolve, reject).finally(release);
      } };
      if (signal?.aborted) { abort(); return; }
      signal?.addEventListener('abort', abort, { once: true });
      this.queue.push(job);
      this.drain();
    });
  }

  private drain() {
    if (!this.foreground) {
      const foreground = this.queue.findIndex(job => job.priority === 'foreground');
      if (foreground >= 0) this.queue.splice(foreground, 1)[0].start();
    }
    // In-flight background calls may finish; new ones give the active player priority.
    if (this.queue.some(job => job.priority === 'foreground')) return;
    const backgroundLimit = this.foreground ? 1 : 2;
    while (this.background < backgroundLimit) {
      const background = this.queue.findIndex(job => job.priority === 'background');
      if (background < 0) break;
      this.queue.splice(background, 1)[0].start();
    }
  }
}

export const modelScheduler = new ModelScheduler();
